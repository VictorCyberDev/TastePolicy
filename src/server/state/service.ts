import { randomBytes, randomUUID } from "node:crypto";
import type { StateStore, Repositories } from "./repositories";
import { hash } from "./hash";
import {
  StateFailure,
  type StateVersion,
  type StateEntry,
  type MutationResult,
  type StateEvaluation,
} from "@/lib/state/types";
import { mutationInput, evaluationInput } from "./validation";
import { stateDecision } from "./policy";
import type { QlooProvider } from "@/server/qloo/contracts";
import { evaluateAction } from "@/server/taste/service";
import { isResolvedProfile } from "@/server/taste/invariants";
import { readCapturedReceipt } from "@/lib/proof/receipt";
const TTL = 24 * 60 * 60 * 1000;
export function stateHash(entries: StateEntry[]) {
  return hash(
    [...entries].sort((a, b) => a.signalId.localeCompare(b.signalId)),
  );
}
export class TasteStateService {
  constructor(
    readonly store: StateStore,
    readonly clock = () => new Date().toISOString(),
  ) {}
  private async authorize(r: Repositories, token: string, lock = false) {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new StateFailure("SESSION_EXPIRED");
    const session = await r.sessions.find(hash(token), lock);
    if (!session || session.expiresAt <= this.clock())
      throw new StateFailure("SESSION_EXPIRED");
    const profile = await r.states.profile(session.profileId, lock);
    if (!profile || profile.expiresAt <= this.clock())
      throw new StateFailure("SESSION_EXPIRED");
    return { session, profile };
  }
  async createSession() {
    const token = randomBytes(32).toString("hex"),
      profileId = randomUUID(),
      now = this.clock(),
      expiresAt = new Date(Date.parse(now) + TTL).toISOString();
    await this.store.transaction(async (r) => {
      await r.sessions.purge(now);
      await r.states.create({
        profileId,
        createdAt: now,
        currentStateVersion: 0,
        status: "TEMPORARY",
        expiresAt,
      });
      await r.states.insertVersion({
        profileId,
        stateVersion: 0,
        parentVersion: null,
        createdAt: now,
        mutationId: null,
        stateHash: stateHash([]),
        entries: [],
      });
      await r.sessions.insert({
        tokenHash: hash(token),
        profileId,
        expiresAt,
        mutations: 0,
      });
    });
    return { token, expiresAt };
  }
  async read(token: string) {
    return this.store.transaction(async (r) => {
      const { profile } = await this.authorize(r, token);
      const state = (await r.states.version(
        profile.profileId,
        profile.currentStateVersion,
      ))!;
      const previous =
        state.parentVersion === null
          ? null
          : await r.states.version(profile.profileId, state.parentVersion);
      return {
        profile,
        state,
        previous,
        feedback: await r.feedback.list(profile.profileId),
        evaluations: await r.receipts.list(profile.profileId),
      };
    });
  }
  async mutate(
    token: string,
    raw: unknown,
    requestId: string,
  ): Promise<MutationResult> {
    const input = mutationInput(raw, requestId);
    if (!input) throw new StateFailure("INVALID_INPUT");
    return this.store.transaction(async (r) => {
      const { session, profile } = await this.authorize(r, token, true);
      const payloadHash = hash({
        expectedStateVersion: input.expectedStateVersion,
        payload: input.payload,
      });
      const existing = await r.mutations.find(
        profile.profileId,
        input.idempotencyKey,
      );
      if (existing) {
        if (existing.payloadHash !== payloadHash)
          throw new StateFailure("IDEMPOTENCY_KEY_CONFLICT");
        return existing.result;
      }
      if (profile.currentStateVersion !== input.expectedStateVersion)
        throw new StateFailure("STATE_VERSION_CONFLICT");
      if (session.mutations >= 100) throw new StateFailure("RATE_LIMITED");
      const old = (await r.states.version(
          profile.profileId,
          profile.currentStateVersion,
        ))!,
        now = this.clock(),
        mutationId = randomUUID();
      let entries = [...old.entries],
        event: MutationResult["event"];
      let advance = true;
      if (input.payload.kind === "INITIALIZE") {
        if (entries.some((e) => e.kind === "EXPLICIT_LIKE"))
          throw new StateFailure("INVALID_INPUT");
        entries = input.payload.signals.map((entity) => ({
          signalId: randomUUID(),
          kind: "EXPLICIT_LIKE",
          entity,
          scope: "GLOBAL_PREFERENCE",
          persistence: "DURABLE",
          source: "USER",
          sourceEventId: mutationId,
          createdAt: now,
        }));
      } else if (input.payload.kind === "REMOVE") {
        const signalId = input.payload.signalId;
        const e = entries.find((e) => e.signalId === signalId);
        if (!e || e.kind === "EXPLICIT_LIKE")
          throw new StateFailure("INVALID_INPUT");
        entries = entries.filter((e) => e.signalId !== signalId);
      } else {
        const f = input.payload.feedback,
          eventId = randomUUID();
        advance = f.persistence !== "EPHEMERAL";
        event = {
          ...f,
          eventId,
          profileId: profile.profileId,
          stateVersion: old.stateVersion + (advance ? 1 : 0),
          createdAt: now,
          requestId,
          ...(!advance
            ? {
                expiresAt: new Date(
                  Date.parse(now) + 30 * 60 * 1000,
                ).toISOString(),
              }
            : {}),
        };
        if (advance) {
          const e: StateEntry = {
            signalId: randomUUID(),
            kind: "DURABLE_FEEDBACK",
            scope: f.scope,
            persistence: f.persistence,
            category: f.category,
            source: "USER",
            sourceEventId: eventId,
            createdAt: now,
            ...(f.candidateId ? { candidateId: f.candidateId } : {}),
            ...(f.contextKey ? { contextKey: f.contextKey } : {}),
            ...(f.domain ? { domain: f.domain } : {}),
          };
          if (f.category === "SPECIFIC_DISLIKE") {
            e.kind = "CONSTRAINT";
            e.constraint = { kind: "EXCLUDE_CANDIDATE" };
          }
          if (f.maxPrice) {
            e.kind = "CONSTRAINT";
            e.constraint = { kind: "MAX_PRICE", ...f.maxPrice };
          }
          entries.push(e);
        }
      }
      const state: StateVersion = advance
        ? {
            profileId: profile.profileId,
            stateVersion: old.stateVersion + 1,
            parentVersion: old.stateVersion,
            mutationId,
            createdAt: now,
            entries: entries.sort((a, b) =>
              a.signalId.localeCompare(b.signalId),
            ),
            stateHash: stateHash(entries),
          }
        : old;
      const result = { state, ...(event ? { event } : {}), mutationId };
      if (advance) await r.states.insertVersion(state);
      if (event) await r.feedback.insert(event);
      await r.mutations.insert({
        profileId: profile.profileId,
        key: input.idempotencyKey,
        payloadHash,
        result,
      });
      if (advance)
        await r.states.advance(profile.profileId, state.stateVersion);
      await r.sessions.consume(session.tokenHash);
      return result;
    });
  }
  async evaluate(
    token: string,
    raw: unknown,
    providerFactory: () => QlooProvider,
    requestId: string,
  ): Promise<StateEvaluation> {
    const input = evaluationInput(raw);
    if (!input) throw new StateFailure("INVALID_INPUT");
    const { state } = await this.read(token);
    if (state.stateVersion !== input.expectedStateVersion)
      throw new StateFailure("STATE_VERSION_CONFLICT");
    const signals = state.entries
      .filter((e) => e.kind === "EXPLICIT_LIKE")
      .map((e) => e.entity);
    if (
      !isResolvedProfile(signals) ||
      signals.some((e) => e.id === input.candidate.id)
    )
      throw new StateFailure("INVALID_INPUT");
    const now = this.clock();
    let cultural: StateEvaluation["cultural"] = {
      status: "unavailable",
      reason: "no_evidence",
    };
    const independent = stateDecision(
      state,
      input.candidate,
      input.context,
      cultural,
      now,
    );
    if (independent.outcome !== "REJECT") {
      try {
        const provider = providerFactory();
        const checked: QlooProvider = {
          resolve: (q) => provider.resolve(q),
          infer: (q) => provider.infer(q),
          async entities(ids) {
            const result = await provider.entities(ids);
            if (result.status === "available" && !Array.isArray(result.data))
              return { status: "unavailable", reason: "invalid_response" };
            if (
              result.status === "available" &&
              result.data.find((e) => e.id === input.candidate.id)?.type !==
                input.candidate.type
            )
              return { status: "unavailable", reason: "unsupported_entity" };
            return result;
          },
        };
        cultural = await evaluateAction(
          checked,
          signals.map((e) => e.id),
          input.candidate.id,
          requestId,
          input.context.key,
        );
      } catch {
        cultural = { status: "unavailable", reason: "provider_error" };
      }
    }
    const evaluation: StateEvaluation = {
      schemaVersion: "taste-state-evaluation-v1",
      evaluationId: randomUUID(),
      profileId: state.profileId,
      stateVersion: state.stateVersion,
      stateHash: state.stateHash,
      agentId: input.agentId,
      action: {
        kind: "SELECT_ENTITY",
        candidate:
          cultural.status === "available"
            ? cultural.data.candidate
            : input.candidate,
      },
      context: input.context,
      decision: stateDecision(
        state,
        input.candidate,
        input.context,
        cultural,
        now,
      ),
      cultural,
      culturalRequest:
        independent.outcome === "REJECT"
          ? "SKIPPED_INDEPENDENT_BLOCK"
          : "REQUESTED",
      requestId,
      evaluatedAt: now,
      source: "live",
    };
    await this.store.transaction(async (r) => {
      const { profile, session } = await this.authorize(r, token, true);
      if (session.mutations >= 100) throw new StateFailure("RATE_LIMITED");
      await r.sessions.consume(session.tokenHash);
      if (profile.profileId !== state.profileId)
        throw new StateFailure("NOT_FOUND");
      await r.proposals.insert(evaluation);
      if (cultural.status === "available")
        await r.evidence.insert({
          bundleId: evaluation.evaluationId,
          profileId: state.profileId,
          stateVersion: state.stateVersion,
          contractVersion: "qloo-event-m1",
          requestedAt: now,
          receivedAt: cultural.data.qlooEvidence.provenance.fetchedAt,
          completeness: cultural.data.explainability.status,
          stateSignalIds: state.entries
            .filter((e) => e.kind === "EXPLICIT_LIKE")
            .map((e) => e.signalId)
            .sort(),
          receipt: cultural.data,
        });
      await r.receipts.insert(evaluation);
    });
    return evaluation;
  }
  async replay(token: string, id: string): Promise<StateEvaluation> {
    return this.store.transaction(async (r) => {
      const { profile } = await this.authorize(r, token);
      const e = await r.receipts.find(profile.profileId, id);
      if (!e) throw new StateFailure("NOT_FOUND");
      const state = await r.states.version(profile.profileId, e.stateVersion);
      if (!state || state.stateHash !== e.stateHash)
        throw new StateFailure("INVALID_INPUT");
      if (
        e.cultural.status === "available" &&
        readCapturedReceipt(e.cultural.data).status !== "available"
      )
        throw new StateFailure("INVALID_INPUT");
      return {
        ...e,
        source: "recorded",
        decision: stateDecision(
          state,
          e.action.candidate,
          e.context,
          e.cultural,
          e.evaluatedAt,
        ),
      };
    });
  }
}
