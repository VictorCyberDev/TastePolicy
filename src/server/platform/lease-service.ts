import "server-only";
import { randomBytes } from "node:crypto";
import { PolicyService } from "./policy-service";
import { continuation, reference } from "./service";
import type { Repositories } from "@/server/state/repositories";
import type { LeaseRecord } from "./lease-repository";
import {
  platformFail as fail,
  PlatformFailure,
  type KeyScope,
  type Principal,
} from "@/lib/platform/types";
import { hash } from "@/server/state/hash";
import { integer, key, object } from "@/server/subjects/common";
import {
  driftReasons,
  isTerminal,
  observe,
  reduce,
  replay,
  type CurrentFacts,
  type Fingerprint,
  type LeaseEvent,
} from "@/lib/lease/machine";
import { describeAsk } from "@/lib/lease/ask";
import { AUTHORITY_BOUNDARY } from "@/lib/subjects/types";

const LEASE_REF = /^tl_[a-f0-9]{48}$/;
export const leaseRef = (v: unknown): string => {
  if (typeof v !== "string" || !LEASE_REF.test(v)) fail("INVALID_INPUT");
  return v as string;
};
const PERMITTED = ["recommend", "add_to_draft"];
const plus = (iso: string, seconds: number) =>
  new Date(Date.parse(iso) + seconds * 1000).toISOString();
const min = (a: string, b: string) => (a < b ? a : b);

