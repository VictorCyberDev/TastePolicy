import "server-only";
import { randomUUID } from "node:crypto";
import { PlatformService, reference } from "./service";
import type { Repositories } from "@/server/state/repositories";
import {
  platformFail as fail,
  type PlatformEvaluation,
  type Principal,
} from "@/lib/platform/types";
import { hash } from "@/server/state/hash";
import { key, object, id, integer } from "@/server/subjects/common";
import {
  evaluateWithPolicy,
  type PolicyEvaluationInput,
} from "@/lib/policy/engine";
import {
  classifyPolicyChange,
  widensAuthority,
} from "@/lib/policy/composition";
import { counterfactuals, impactAnalysis } from "@/lib/policy/analysis";
import { overrideRequest, policyDocument } from "@/lib/policy/validation";
import {
  type PolicyDecision,
  type PolicyDocument,
  type PolicyOverride,
} from "@/lib/policy/types";
import type { StateVersion } from "@/lib/state/types";

export class PolicyService extends PlatformService {
  private async owned(r: Repositories, p: Principal, passportRef: string) {
    const passport = await r.platform.passport(passportRef);
    if (!passport || passport.userId !== p.userId) fail("PASSPORT_NOT_FOUND");
    return passport;
  }
  private async inputFor(
    r: Repositories,
    e: PlatformEvaluation,
    policy: PolicyDocument | null,
    policyVersion: number | null,
    overrides: PolicyOverride[],
  ): Promise<PolicyEvaluationInput> {
    const state = await r.states.version(e.stateProfileId, e.stateVersion);
    if (!state) fail("INTEGRITY_ERROR");
    return {
      state,
      candidate: e.evaluation.action.candidate,
      context: e.evaluation.context,
      cultural: e.evaluation.cultural,
      agentId: e.evaluation.agentId,
      now: e.evaluation.evaluatedAt,
      policy,
      policyVersion,
      overrides,
    };
  }
  protected override async policyDecide(
    r: Repositories,
    e: PlatformEvaluation,
    state: StateVersion,
  ): Promise<PolicyDecision | null> {
    const active = await r.policy.active(e.passportRef),
      overrides = await r.policy.overrides(e.passportRef);
    if (!active && !overrides.length) return null;
    const d = evaluateWithPolicy({
      state,
      candidate: e.evaluation.action.candidate,
      context: e.evaluation.context,
      cultural: e.evaluation.cultural,
      agentId: e.evaluation.agentId,
      now: e.evaluation.evaluatedAt,
      policy: active?.document ?? null,
      policyVersion: active?.version ?? null,
      overrides,
    });
    // The wrapped evaluator must agree with what was just recorded.
    if (
      d.baseOutcome !== e.evaluation.decision.outcome ||
      d.trace[0].outcome !== e.evaluation.decision.outcome
    )
      fail("INTEGRITY_ERROR");
    await r.policy.recordDecision(e.evaluationRef, e.passportRef, d);
    return d;
  }
  protected override async policyLoad(
    r: Repositories,
    e: PlatformEvaluation,
  ): Promise<PolicyDecision | null> {
    return r.policy.decision(e.evaluationRef);
  }
  private view(row: {
    version: number;
    docHash: string;
    document: PolicyDocument;
    createdAt: string;
    note: string | null;
    parentVersion: number | null;
  }) {
    return {
      version: row.version,
      docHash: row.docHash,
      document: row.document,
      createdAt: row.createdAt,
      note: row.note,
      parentVersion: row.parentVersion,
    };
  }
  async policyGet(p: Principal, raw: unknown) {
    const v = object(raw, ["passportRef"]),
      ref = reference(v.passportRef);
    return this.store.transaction(async (r) => {
      await this.locked(r, p, [], undefined, false);
      if (p.kind !== "SESSION") fail("ACCESS_DENIED");
      await this.owned(r, p, ref);
      const [active, history, overrides, recent] = await Promise.all([
        r.policy.active(ref),
        r.policy.versions(ref, 20),
        r.policy.overrides(ref),
        r.policy.evaluations(ref, 200),
      ]);
      // Suggestions are informational; nothing is applied automatically.
      const stopped: Record<string, number> = {};
      for (const e of recent) {
        const d = await r.policy.decision(e.evaluationRef);
        if (d?.basis === "AUTONOMY_CEILING")
          stopped[e.evaluation.agentId] =
            (stopped[e.evaluation.agentId] ?? 0) + 1;
      }
      const now = this.clock();
      return {
        schemaVersion: "taste-policy-view-v1",
        passportRef: ref,
        active: active ? this.view(active) : null,
        history: history.map((h) => this.view(h)),
        overrides: overrides.map((o) => ({
          ...o,
          status: o.revokedAt
            ? "REVOKED"
            : o.expiresAt <= now
              ? "EXPIRED"
              : "ACTIVE",
        })),
        suggestions: Object.entries(stopped)
          .filter(([, n]) => n >= 3)
          .map(([agentId, n]) => ({
            kind: "CONSIDER_RAISING_AUTONOMY",
            agentId,
            stoppedCount: n,
            note: "Suggestion only. Nothing changes unless you change it.",
          })),
      };
    });
  }
  // Agents may read the resolved rules for themselves; not the history or overrides.
  async policySummary(p: Principal, raw: unknown) {
    const v = object(raw, ["passportRef", "grantId", "agentId"]),
      ref = reference(v.passportRef);
    if (
      v.agentId !== undefined &&
      (typeof v.agentId !== "string" ||
        !/^[a-zA-Z0-9_-]{1,64}$/.test(v.agentId))
    )
      fail("INVALID_INPUT");
    return this.store.transaction(async (r) => {
      await this.access(
        r,
        p,
        ref,
        v.grantId,
        "READ_PASSPORT_SUMMARY",
        "PASSPORT_READ",
      );
      const active = await r.policy.active(ref),
        doc = active?.document;
      const level = (domain: "brand" | "place" | "destination") =>
        doc
          ? (v.agentId && doc.autonomy.byAgent[v.agentId as string]) ||
            doc.autonomy.byDomain[domain] ||
            doc.autonomy.default
          : "AUTONOMOUS";
      return {
        schemaVersion: "taste-policy-summary-v1",
        passportRef: ref,
        policyVersion: active?.version ?? null,
        autonomy: {
          brand: level("brand"),
          place: level("place"),
          destination: level("destination"),
        },
        limit: doc?.autonomy.limit ?? null,
        freshnessDays: doc?.freshness ?? {},
        note: "Rules can only make a decision more cautious or follow an explicit user override; hard rules always win.",
      };
    });
  }
  async policyPublish(p: Principal, raw: unknown) {
    const v = object(raw, [
        "idempotencyKey",
        "passportRef",
        "document",
        "note",
        "expectedVersion",
      ]),
      k = key(v.idempotencyKey),
      ref = reference(v.passportRef),
      doc = policyDocument(v.document),
      expected = integer(v.expectedVersion),
      note =
        v.note === undefined
          ? null
          : typeof v.note === "string" &&
              v.note.length <= 200 &&
              !/[\u0000-\u001f]/.test(v.note)
            ? v.note
            : fail("INVALID_INPUT");
    const h = hash(v);
    return this.store.transaction(async (r) => {
      await this.locked(r, p, [], undefined, false);
      if (p.kind !== "SESSION") fail("ACCESS_DENIED");
      await this.owned(r, p, ref);
      const old = await r.platform.op(p.userId, "policy.publish", k);
      if (old) {
        if (old.hash !== h) fail("IDEMPOTENCY_KEY_CONFLICT");
        return old.result;
      }
      const active = await r.policy.active(ref);
      if ((active?.version ?? 0) !== expected) fail("STATE_VERSION_CONFLICT");
      // Loosening needs a recent sign-in; tightening never does.
      if (widensAuthority(classifyPolicyChange(active?.document ?? null, doc)))
        await this.locked(r, p, [], undefined, true);
      const latest = await r.policy.latest(ref),
        docHash = hash(doc);
      if (active && active.docHash === docHash) fail("INVALID_INPUT");
      const row = {
        version: latest + 1,
        docHash,
        document: doc,
        parentVersion: latest === 0 ? null : latest,
        createdAt: this.clock(),
        note,
      };
      await r.policy.insertVersion(ref, p.userId, row);
      await r.policy.setActive(ref, row.version);
      await this.afterChange(r, ref);
      const result = this.view(row);
      await r.platform.saveOp(p.userId, "policy.publish", k, h, result);
      return result;
    });
  }
  async overrideCreate(p: Principal, raw: unknown) {
    const v = object(raw, [
        "idempotencyKey",
        "passportRef",
        "effect",
        "scope",
        "days",
        "confirmCulturalReject",
      ]),
      k = key(v.idempotencyKey),
      ref = reference(v.passportRef),
      req = overrideRequest(raw);
    const h = hash(v);
    return this.store.transaction(async (r) => {
      // Overrides raise permission: always a fresh sign-in.
      await this.locked(r, p, [], undefined, true);
      if (p.kind !== "SESSION") fail("ACCESS_DENIED");
      await this.owned(r, p, ref);
      const old = await r.platform.op(p.userId, "policy.override", k);
      if (old) {
        if (old.hash !== h) fail("IDEMPOTENCY_KEY_CONFLICT");
        return old.result;
      }
      const now = this.clock();
      if (
        (await r.policy.overrides(ref)).filter(
          (o) => !o.revokedAt && o.expiresAt > now,
        ).length >= 20
      )
        fail("RATE_LIMITED");
      const o: PolicyOverride = {
        overrideId: randomUUID(),
        effect: req.effect,
        scope: req.scope,
        createdAt: now,
        expiresAt: new Date(
          Date.parse(now) + req.days * 86_400_000,
        ).toISOString(),
      };
      await r.policy.insertOverride(ref, p.userId, o);
      await r.platform.saveOp(p.userId, "policy.override", k, h, o);
      return o;
    });
  }
  async overrideRevoke(p: Principal, raw: unknown) {
    const v = object(raw, ["passportRef", "overrideId"]),
      ref = reference(v.passportRef),
      oid = id(v.overrideId);
    return this.store.transaction(async (r) => {
      await this.locked(r, p, [], undefined, false);
      if (p.kind !== "SESSION") fail("ACCESS_DENIED");
      await this.owned(r, p, ref);
      // Revocation is idempotent in effect: a second revoke reports the same state.
      await r.policy.revokeOverride(ref, oid, this.clock());
      await this.afterChange(r, ref);
      return { overrideId: oid, status: "REVOKED" };
    });
  }
  // Pure re-decision of one recorded evaluation under a draft policy.
  async policySimulate(p: Principal, raw: unknown) {
    const v = object(raw, ["passportRef", "evaluationRef", "document"]),
      ref = reference(v.passportRef),
      er = reference(v.evaluationRef),
      draft = policyDocument(v.document);
    return this.store.transaction(async (r) => {
      await this.locked(r, p, [], undefined, false);
      if (p.kind !== "SESSION") fail("ACCESS_DENIED");
      await this.owned(r, p, ref);
      const e = await r.platform.getEvaluation(er);
      if (!e || e.passportRef !== ref) fail("PASSPORT_NOT_FOUND");
      const active = await r.policy.active(ref),
        overrides = await r.policy.overrides(ref);
      const current = evaluateWithPolicy(
        await this.inputFor(
          r,
          e,
          active?.document ?? null,
          active?.version ?? null,
          overrides,
        ),
      );
      const proposed = evaluateWithPolicy(
        await this.inputFor(r, e, draft, null, overrides),
      );
      return {
        schemaVersion: "taste-policy-simulation-v1",
        evaluationRef: er,
        current,
        proposed,
        changed: current.outcome !== proposed.outcome,
      };
    });
  }
  async policyImpact(p: Principal, raw: unknown) {
    const v = object(raw, ["passportRef", "document"]),
      ref = reference(v.passportRef),
      draft = policyDocument(v.document);
    return this.store.transaction(async (r) => {
      await this.locked(r, p, [], undefined, false);
      if (p.kind !== "SESSION") fail("ACCESS_DENIED");
      await this.owned(r, p, ref);
      const active = await r.policy.active(ref),
        overrides = await r.policy.overrides(ref),
        recent = await r.policy.evaluations(ref, 200);
      const items = [];
      for (const e of recent)
        items.push({
          ref: e.evaluationRef,
          input: await this.inputFor(
            r,
            e,
            active?.document ?? null,
            active?.version ?? null,
            overrides,
          ),
        });
      return {
        schemaVersion: "taste-policy-impact-v1",
        window: "LAST_200_EVALUATIONS",
        ...impactAnalysis(items, draft, overrides),
      };
    });
  }
  // Developer inspector: the recorded decision, step by step, plus verified counterfactuals for the owner.
  async policyExplain(p: Principal, raw: unknown) {
    const v = object(raw, ["evaluationRef"]),
      er = reference(v.evaluationRef);
    return this.store.transaction(async (r) => {
      await this.locked(r, p, [], undefined, false);
      if (p.kind !== "SESSION") fail("ACCESS_DENIED");
      const e = await r.platform.getEvaluation(er);
      if (!e) fail("PASSPORT_NOT_FOUND");
      await this.owned(r, p, e.passportRef);
      const stored = await r.policy.decision(er),
        version = stored?.policyVersion ?? null,
        policy = version
          ? ((await r.policy.version(e.passportRef, version))?.document ?? null)
          : null,
        overrides = await r.policy.overrides(e.passportRef);
      const input = await this.inputFor(r, e, policy, version, overrides);
      const replay = evaluateWithPolicy(input);
      // The stored final decision must be reproducible from recorded inputs.
      if (stored && hash(replay) !== hash(stored)) fail("INTEGRITY_ERROR");
      return {
        schemaVersion: "taste-policy-explanation-v1",
        evaluationRef: er,
        base: {
          outcome: e.evaluation.decision.outcome,
          basis: e.evaluation.decision.basis,
          rules: e.evaluation.decision.rules,
        },
        final: replay,
        counterfactuals: counterfactuals(input),
      };
    });
  }
}
