import { randomUUID } from "node:crypto";
import type { StateStore, Repositories } from "@/server/state/repositories";
import {
  StateFailure,
  type StateEvaluation,
  type StateVersion,
} from "@/lib/state/types";
import type {
  InteractiveAuthorization,
  RepairResult,
  RepairStatus,
} from "@/lib/interactive/types";
import type { QlooProvider } from "@/server/qloo/contracts";
import { hash } from "@/server/state/hash";
import { isResolvedProfile } from "@/server/taste/invariants";
import { stateDecision, applicable } from "@/server/state/policy";
import { discover, evaluateAction } from "@/server/taste/service";
import {
  DEMO_OPERATION_TIMEOUT_MS,
  QLOO_TIMEOUT_MS,
} from "@/lib/config/qloo-budget";
import { MAX_PROVIDER_CALLS_PER_REQUEST } from "@/server/qloo/client";
import { interactionInput } from "./validation";
import { planClarification, resolveClarification } from "./planner";
export const REPAIR_CALL_LIMIT = 4;
export class InteractiveService {
  constructor(
    readonly store: StateStore,
    readonly clock = () => new Date().toISOString(),
    readonly monotonic = () => Date.now(),
  ) {}
  private async authorize(r: Repositories, token: string) {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new StateFailure("SESSION_EXPIRED");
    const session = await r.sessions.find(hash(token), true);
    if (!session || session.expiresAt <= this.clock())
      throw new StateFailure("SESSION_EXPIRED");
    const profile = await r.states.profile(session.profileId, true);
    if (!profile || profile.expiresAt <= this.clock())
      throw new StateFailure("SESSION_EXPIRED");
    return { session, profile };
  }
  private async root(r: Repositories, profileId: string, id: string) {
    const e = await r.receipts.find(profileId, id);
    if (!e) throw new StateFailure("NOT_FOUND");
    const state = await r.states.version(profileId, e.stateVersion);
    if (!state || state.stateHash !== e.stateHash)
      throw new StateFailure("INVALID_INPUT");
    return { e, state };
  }
  private async parent(
    r: Repositories,
    profileId: string,
    e: StateEvaluation,
    id?: string,
  ) {
    if (!id) return undefined;
    const p = await r.clarifications.find(profileId, id);
    if (
      !p ||
      p.evaluationId !== e.evaluationId ||
      p.stateVersion !== e.stateVersion
    )
      throw new StateFailure("NOT_FOUND");
    return p.result;
  }
  private async consume(
    r: Repositories,
    session: { tokenHash: string; mutations: number },
  ) {
    if (session.mutations >= 100) throw new StateFailure("RATE_LIMITED");
    await r.sessions.consume(session.tokenHash);
  }
  async plan(token: string, raw: unknown) {
    const q = interactionInput(raw, "plan");
    if (!q) throw new StateFailure("INVALID_INPUT");
    return this.store.transaction(async (r) => {
      const { profile } = await this.authorize(r, token);
      const { e, state } = await this.root(
          r,
          profile.profileId,
          q.evaluationId,
        ),
        parent = await this.parent(
          r,
          profile.profileId,
          e,
          q.parentClarificationId,
        );
      return planClarification(e, state, profile.currentStateVersion, parent);
    });
  }
  async answer(
    token: string,
    raw: unknown,
    requestId: string,
  ): Promise<InteractiveAuthorization> {
    const q = interactionInput(raw, "answer");
    if (!q || !q.answer) throw new StateFailure("INVALID_INPUT");
    return this.store.transaction(async (r) => {
      const { profile, session } = await this.authorize(r, token),
        payloadHash = hash(q),
        existing = await r.clarifications.byKey(
          profile.profileId,
          q.idempotencyKey,
        );
      if (existing) {
        if (existing.payloadHash !== payloadHash)
          throw new StateFailure("IDEMPOTENCY_KEY_CONFLICT");
        return existing.result;
      }
      const { e, state } = await this.root(
        r,
        profile.profileId,
        q.evaluationId,
      );
      if (
        profile.currentStateVersion !== e.stateVersion ||
        q.expectedStateVersion !== e.stateVersion
      )
        throw new StateFailure("STATE_VERSION_CONFLICT");
      const parent = await this.parent(
          r,
          profile.profileId,
          e,
          q.parentClarificationId,
        ),
        plan = planClarification(e, state, profile.currentStateVersion, parent);
      if (
        plan.status !== "ACTIONABLE" ||
        plan.planId !== q.planId ||
        !plan.factor
      )
        throw new StateFailure("INVALID_INPUT");
      const resolved = resolveClarification(e, state, plan, q.answer!, parent),
        id = randomUUID(),
        createdAt = this.clock();
      const result: InteractiveAuthorization = {
        schemaVersion: "interactive-authorization-v1",
        interactionId: id,
        originalEvaluation: e,
        parentClarificationId: parent?.interactionId ?? null,
        plan,
        answer: q.answer!,
        context: resolved.context,
        finalDecision: resolved.decision,
        capturedEvidenceReference: e.evaluationId,
        stateVersion: e.stateVersion,
        stateHash: e.stateHash,
        provenance: {
          source: "EXPLICIT_INTERACTION",
          answeredAt: createdAt,
          requestId,
        },
        evidenceSource: "captured",
      };
      await r.clarifications.insert({
        id,
        profileId: profile.profileId,
        evaluationId: e.evaluationId,
        stateVersion: e.stateVersion,
        parentId: parent?.interactionId ?? null,
        factor: plan.factor.kind,
        plan,
        answer: q.answer!,
        result,
        key: q.idempotencyKey,
        payloadHash,
        createdAt,
      });
      await this.consume(r, session);
      return result;
    });
  }
  async repair(
    token: string,
    raw: unknown,
    factory: () => QlooProvider,
    requestId: string,
  ): Promise<RepairResult> {
    const q = interactionInput(raw, "repair");
    if (!q) throw new StateFailure("INVALID_INPUT");
    return this.store.transaction(async (r) => {
      const { profile, session } = await this.authorize(r, token),
        payloadHash = hash(q),
        existing = await r.repairs.byKey(profile.profileId, q.idempotencyKey);
      if (existing) {
        if (existing.payloadHash !== payloadHash)
          throw new StateFailure("IDEMPOTENCY_KEY_CONFLICT");
        return existing.result;
      }
      const { e, state } = await this.root(
        r,
        profile.profileId,
        q.evaluationId,
      );
      if (
        profile.currentStateVersion !== e.stateVersion ||
        q.expectedStateVersion !== e.stateVersion
      )
        return this.emptyRepair(
          e,
          state,
          "STALE",
          "STATE_VERSION_CONFLICT",
          requestId,
        );
      await this.consume(r, session);
      const result = this.emptyRepair(
        e,
        state,
        "NO_VERIFIED_REPAIR_WITHIN_BOUND",
        "No verified repair was found within the bounded search.",
        requestId,
      );
      if (e.decision.outcome !== "REJECT") {
        result.status = "NO_VERIFIABLE_REPAIR";
        result.reason =
          "Repair is supported only for an original REJECT evaluation.";
      } else if (
        e.context.price ||
        state.entries.some(
          (s) =>
            s.constraint?.kind === "MAX_PRICE" &&
            applicable(s, e.action.candidate, e.context, e.evaluatedAt),
        )
      ) {
        result.status = "NO_VERIFIABLE_REPAIR";
        result.reason =
          "No authoritative alternative candidate price is available.";
        result.condition =
          "A replacement requires its own explicit verified same-currency price at or below every applicable maximum; the original candidate price cannot transfer.";
      } else {
        const signals = state.entries
          .filter((s) => s.kind === "EXPLICIT_LIKE")
          .map((s) => s.entity);
        if (!isResolvedProfile(signals))
          throw new StateFailure("INVALID_INPUT");
        const started = this.monotonic();
        let calls = 0;
        try {
          const provider = factory();
          const invoke = async <T>(fn: () => Promise<T>) => {
            if (
              calls >=
                Math.min(REPAIR_CALL_LIMIT, MAX_PROVIDER_CALLS_PER_REQUEST) ||
              this.monotonic() - started >= DEMO_OPERATION_TIMEOUT_MS
            )
              throw Error("bounded provider unavailable");
            calls++;
            return fn();
          };
          const bounded: QlooProvider = {
            resolve: (x) => invoke(() => provider.resolve(x)),
            entities: (ids) => invoke(() => provider.entities(ids)),
            infer: (x) => invoke(() => provider.infer(x)),
          };
          const found = await discover(
            bounded,
            signals.map((s) => s.id),
            e.context.domain,
          );
          if (found.status === "unavailable") {
            result.status =
              found.reason === "no_evidence"
                ? "NO_VERIFIED_REPAIR_WITHIN_BOUND"
                : "UNAVAILABLE";
            result.reason = found.reason;
          } else {
            const candidates = [...found.data.candidates];
            if (
              candidates.some(
                (c) => !Number.isSafeInteger(c.rank) || c.rank < 1,
              )
            )
              throw Error("invalid rank");
            candidates.sort(
              (a, b) =>
                a.rank - b.rank || a.entity.id.localeCompare(b.entity.id),
            );
            result.method.discovered = candidates.map((c) => ({
              id: c.entity.id,
              rank: c.rank,
            }));
            result.method.discoveryProvenance = found.data.provenance;
            const candidate = candidates.find(
              (c) =>
                c.entity.id !== e.action.candidate.id &&
                stateDecision(
                  state,
                  c.entity,
                  e.context,
                  { status: "unavailable", reason: "no_evidence" },
                  e.evaluatedAt,
                ).outcome !== "REJECT",
            );
            if (candidate) {
              if (
                state.entries.some(
                  (s) =>
                    s.constraint?.kind === "MAX_PRICE" &&
                    applicable(s, candidate.entity, e.context, e.evaluatedAt),
                )
              ) {
                result.status = "NO_VERIFIABLE_REPAIR";
                result.reason =
                  "Replacement-specific maximum price cannot be verified.";
                result.condition =
                  "Supply a verified price for the replacement; no price is invented.";
              } else if (
                DEMO_OPERATION_TIMEOUT_MS - (this.monotonic() - started) <
                2 * QLOO_TIMEOUT_MS + 1000
              ) {
                result.status = "UNAVAILABLE";
                result.reason = "timeout";
              } else {
                const checked: QlooProvider = {
                  ...bounded,
                  async entities(ids) {
                    const looked = await bounded.entities(ids);
                    if (
                      looked.status === "available" &&
                      (!Array.isArray(looked.data) ||
                        looked.data.find((x) => x.id === candidate.entity.id)
                          ?.type !== e.context.domain)
                    )
                      return {
                        status: "unavailable",
                        reason: "invalid_response",
                      };
                    return looked;
                  },
                };
                const cultural = await evaluateAction(
                  checked,
                  signals.map((s) => s.id),
                  candidate.entity.id,
                  requestId,
                  e.context.key,
                );
                if (cultural.status === "unavailable") {
                  result.status = "UNAVAILABLE";
                  result.reason = cultural.reason;
                } else {
                  const verification: StateEvaluation = {
                    schemaVersion: "taste-state-evaluation-v1",
                    evaluationId: randomUUID(),
                    profileId: e.profileId,
                    stateVersion: e.stateVersion,
                    stateHash: e.stateHash,
                    agentId: e.agentId,
                    action: {
                      kind: "SELECT_ENTITY",
                      candidate: cultural.data.candidate,
                    },
                    context: structuredClone(e.context),
                    decision: stateDecision(
                      state,
                      cultural.data.candidate,
                      e.context,
                      cultural,
                      e.evaluatedAt,
                    ),
                    cultural,
                    culturalRequest: "REQUESTED",
                    requestId,
                    evaluatedAt: this.clock(),
                    source: "live",
                  };
                  result.verification = verification;
                  result.status =
                    verification.decision.outcome === "ALLOW" ||
                    verification.decision.outcome === "ASK"
                      ? "REPAIR_AVAILABLE"
                      : "NO_VERIFIED_REPAIR_WITHIN_BOUND";
                  result.reason =
                    result.status === "REPAIR_AVAILABLE"
                      ? "One candidate substitution verified under unchanged rules."
                      : "The single verified candidate remains rejected.";
                  if (result.status === "REPAIR_AVAILABLE")
                    result.changeSet = [
                      {
                        field: "candidate",
                        from: e.action.candidate.id,
                        to: cultural.data.candidate.id,
                      },
                    ];
                }
              }
            }
          }
        } catch {
          result.status = "UNAVAILABLE";
          result.reason = "provider_error";
        } finally {
          result.method.providerCalls = calls;
        }
      }
      await this.authorize(r, token);
      if (result.verification) {
        const v = result.verification;
        await r.proposals.insert(v);
        if (v.cultural.status === "available")
          await r.evidence.insert({
            bundleId: v.evaluationId,
            profileId: v.profileId,
            stateVersion: v.stateVersion,
            contractVersion: "qloo-event-m1",
            requestedAt: result.createdAt,
            receivedAt: v.cultural.data.qlooEvidence.provenance.fetchedAt,
            completeness: v.cultural.data.explainability.status,
            stateSignalIds: state.entries
              .filter((s) => s.kind === "EXPLICIT_LIKE")
              .map((s) => s.signalId)
              .sort(),
            receipt: v.cultural.data,
          });
        await r.receipts.insert(v);
      }
      await r.repairs.insert({
        id: result.repairId,
        profileId: e.profileId,
        evaluationId: e.evaluationId,
        stateVersion: e.stateVersion,
        verificationId: result.verification?.evaluationId ?? null,
        status: result.status,
        result,
        key: q.idempotencyKey,
        payloadHash,
        createdAt: result.createdAt,
      });
      return result;
    });
  }
  private emptyRepair(
    e: StateEvaluation,
    state: StateVersion,
    status: RepairStatus,
    reason: string,
    requestId: string,
  ): RepairResult {
    return {
      schemaVersion: "repair-plan-v1",
      repairId: randomUUID(),
      originalEvaluation: e,
      stateVersion: e.stateVersion,
      status,
      reason,
      method: {
        kind: "BOUNDED_CANDIDATE_SUBSTITUTION",
        structuralCost: 1,
        maxCandidates: 1,
        maxProviderCalls: 4,
        providerCalls: 0,
        ordering: "DISCOVERY_RANK_THEN_ID",
        discovered: [],
      },
      preservedConstraints: state.entries
        .filter((s) => s.constraint)
        .map((s) => s.signalId)
        .sort(),
      changeSet: [],
      evidenceSource: "captured",
      createdAt: this.clock(),
      requestId,
    };
  }
  async replay(token: string, id: string, kind: "clarification" | "repair") {
    return this.store.transaction(async (r) => {
      const { profile } = await this.authorize(r, token);
      const record =
        kind === "clarification"
          ? await r.clarifications.find(profile.profileId, id)
          : await r.repairs.find(profile.profileId, id);
      if (!record) throw new StateFailure("NOT_FOUND");
      return record.result;
    });
  }
}