export class LeaseService extends PolicyService {
  private async facts(r: Repositories, l: LeaseRecord): Promise<CurrentFacts> {
    const now = this.clock(),
      passport = await r.platform.passport(l.passportRef),
      active = await r.policy.active(l.passportRef);
    let grantUsable = true;
    if (l.grantId) {
      const g = await r.platform.getGrant(l.grantId);
      grantUsable =
        !!g &&
        !(await r.platform.grantRevoked(g.grantId)) &&
        g.expiresAt > now &&
        g.scopes.includes("EVALUATE_TASTE_ACTION");
    }
    return {
      stateHash: passport?.stateHash ?? "",
      policyVersion: active?.version ?? null,
      grantUsable,
      passportUsable: !!passport && passport.expiresAt > now,
      activeOverrideIds: (await r.policy.overrides(l.passportRef))
        .filter((o) => !o.revokedAt && o.expiresAt > now && o.createdAt <= now)
        .map((o) => o.overrideId),
    };
  }
  // Apply events in order, persisting each and the projection with an
  // optimistic revision check.
  private async advance(
    r: Repositories,
    l: LeaseRecord,
    events: LeaseEvent[],
    expectedRev?: number,
  ): Promise<LeaseRecord> {
    if (expectedRev !== undefined && expectedRev !== l.state.rev)
      fail("LEASE_STATE_CONFLICT");
    let cur = l;
    for (const e of events) {
      const before = cur.state.rev;
      let state;
      try {
        state = reduce(cur.state, e);
      } catch {
        fail("LEASE_STATE_CONFLICT");
      }
      cur = { ...cur, state: state! };
      await r.leases.append(cur.leaseRef, cur.state.rev, e);
      if (!(await r.leases.update(cur, before))) fail("LEASE_STATE_CONFLICT");
    }
    return cur;
  }
  // Time and drift are evaluated at read time; nothing relies on a job.
  protected async settle(
    r: Repositories,
    l: LeaseRecord,
  ): Promise<LeaseRecord> {
    await this.checked(r, l);
    if (isTerminal(l.state.status)) return l;
    const now = this.clock(),
      obs = observe(l.state, now);
    if (obs.due === "EXPIRED")
      return this.advance(r, l, [
        { kind: "EXPIRED", at: now, actor: "SYSTEM" },
      ]);
    if (l.state.status === "ACTIVE") {
      const reasons = [
        ...new Set([
          ...driftReasons(l.state.fingerprint, await this.facts(r, l)),
          ...obs.reasons,
        ]),
      ].sort();
      if (reasons.length)
        return this.advance(r, l, [
          { kind: "DRIFT", at: now, actor: "SYSTEM", reasons },
        ]);
    }
    return l;
  }
  // The stored projection must equal a replay of its event log before anything
  // else touches it.
  // Eager propagation: when something a lease relied on changes, every live
  // lease of the Passport is re-settled in the same transaction, so status
  // lists and verifiers see the change when it commits.
  protected override async afterChange(r: Repositories, passportRef: string) {
    for (const l of await r.leases.liveForPassport(passportRef))
      await this.settle(r, l);
  }
  private async checked(r: Repositories, l: LeaseRecord) {
    let stored;
    try {
      stored = replay(await r.leases.events(l.leaseRef));
    } catch {
      fail("INTEGRITY_ERROR");
    }
    if (hash(stored) !== hash(l.state)) fail("INTEGRITY_ERROR");
  }
  private leaseView(l: LeaseRecord) {
    const valid = l.state.status === "ACTIVE";
    return {
      schemaVersion: "taste-lease-v1",
      leaseRef: l.leaseRef,
      status: l.state.status,
      valid,
      permitted: valid ? l.permitted : [],
      reasons: l.state.reasons,
      ask: l.state.ask
        ? {
            ...describeAsk(
              l.state.ask.kind === "AUTHORITY_CONFIRMATION"
                ? "AUTONOMY_CEILING"
                : "",
              l.state.ask.reasons,
            ),
            kind: l.state.ask.kind,
          }
        : null,
      passportRef: l.passportRef,
      evaluationRef: l.evaluationRef,
      agentId: l.agentId,
      candidateId: l.candidateId,
      candidateName: l.candidateName,
      contextKey: l.contextKey,
      issuedAt: l.issuedAt,
      expiresAt: l.state.expiresAt,
      checkpointDueAt: l.state.checkpointDueAt,
      rev: l.state.rev,
      cacheable: false,
      ttlMs: 0,
      authorityBoundary: AUTHORITY_BOUNDARY,
      continuation: valid ? continuation("ALLOW") : null,
    };
  }
  // Lock order is always accounts first, then the lease row (owner operations
  // do the same). Locking the lease first deadlocks against them on a real
  // server, so the lease is read unlocked, accounts are locked, and only then
  // is the lease locked and re-checked.
  protected async agentLease(
    r: Repositories,
    p: Principal,
    ref: string,
    scope: KeyScope,
    actorOnly: boolean,
  ) {
    const peek = await r.leases.get(ref, false);
    if (!peek || (actorOnly && peek.actorId !== p.userId))
      fail("LEASE_NOT_FOUND");
    await this.agentAccess(r, p, peek, scope);
    const l = await r.leases.get(ref, true);
    if (!l || (actorOnly && l.actorId !== p.userId)) fail("LEASE_NOT_FOUND");
    return l;
  }
  protected async agentAccess(
    r: Repositories,
    p: Principal,
    l: LeaseRecord,
    scope: KeyScope,
  ) {
    await this.locked(r, p, [l.ownerId], scope);
    if (p.userId !== l.actorId && p.userId !== l.ownerId)
      fail("LEASE_NOT_FOUND");
  }
  private async fingerprintOf(
    r: Repositories,
    e: NonNullable<
      Awaited<ReturnType<Repositories["platform"]["getEvaluation"]>>
    >,
  ) {
    const pd = await r.policy.decision(e.evaluationRef);
    const fp: Fingerprint = {
      stateHash: e.stateHash,
      policyVersion: pd?.policyVersion ?? null,
      grantId: e.grantId,
      overrideIds: (pd?.rules ?? [])
        .filter((x) => x.startsWith("OVERRIDE:"))
        .map((x) => x.slice(9))
        .sort(),
    };
    return { pd, fp, outcome: pd?.outcome ?? e.evaluation.decision.outcome };
  }
  private async requireCurrent(
    r: Repositories,
    e: NonNullable<
      Awaited<ReturnType<Repositories["platform"]["getEvaluation"]>>
    >,
    fp: Fingerprint,
  ) {
    const passport = await r.platform.passport(e.passportRef);
    if (!passport || passport.expiresAt <= this.clock())
      fail("PASSPORT_NOT_FOUND");
    const active = await r.policy.active(e.passportRef);
    if (
      passport.stateHash !== e.stateHash ||
      (active?.version ?? null) !== fp.policyVersion ||
      Date.parse(e.evaluation.evaluatedAt) + 3_600_000 <=
        Date.parse(this.clock())
    )
      fail("STATE_VERSION_CONFLICT");
  }
  async leaseRequest(p: Principal, raw: unknown) {
    const v = object(raw, [
        "idempotencyKey",
        "evaluationRef",
        "ttlSeconds",
        "checkpointSeconds",
      ]),
      k = key(v.idempotencyKey),
      er = reference(v.evaluationRef),
      ttl = v.ttlSeconds === undefined ? 900 : integer(v.ttlSeconds),
      cps =
        v.checkpointSeconds === undefined
          ? Math.min(300, ttl)
          : integer(v.checkpointSeconds);
    if (ttl < 60 || ttl > 86400 || cps < 30 || cps > ttl) fail("INVALID_INPUT");
    const h = hash(v);
    return this.store.transaction(async (r) => {
      const e = await r.platform.getEvaluation(er);
      if (!e || e.actorId !== p.userId) fail("LEASE_NOT_FOUND");
      await this.access(
        r,
        p,
        e.passportRef,
        e.grantId,
        "EVALUATE_TASTE_ACTION",
        "TASTE_EVALUATE",
      );
      const old = await r.platform.op(p.userId, "lease.request", k);
      if (old) {
        if (old.hash !== h) fail("IDEMPOTENCY_KEY_CONFLICT");
        return old.result;
      }
      const { pd, fp, outcome } = await this.fingerprintOf(r, e);
      if (outcome !== "ALLOW" && outcome !== "ASK") fail("LEASE_NOT_PERMITTED");
      await this.requireCurrent(r, e, fp);
      // A typed ASK. Only an authority confirmation can wait for the owner; a
      // missing fact has to be captured and the choice evaluated again.
      const ask =
        outcome === "ASK"
          ? describeAsk(
              pd ? pd.basis : e.evaluation.decision.basis,
              pd ? pd.rules : e.evaluation.decision.rules,
            )
          : null;
      if (ask && ask.kind !== "AUTHORITY_CONFIRMATION")
        fail("CLARIFICATION_REQUIRED");
      const passport = (await r.platform.passport(e.passportRef))!;
      const ctx = e.evaluation.context.key,
        cand = e.evaluation.action.candidate.id,
        agent = e.evaluation.agentId;
      const existing = await r.leases.live(
        e.passportRef,
        p.userId,
        agent,
        cand,
        ctx,
      );
      if (existing) {
        const settled = await this.settle(r, existing);
        if (!isTerminal(settled.state.status)) fail("LEASE_STATE_CONFLICT");
      }
      const now = this.clock(),
        issued: LeaseEvent = {
          kind: "ISSUED",
          at: now,
          actor: "AGENT",
          decision: outcome,
          ...(ask ? { ask: { kind: ask.kind, reasons: ask.reasons } } : {}),
          expiresAt: plus(now, ttl),
          checkpointDueAt: plus(now, Math.min(cps, ttl)),
          fingerprint: fp,
        };
      const l: LeaseRecord = {
        leaseRef: "tl_" + randomBytes(24).toString("hex"),
        passportRef: e.passportRef,
        ownerId: passport.userId,
        actorId: p.userId,
        grantId: e.grantId,
        evaluationRef: er,
        agentId: agent,
        candidateId: cand,
        contextKey: ctx,
        permitted: PERMITTED,
        issuedAt: now,
        checkpointSeconds: cps,
        candidateName: e.evaluation.action.candidate.name,
        state: reduce(null, issued),
      };
      await r.leases.insert(l);
      await r.leases.append(l.leaseRef, 1, issued);
      const result = this.leaseView(l);
      await r.platform.saveOp(p.userId, "lease.request", k, h, result);
      return result;
    });
  }
  async leaseVerify(p: Principal, raw: unknown) {
    const v = object(raw, ["leaseRef"]),
      ref = leaseRef(v.leaseRef);
    return this.store.transaction(async (r) => {
      const l0 = await this.agentLease(r, p, ref, "RECEIPT_READ", false);
      const l = await this.settle(r, l0);
      return this.leaseView(l);
    });
  }
  async leaseCheckpoint(p: Principal, raw: unknown) {
    const v = object(raw, ["leaseRef", "expectedRev"]),
      ref = leaseRef(v.leaseRef),
      rev = v.expectedRev === undefined ? undefined : integer(v.expectedRev);
    return this.store.transaction(async (r) => {
      const l0 = await this.agentLease(r, p, ref, "TASTE_EVALUATE", true);
      if (rev !== undefined && rev !== l0.state.rev)
        fail("LEASE_STATE_CONFLICT");
      let l = await this.settle(r, l0);
      if (l.state.status === "ACTIVE") {
        const now = this.clock();
        l = await this.advance(r, l, [
          {
            kind: "CHECKPOINT_OK",
            at: now,
            actor: "AGENT",
            checkpointDueAt: min(
              plus(now, l.checkpointSeconds),
              l.state.expiresAt,
            ),
          },
        ]);
      }
      return this.leaseView(l);
    });
  }
  // A suspended lease resumes only on a new ALLOW under the current fingerprint.
  async leaseResume(p: Principal, raw: unknown) {
    const v = object(raw, ["leaseRef", "evaluationRef", "idempotencyKey"]),
      ref = leaseRef(v.leaseRef),
      er = reference(v.evaluationRef);
    key(v.idempotencyKey);
    return this.store.transaction(async (r) => {
      const l0 = await this.agentLease(r, p, ref, "TASTE_EVALUATE", true);
      let l = await this.settle(r, l0);
      if (l.state.status === "ACTIVE") return this.leaseView(l);
      if (l.state.status !== "SUSPENDED") fail("LEASE_STATE_CONFLICT");
      const e = await r.platform.getEvaluation(er);
      if (
        !e ||
        e.actorId !== p.userId ||
        e.passportRef !== l.passportRef ||
        e.evaluation.agentId !== l.agentId ||
        e.evaluation.action.candidate.id !== l.candidateId ||
        e.evaluation.context.key !== l.contextKey ||
        e.evaluation.evaluatedAt < l.issuedAt
      )
        fail("LEASE_NOT_FOUND");
      await this.access(
        r,
        p,
        e.passportRef,
        e.grantId,
        "EVALUATE_TASTE_ACTION",
        "TASTE_EVALUATE",
      );
      // Only a check made after the suspension counts as a fresh one.
      const events = await r.leases.events(l.leaseRef);
      if (e.evaluation.evaluatedAt < events[events.length - 1].at)
        fail("STATE_VERSION_CONFLICT");
      const { fp, outcome } = await this.fingerprintOf(r, e);
      if (outcome !== "ALLOW") fail("LEASE_NOT_PERMITTED");
      await this.requireCurrent(r, e, fp);
      const now = this.clock();
      l = await this.advance(r, { ...l, grantId: e.grantId }, [
        {
          kind: "RESUMED",
          at: now,
          actor: "AGENT",
          fingerprint: fp,
          checkpointDueAt: min(
            plus(now, l.checkpointSeconds),
            l.state.expiresAt,
          ),
        },
      ]);
      return this.leaseView(l);
    });
  }
  async leaseRelease(p: Principal, raw: unknown) {
    const v = object(raw, ["leaseRef"]),
      ref = leaseRef(v.leaseRef);
    return this.store.transaction(async (r) => {
      const l0 = await this.agentLease(r, p, ref, "TASTE_EVALUATE", true);
      const l = await this.settle(r, l0);
      if (isTerminal(l.state.status)) return this.leaseView(l);
      return this.leaseView(
        await this.advance(r, l, [
          { kind: "RELEASED", at: this.clock(), actor: "AGENT" },
        ]),
      );
    });
  }
  // ---- owner (session) operations ----
  private async ownerTx<T>(
    p: Principal,
    fresh: boolean,
    work: (r: Repositories) => Promise<T>,
  ) {
    return this.store.transaction(async (r) => {
      await this.locked(r, p, [], undefined, fresh);
      if (p.kind !== "SESSION") fail("ACCESS_DENIED");
      return work(r);
    });
  }
  async leaseList(p: Principal, raw: unknown) {
    const v = object(raw, ["passportRef"]),
      ref = reference(v.passportRef);
    return this.ownerTx(p, false, async (r) => {
      const passport = await r.platform.passport(ref);
      if (!passport || passport.userId !== p.userId) fail("PASSPORT_NOT_FOUND");
      for (const l of await r.leases.liveForPassport(ref))
        try {
          await this.settle(r, l);
        } catch (e) {
          // One unreadable lease must not hide the others or the stop button.
          if (!(e instanceof PlatformFailure && e.code === "INTEGRITY_ERROR"))
            throw e;
        }
      const leases = await r.leases.forPassport(ref, 30),
        timeline: {
          leaseRef: string;
          seq: number;
          kind: string;
          at: string;
          actor: string;
          reasons?: string[];
        }[] = [];
      for (const l of leases)
        for (const [i, e] of (await r.leases.events(l.leaseRef)).entries())
          timeline.push({
            leaseRef: l.leaseRef,
            seq: i + 1,
            kind: e.kind,
            at: e.at,
            actor: e.actor,
            ...("reasons" in e ? { reasons: e.reasons } : {}),
          });
      timeline.sort((a, b) =>
        a.at < b.at ? 1 : a.at > b.at ? -1 : b.seq - a.seq,
      );
      return {
        schemaVersion: "taste-lease-list-v1",
        passportRef: ref,
        pending: leases
          .filter((l) => l.state.status === "ASK_PENDING")
          .map((l) => this.leaseView(l)),
        leases: leases.map((l) => this.leaseView(l)),
        timeline: timeline.slice(0, 200),
      };
    });
  }
  private async ownedLease(r: Repositories, p: Principal, ref: string) {
    const l = await r.leases.get(ref, true);
    if (!l || l.ownerId !== p.userId) fail("LEASE_NOT_FOUND");
    return l;
  }
  async leaseApprove(p: Principal, raw: unknown) {
    const v = object(raw, [
        "idempotencyKey",
        "leaseRef",
        "ttlSeconds",
        "confirm",
      ]),
      k = key(v.idempotencyKey),
      ref = leaseRef(v.leaseRef),
      ttl = v.ttlSeconds === undefined ? undefined : integer(v.ttlSeconds);
    if (ttl !== undefined && (ttl < 60 || ttl > 86400)) fail("INVALID_INPUT");
    // Approval is an explicit act on one exact choice, never a default.
    if (v.confirm !== true) fail("INVALID_INPUT");
    const h = hash(v);
    return this.ownerTx(p, true, async (r) => {
      const old = await r.platform.op(p.userId, "lease.approve", k);
      if (old) {
        if (old.hash !== h) fail("IDEMPOTENCY_KEY_CONFLICT");
        return old.result;
      }
      const l0 = await this.ownedLease(r, p, ref),
        l = await this.settle(r, l0);
      if (l.state.status !== "ASK_PENDING") fail("LEASE_STATE_CONFLICT");
      // Only a confirmation of the owner's own rule can be approved. A missing
      // fact cannot: it needs a captured clarification and a new evaluation.
      if (l.state.ask?.kind !== "AUTHORITY_CONFIRMATION")
        fail("CLARIFICATION_REQUIRED");
      // The pending question must still be the one that was asked.
      const e = await r.platform.getEvaluation(l.evaluationRef);
      if (!e) fail("LEASE_NOT_FOUND");
      const { pd, outcome } = await this.fingerprintOf(r, e);
      const again = describeAsk(
        pd ? pd.basis : e.evaluation.decision.basis,
        pd ? pd.rules : e.evaluation.decision.rules,
      );
      if (
        outcome !== "ASK" ||
        again.kind !== "AUTHORITY_CONFIRMATION" ||
        hash(again.reasons) !== hash(l.state.ask.reasons)
      )
        fail("LEASE_STATE_CONFLICT");
      await this.requireCurrentLoose(r, l);
      // Freshness is time-driven: a question answered long after the check
      // that raised it is asked again, not approved.
      if (
        Date.parse(e.evaluation.evaluatedAt) + 3_600_000 <=
        Date.parse(this.clock())
      )
        fail("STATE_VERSION_CONFLICT");
      const now = this.clock(),
        expiresAt =
          ttl === undefined
            ? l.state.expiresAt
            : min(plus(now, ttl), l.state.expiresAt);
      const done = await this.advance(r, l, [
        {
          kind: "APPROVED",
          at: now,
          actor: "OWNER",
          scope: {
            candidateId: l.candidateId,
            contextKey: l.contextKey,
            permitted: l.permitted,
            // What the owner saw: the price the choice was evaluated at.
            price: e.evaluation.context.price ?? null,
          },
          fingerprint: l.state.fingerprint,
          expiresAt,
          checkpointDueAt: min(plus(now, l.checkpointSeconds), expiresAt),
        },
      ]);
      const result = this.leaseView(done);
      await r.platform.saveOp(p.userId, "lease.approve", k, h, result);
      return result;
    });
  }
  private async requireCurrentLoose(r: Repositories, l: LeaseRecord) {
    const facts = await this.facts(r, l);
    const reasons = driftReasons(l.state.fingerprint, facts).filter(
      (x) => x !== "OVERRIDE_ENDED",
    );
    if (reasons.length) fail("STATE_VERSION_CONFLICT");
  }
  async leaseDecline(p: Principal, raw: unknown) {
    const v = object(raw, ["leaseRef"]),
      ref = leaseRef(v.leaseRef);
    return this.ownerTx(p, false, async (r) => {
      const l = await this.settle(r, await this.ownedLease(r, p, ref));
      if (l.state.status !== "ASK_PENDING") fail("LEASE_STATE_CONFLICT");
      return this.leaseView(
        await this.advance(r, l, [
          { kind: "DECLINED", at: this.clock(), actor: "OWNER" },
        ]),
      );
    });
  }
  async leaseRevoke(p: Principal, raw: unknown) {
    const v = object(raw, ["leaseRef", "passportRef"]);
    if ((v.leaseRef === undefined) === (v.passportRef === undefined))
      fail("INVALID_INPUT");
    return this.ownerTx(p, false, async (r) => {
      const now = this.clock();
      if (v.passportRef !== undefined) {
        const ref = reference(v.passportRef),
          passport = await r.platform.passport(ref);
        if (!passport || passport.userId !== p.userId)
          fail("PASSPORT_NOT_FOUND");
        let n = 0;
        for (const l of await r.leases.liveForPassport(ref)) {
          await this.advance(r, l, [
            { kind: "REVOKED", at: now, actor: "OWNER" },
          ]);
          n++;
        }
        return { revoked: n };
      }
      const l = await this.ownedLease(r, p, leaseRef(v.leaseRef));
      if (isTerminal(l.state.status)) return this.leaseView(l);
      return this.leaseView(
        await this.advance(r, l, [
          { kind: "REVOKED", at: now, actor: "OWNER" },
        ]),
      );
    });
  }
}
