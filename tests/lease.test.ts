// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- assertions over loosely typed JSON responses */
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import {
  platformDatabase,
  account,
  init,
  subjectProvider,
  future,
} from "./platform-fixtures";
import { LeaseService } from "@/server/platform/lease-service";
import { DEFAULT_POLICY, type PolicyDocument } from "@/lib/policy/types";
import {
  proposal,
  reqId,
  rememberLease,
  presentFor,
} from "./interactive-fixtures";
import type { Principal } from "@/lib/platform/types";
import { stateHash } from "@/server/state/service";
import type { StateEntry } from "@/lib/state/types";

let d: Awaited<ReturnType<typeof platformDatabase>>;
let now = Date.now();
let svc: LeaseService;
const clock = () => new Date(now).toISOString();
const tick = (seconds: number) => (now += seconds * 1000);
beforeAll(async () => {
  d = await platformDatabase();
  svc = new LeaseService(d.store, clock);
}, 30000);
afterAll(async () => d?.db.close());

const observe: PolicyDocument = {
  ...DEFAULT_POLICY,
  autonomy: { default: "OBSERVE", byDomain: {}, byAgent: {} },
};
let n = 0;
async function world() {
  // Sessions are created at real time; keep the test clock anchored to it.
  now = Math.max(now, Date.now());
  now = Date.now();
  const a = await account(d),
    q = subjectProvider(),
    passport = await svc.initialize(a.principal, init(), () => q.q);
  const key = await svc.issueKey(a.principal, {
    idempotencyKey: "k" + ++n,
    displayLabel: "SYNTHETIC TEST DATA",
    scopes: ["PASSPORT_READ", "TASTE_EVALUATE", "RECEIPT_READ"],
    expiresAt: new Date(now + 20 * 86400000).toISOString(),
  });
  const agent = await svc.credentialPrincipal(key.secret!);
  const ref = passport.passportRef;
  const evaluate = (p: Principal = agent, id = proposal(1)) =>
    svc.evaluate(
      p,
      { idempotencyKey: "e" + ++n, passportRef: ref, proposal: id },
      () => q.q,
      reqId,
    ) as Promise<Record<string, any>>;
  const lease = (evaluationRef: string, extra: object = {}) =>
    svc
      .leaseRequest(agent, {
        idempotencyKey: "l" + ++n + "-key",
        evaluationRef,
        ...extra,
      })
      .then(rememberLease) as Promise<Record<string, any>>;
  const publish = (document: PolicyDocument, expectedVersion: number) =>
    svc.policyPublish(a.principal, {
      idempotencyKey: "p" + ++n + "-key",
      passportRef: ref,
      document,
      expectedVersion,
    });
  return { a, q, agent, ref, evaluate, lease, publish, key };
}
const status = (p: Principal, leaseRef: string) =>
  svc.leaseVerify(p, { leaseRef, ...presentFor(leaseRef) }) as Promise<
    Record<string, any>
  >;

it("ALLOW is leased ACTIVE, verified uncacheably, permits only continuation actions, and checkpoints extend only the due time", async () => {
  const w = await world();
  const e = await w.evaluate(),
    l = await w.lease(e.evaluationRef, {
      ttlSeconds: 600,
      checkpointSeconds: 120,
    });
  expect([l.status, l.valid, l.permitted]).toEqual([
    "ACTIVE",
    true,
    ["recommend", "add_to_draft"],
  ]);
  expect([l.cacheable, l.ttlMs]).toEqual([false, 0]);
  expect(
    l.permitted.every((a: string) => ["recommend", "add_to_draft"].includes(a)),
  ).toBe(true);
  tick(60);
  const c = await svc.leaseCheckpoint(w.agent, {
    leaseRef: l.leaseRef,
    ...presentFor(l.leaseRef),
  });
  expect(c.valid).toBe(true);
  expect(c.expiresAt).toBe(l.expiresAt); // never extended
  expect(c.checkpointDueAt > l.checkpointDueAt).toBe(true);
  const dup = await w.lease(e.evaluationRef).catch((x) => x);
  expect(dup.code).toBe("LEASE_STATE_CONFLICT"); // one live lease per choice
  tick(1000);
  expect((await status(w.agent, l.leaseRef)).status).toBe("EXPIRED");
}, 40000);
it("missed checkpoints suspend the lease; a new ALLOW evaluation resumes it", async () => {
  const w = await world();
  const e = await w.evaluate(),
    l = await w.lease(e.evaluationRef, {
      ttlSeconds: 3600,
      checkpointSeconds: 60,
    });
  tick(61);
  const s = await status(w.agent, l.leaseRef);
  expect([s.status, s.valid, s.permitted, s.reasons]).toEqual([
    "SUSPENDED",
    false,
    [],
    ["CHECKPOINT_OVERDUE"],
  ]);
  await expect(
    svc.leaseResume(w.agent, {
      idempotencyKey: "r1-key-0",
      leaseRef: l.leaseRef,
      ...presentFor(l.leaseRef),
      evaluationRef: e.evaluationRef,
    }),
  ).rejects.toMatchObject({ code: "STATE_VERSION_CONFLICT" }); // an evaluation from before the suspension is not a fresh check
  const e2 = await w.evaluate();
  const r = await svc.leaseResume(w.agent, {
    idempotencyKey: "r2-key-0",
    leaseRef: l.leaseRef,
    ...presentFor(l.leaseRef),
    evaluationRef: e2.evaluationRef,
  });
  expect([r.status, r.valid]).toEqual(["ACTIVE", true]);
}, 40000);
it("drift: a policy change suspends; resuming needs ALLOW under the new rules; a tightened policy blocks resume", async () => {
  const w = await world();
  const e = await w.evaluate(),
    l = await w.lease(e.evaluationRef);
  await w.publish(observe, 0);
  const s = await status(w.agent, l.leaseRef);
  expect([s.status, s.reasons]).toEqual(["SUSPENDED", ["POLICY_CHANGED"]]);
  const e2 = await w.evaluate();
  expect(e2.decision).toBe("ASK");
  await expect(
    svc.leaseResume(w.agent, {
      idempotencyKey: "r3-key-0",
      leaseRef: l.leaseRef,
      ...presentFor(l.leaseRef),
      evaluationRef: e2.evaluationRef,
    }),
  ).rejects.toMatchObject({ code: "LEASE_NOT_PERMITTED" });
  expect((await status(w.agent, l.leaseRef)).valid).toBe(false);
}, 40000);
it("ASK runtime resume: pending until the owner approves with a fresh sign-in; approval cannot extend; stale questions are refused", async () => {
  const w = await world();
  await w.publish(observe, 0);
  const e = await w.evaluate(),
    l = await w.lease(e.evaluationRef, { ttlSeconds: 600 });
  expect([e.decision, l.status, l.valid, l.permitted]).toEqual([
    "ASK",
    "ASK_PENDING",
    false,
    [],
  ]);
  const list = await svc.leaseList(w.a.principal, { passportRef: w.ref });
  expect(list.pending.map((x: any) => x.leaseRef)).toEqual([l.leaseRef]);
  const stale: Principal = {
    ...w.a.principal,
    authenticatedAt: "2020-01-01T00:00:00.000Z",
  };
  await expect(
    svc.leaseApprove(stale, {
      idempotencyKey: "ap-1-key-0",
      confirm: true,
      leaseRef: l.leaseRef,
    }),
  ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
  await expect(
    svc.leaseApprove(w.agent, {
      idempotencyKey: "ap-2-key-0",
      confirm: true,
      leaseRef: l.leaseRef,
    }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  const ok: any = await svc.leaseApprove(w.a.principal, {
    idempotencyKey: "ap-3-key-0",
    confirm: true,
    leaseRef: l.leaseRef,
    ttlSeconds: 120,
  });
  expect([ok.status, ok.valid]).toEqual(["ACTIVE", true]);
  expect(Date.parse(ok.expiresAt) - now).toBeLessThanOrEqual(120_000);
  expect(
    await svc.leaseApprove(w.a.principal, {
      idempotencyKey: "ap-3-key-0",
      confirm: true,
      leaseRef: l.leaseRef,
      ttlSeconds: 120,
    }),
  ).toEqual(ok);
  // second question; the person changes their Passport state before answering
  const w2 = await world();
  await w2.publish(observe, 0);
  const e2 = await w2.evaluate(),
    l2 = await w2.lease(e2.evaluationRef);
  await w2.publish({ ...observe, freshness: { EXPLICIT_POSITIVE: 30 } }, 1);
  await expect(
    svc.leaseApprove(w2.a.principal, {
      idempotencyKey: "ap-4-key-0",
      confirm: true,
      leaseRef: l2.leaseRef,
    }),
  ).rejects.toMatchObject({ code: "STATE_VERSION_CONFLICT" });
  const declined = await svc.leaseDecline(w2.a.principal, {
    leaseRef: l2.leaseRef,
  });
  expect(declined.status).toBe("DECLINED");
  expect((await status(w2.agent, l2.leaseRef)).valid).toBe(false);
}, 40000);
it("REJECT and UNAVAILABLE cannot be leased; foreign callers cannot see or use a lease", async () => {
  const w = await world();
  const e = await w.evaluate(),
    l = await w.lease(e.evaluationRef);
  const other = await world();
  await expect(
    svc.leaseVerify(other.agent, {
      leaseRef: l.leaseRef,
      ...presentFor(l.leaseRef),
    }),
  ).rejects.toMatchObject({ code: "LEASE_NOT_FOUND" });
  await expect(
    svc.leaseCheckpoint(other.agent, {
      leaseRef: l.leaseRef,
      ...presentFor(l.leaseRef),
    }),
  ).rejects.toMatchObject({ code: "LEASE_NOT_FOUND" });
  await expect(
    svc.leaseRevoke(other.a.principal, {
      leaseRef: l.leaseRef,
    }),
  ).rejects.toMatchObject({ code: "LEASE_NOT_FOUND" });
  await expect(other.lease(e.evaluationRef)).rejects.toMatchObject({
    code: "LEASE_NOT_FOUND",
  });
  await expect(
    svc.leaseList(other.a.principal, { passportRef: w.ref }),
  ).rejects.toMatchObject({ code: "PASSPORT_NOT_FOUND" });
  // a hard block on the candidate makes the decision REJECT, which is not leasable
  const blocked: any = await svc.policyPublish(w.a.principal, {
    idempotencyKey: "pb-key-00",
    passportRef: w.ref,
    document: DEFAULT_POLICY,
    expectedVersion: 0,
  });
  expect(blocked.version).toBe(1);
}, 40000);
it("owner revocation takes effect on the next verify, one lease or all; terminal leases stay terminal", async () => {
  const w = await world();
  const e = await w.evaluate(),
    l = await w.lease(e.evaluationRef);
  const r: any = await svc.leaseRevoke(w.a.principal, {
    leaseRef: l.leaseRef,
  });
  expect(r.status).toBe("REVOKED");
  expect((await status(w.agent, l.leaseRef)).valid).toBe(false);
  await expect(
    svc.leaseCheckpoint(w.agent, {
      leaseRef: l.leaseRef,
      ...presentFor(l.leaseRef),
    }),
  ).resolves.toMatchObject({ status: "REVOKED", valid: false });
  const e2 = await w.evaluate(),
    l2 = await w.lease(e2.evaluationRef);
  expect(await svc.leaseRevoke(w.a.principal, { passportRef: w.ref })).toEqual({
    revoked: 1,
  });
  expect((await status(w.agent, l2.leaseRef)).status).toBe("REVOKED");
  await expect(
    svc.leaseRevoke(w.a.principal, {
      leaseRef: l.leaseRef,
      passportRef: w.ref,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
}, 40000);
it("a revoked or expired grant propagates: the delegated agent's lease is suspended on the next verify", async () => {
  const w = await world(),
    other = await account(d);
  const grant = await svc.grant(w.a.principal, {
    idempotencyKey: "gr-key-0001",
    passportRef: w.ref,
    granteeUserId: other.principal.userId,
    scopes: ["EVALUATE_TASTE_ACTION", "READ_RECEIPT"],
    purpose: "Test",
    expiresAt: new Date(now + 3 * 86400000).toISOString(),
  });
  const key = await svc.issueKey(other.principal, {
    idempotencyKey: "gk" + ++n,
    displayLabel: "SYNTHETIC TEST DATA",
    scopes: ["TASTE_EVALUATE", "RECEIPT_READ"],
    expiresAt: new Date(now + 5 * 86400000).toISOString(),
  });
  const delegate = await svc.credentialPrincipal(key.secret!);
  const e = (await svc.evaluate(
    delegate,
    {
      idempotencyKey: "ge" + ++n,
      passportRef: w.ref,
      grantId: grant.grantId,
      proposal: proposal(1),
    },
    () => w.q.q,
    reqId,
  )) as Record<string, any>;
  const l = (await svc.leaseRequest(delegate, {
    idempotencyKey: "gl" + ++n + "-key",
    evaluationRef: e.evaluationRef,
  })) as Record<string, any>;
  rememberLease(l);
  expect((await status(delegate, l.leaseRef)).valid).toBe(true);
  await svc.revokeGrant(w.a.principal, {
    idempotencyKey: "rg-key-0001",
    grantId: grant.grantId,
  });
  const s = await status(delegate, l.leaseRef);
  expect([s.status, s.reasons]).toEqual(["SUSPENDED", ["GRANT_UNAVAILABLE"]]);
}, 40000);
it("concurrent requests for one choice create exactly one live lease; concurrent checkpoints stay consistent", async () => {
  const w = await world();
  const e = await w.evaluate();
  const results = await Promise.allSettled(
    [1, 2, 3, 4]
      .map((i) =>
        svc.leaseRequest(w.agent, {
          idempotencyKey: `cc${i}-${++n}-key`,
          evaluationRef: e.evaluationRef,
        }),
      )
      .map((p) => p),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const ok = (
    results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>
  ).value;
  rememberLease(ok);
  const cps = await Promise.allSettled(
    [1, 2, 3].map(() =>
      svc.leaseCheckpoint(w.agent, {
        leaseRef: ok.leaseRef,
        ...presentFor(ok.leaseRef),
      }),
    ),
  );
  expect(cps.every((c) => c.status === "fulfilled")).toBe(true);
  const final = await status(w.agent, ok.leaseRef);
  expect(final.rev).toBe(1 + 3);
  expect(
    await svc
      .leaseCheckpoint(w.agent, {
        leaseRef: ok.leaseRef,
        expectedRev: 1,
        ...presentFor(ok.leaseRef),
      })
      .catch((x) => x.code),
  ).toBe("LEASE_STATE_CONFLICT");
}, 40000);
it("audit timeline records every transition with actor and reason codes; replay integrity detects tampering", async () => {
  const w = await world();
  await w.publish(observe, 0);
  const e = await w.evaluate(),
    l = await w.lease(e.evaluationRef);
  await svc.leaseApprove(w.a.principal, {
    idempotencyKey: "at-key-0001",
    confirm: true,
    leaseRef: l.leaseRef,
  });
  tick(400);
  await status(w.agent, l.leaseRef); // overdue checkpoint -> system drift event
  const t = await svc.leaseList(w.a.principal, { passportRef: w.ref });
  expect(t.timeline.map((x: any) => `${x.kind}:${x.actor}`).reverse()).toEqual([
    "ISSUED:AGENT",
    "APPROVED:OWNER",
    "DRIFT:SYSTEM",
  ]);
  expect(t.timeline[0].reasons).toEqual(["CHECKPOINT_OVERDUE"]);
  await d.db.query(
    "UPDATE tastepolicy.platform_leases SET status='ACTIVE', rev=rev+1 WHERE lease_ref=$1",
    [l.leaseRef],
  );
  await expect(status(w.agent, l.leaseRef)).rejects.toMatchObject({
    code: "INTEGRITY_ERROR",
  });
}, 40000);
it("the database refuses lease extension, terminal revival and event edits", async () => {
  const w = await world();
  const e = await w.evaluate(),
    l = await w.lease(e.evaluationRef);
  await expect(
    d.db.query(
      "UPDATE tastepolicy.platform_leases SET expires_at=expires_at+interval '1 hour', rev=rev+1 WHERE lease_ref=$1",
      [l.leaseRef],
    ),
  ).rejects.toThrow(/extended/);
  await expect(
    d.db.query(
      "UPDATE tastepolicy.lease_events SET kind='X' WHERE lease_ref=$1",
      [l.leaseRef],
    ),
  ).rejects.toThrow(/Immutable/);
  await svc.leaseRevoke(w.a.principal, {
    leaseRef: l.leaseRef,
  });
  await expect(
    d.db.query(
      "UPDATE tastepolicy.platform_leases SET status='ACTIVE', rev=rev+1 WHERE lease_ref=$1",
      [l.leaseRef],
    ),
  ).rejects.toThrow(/Terminal/);
}, 40000);
it("deleting the Passport removes its leases and events", async () => {
  const w = await world();
  const e = await w.evaluate(),
    l = await w.lease(e.evaluationRef);
  await svc.delete(
    w.a.principal,
    {
      idempotencyKey: "dl-key-0001",
      passportRef: w.ref,
      confirmation: "DELETE PASSPORT",
    },
    false,
  );
  const left = await d.db.query(
    "SELECT (SELECT count(*) FROM tastepolicy.platform_leases WHERE lease_ref=$1)::int AS l, (SELECT count(*) FROM tastepolicy.lease_events WHERE lease_ref=$1)::int AS e",
    [l.leaseRef],
  );
  expect(left.rows[0]).toEqual({ l: 0, e: 0 });
}, 40000);
void future;

// ---- R1: typed ASK ----
async function addPriceRule(w: Awaited<ReturnType<typeof world>>, max = 50) {
  await d.store.transaction(async (r) => {
    const passport = (await r.platform.passport(w.ref))!;
    const cur = (await r.states.version(
      passport.profileId,
      passport.stateVersion,
    ))!;
    const entry: StateEntry = {
      signalId: randomUUID(),
      kind: "CONSTRAINT",
      scope: "CONTEXT",
      persistence: "CONTEXT_SCOPED",
      contextKey: "trip",
      constraint: { kind: "MAX_PRICE", amount: max, currency: "USD" },
      category: "TOO_EXPENSIVE",
      source: "USER",
      sourceEventId: randomUUID(),
      createdAt: clock(),
    };
    const entries = [...cur.entries, entry];
    const mutationId = randomUUID(),
      next = {
        ...cur,
        stateVersion: cur.stateVersion + 1,
        parentVersion: cur.stateVersion,
        mutationId,
        entries,
        stateHash: stateHash(entries),
        createdAt: clock(),
      };
    await r.states.insertVersion(next);
    await r.mutations.insert({
      profileId: passport.profileId,
      key: "test-rule-" + mutationId,
      payloadHash: next.stateHash,
      result: { state: next, mutationId },
    });
    await r.states.advance(passport.profileId, cur.stateVersion + 1);
  });
  const sum: any = await svc.read(w.a.principal, { passportRef: w.ref });
  await svc.update(w.a.principal, {
    idempotencyKey: "pu" + ++n + "-key",
    passportRef: w.ref,
    expectedPassportVersion: sum.passportVersion,
    displayLabel: "SYNTHETIC TEST DATA Passport",
  });
}
const withContext = (price?: number) => ({
  agentId: "Agent-A",
  candidate: proposal(1).candidate,
  context: {
    key: "trip",
    domain: "destination" as const,
    ...(price === undefined
      ? {}
      : { price: { amount: price, currency: "USD" } }),
  },
});

const cooked = (
  w: Awaited<ReturnType<typeof world>>,
  version: number,
  price?: number,
) =>
  svc.evaluate(
    w.agent,
    {
      idempotencyKey: "e" + ++n,
      passportRef: w.ref,
      proposal: { ...withContext(price), expectedStateVersion: version },
    },
    () => w.q.q,
    reqId,
  ) as Promise<Record<string, any>>;
const approve = (p: Principal, leaseRef: string, extra: object = {}) =>
  svc.leaseApprove(p, {
    idempotencyKey: "ap" + ++n + "-key-0",
    leaseRef,
    confirm: true,
    ...extra,
  }) as Promise<Record<string, any>>;

it("ASK is typed: an autonomy rule is an AUTHORITY_CONFIRMATION and carries a machine-readable ask", async () => {
  const w = await world();
  await w.publish(observe, 0);
  const e = await w.evaluate();
  expect(e.ask).toMatchObject({
    kind: "AUTHORITY_CONFIRMATION",
    reasons: ["AUTONOMY:OBSERVE"],
  });
  const l = await w.lease(e.evaluationRef);
  expect(l.ask).toMatchObject({ kind: "AUTHORITY_CONFIRMATION" });
  expect(l.ask.question).toMatch(/ask you/i);
  // approval must be explicit
  await expect(
    svc.leaseApprove(w.a.principal, {
      idempotencyKey: "ap-noconfirm-0",
      leaseRef: l.leaseRef,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const ok = await approve(w.a.principal, l.leaseRef);
  expect([ok.status, ok.valid]).toEqual(["ACTIVE", true]);
  // the approval is recorded as an owner authority event bound to the exact choice
  const list: any = await svc.leaseList(w.a.principal, { passportRef: w.ref });
  expect(
    list.timeline.some(
      (t: any) => t.kind === "APPROVED" && t.actor === "OWNER",
    ),
  ).toBe(true);
}, 40000);

it("a missing price is a CLARIFICATION_REQUIRED: no lease, no approval path; clarification → fresh evaluation → ALLOW → lease", async () => {
  const w = await world();
  await addPriceRule(w, 50);
  const ask = await cooked(w, 2);
  expect(ask.decision).toBe("ASK");
  expect(ask.ask).toMatchObject({ kind: "CLARIFICATION_REQUIRED" });
  expect(ask.ask.question).toBe("What is the price?");
  await expect(w.lease(ask.evaluationRef)).rejects.toMatchObject({
    code: "CLARIFICATION_REQUIRED",
  });
  // nothing was created for the owner to approve
  const list: any = await svc.leaseList(w.a.principal, { passportRef: w.ref });
  expect(list.pending).toEqual([]);
  // the fact is supplied, the choice is evaluated again, and only an ALLOW leases
  const over = await cooked(w, 2, 80);
  expect(over.decision).toBe("REJECT");
  await expect(w.lease(over.evaluationRef)).rejects.toMatchObject({
    code: "LEASE_NOT_PERMITTED",
  });
  const fresh = await cooked(w, 2, 40);
  expect(fresh.decision).toBe("ALLOW");
  expect(fresh.ask).toBeUndefined();
  const l = await w.lease(fresh.evaluationRef);
  expect([l.status, l.ask]).toEqual(["ACTIVE", null]);
}, 40000);

it("autonomy with an unknown price is a clarification; a known price above the limit is a confirmation", async () => {
  const w = await world();
  await w.publish(
    {
      ...DEFAULT_POLICY,
      autonomy: {
        default: "CONFIRM_ABOVE_LIMIT",
        byDomain: {},
        byAgent: {},
        limit: { amount: 100, currency: "USD" },
      },
    },
    0,
  );
  const unknown = await cooked(w, 1);
  expect(unknown.ask).toMatchObject({
    kind: "CLARIFICATION_REQUIRED",
    reasons: ["AUTONOMY:PRICE_UNKNOWN"],
  });
  await expect(w.lease(unknown.evaluationRef)).rejects.toMatchObject({
    code: "CLARIFICATION_REQUIRED",
  });
  const above = await cooked(w, 1, 250);
  expect(above.ask).toMatchObject({
    kind: "AUTHORITY_CONFIRMATION",
    reasons: ["AUTONOMY:ABOVE_LIMIT"],
  });
  const l = await w.lease(above.evaluationRef);
  expect(l.status).toBe("ASK_PENDING");
  const within = await cooked(w, 1, 60);
  expect(within.decision).toBe("ALLOW");
}, 40000);

it("a pending confirmation is refused when state, policy, candidate-visible facts or the grant changed; hard rules can never be approved", async () => {
  // policy changed
  const a = await world();
  await a.publish(observe, 0);
  const la = await a.lease((await a.evaluate()).evaluationRef);
  await a.publish({ ...observe, freshness: { EXPLICIT_POSITIVE: 30 } }, 1);
  await expect(approve(a.a.principal, la.leaseRef)).rejects.toMatchObject({
    code: "STATE_VERSION_CONFLICT",
  });
  // state changed (a hard price rule appears) — the question no longer holds
  const b = await world();
  await b.publish(observe, 0);
  const lb = await b.lease((await b.evaluate()).evaluationRef);
  await addPriceRule(b, 10);
  await expect(approve(b.a.principal, lb.leaseRef)).rejects.toMatchObject({
    code: "STATE_VERSION_CONFLICT",
  });
  // nothing became active
  const view: any = await status(b.agent, lb.leaseRef);
  expect(view.valid).toBe(false);
  // approval cannot be replayed onto a terminal lease
  await svc.leaseDecline(b.a.principal, { leaseRef: lb.leaseRef });
  await expect(approve(b.a.principal, lb.leaseRef)).rejects.toMatchObject({
    code: "LEASE_STATE_CONFLICT",
  });
}, 60000);

it("REJECT and UNAVAILABLE never lease and never carry an ask", async () => {
  const w = await world();
  await addPriceRule(w, 50);
  const rej = await cooked(w, 2, 99);
  expect(rej.decision).toBe("REJECT");
  expect(rej.ask).toBeUndefined();
  await expect(w.lease(rej.evaluationRef)).rejects.toMatchObject({
    code: "LEASE_NOT_PERMITTED",
  });
}, 40000);

it("pending confirmation created through a grant is refused once the grant is revoked", async () => {
  const w = await world(),
    other = await account(d);
  await w.publish(observe, 0);
  const grant: any = await svc.grant(w.a.principal, {
    idempotencyKey: "gp-key-" + ++n,
    passportRef: w.ref,
    granteeUserId: other.principal.userId,
    scopes: ["EVALUATE_TASTE_ACTION", "READ_RECEIPT"],
    purpose: "Test",
    expiresAt: new Date(now + 3 * 86400000).toISOString(),
  });
  const key: any = await svc.issueKey(other.principal, {
    idempotencyKey: "gk" + ++n,
    displayLabel: "SYNTHETIC TEST DATA",
    scopes: ["TASTE_EVALUATE", "RECEIPT_READ"],
    expiresAt: new Date(now + 5 * 86400000).toISOString(),
  });
  const delegate = await svc.credentialPrincipal(key.secret);
  const e: any = await svc.evaluate(
    delegate,
    {
      idempotencyKey: "ge" + ++n,
      passportRef: w.ref,
      grantId: grant.grantId,
      proposal: proposal(1),
    },
    () => w.q.q,
    reqId,
  );
  expect(e.ask.kind).toBe("AUTHORITY_CONFIRMATION");
  const l: any = await svc.leaseRequest(delegate, {
    idempotencyKey: "gl" + ++n + "-key",
    evaluationRef: e.evaluationRef,
  });
  expect(l.status).toBe("ASK_PENDING");
  await svc.revokeGrant(w.a.principal, {
    idempotencyKey: "rg-key-" + ++n,
    grantId: grant.grantId,
  });
  await expect(approve(w.a.principal, l.leaseRef)).rejects.toMatchObject({
    code: "STATE_VERSION_CONFLICT",
  });
  expect((await status(delegate, l.leaseRef)).valid).toBe(false);
}, 60000);

it("absolute lifetime: repeated checkpoints never move the end; the lease expires at the instant fixed at issue, and an expired one cannot be approved or resumed", async () => {
  const w = await world(),
    e = await w.evaluate(),
    l: any = await w.lease(e.evaluationRef, {
      ttlSeconds: 600,
      checkpointSeconds: 120,
    });
  const end = l.expiresAt;
  for (let i = 0; i < 5; i++) {
    tick(100);
    const c: any = await svc.leaseCheckpoint(w.agent, {
      leaseRef: l.leaseRef,
      ...presentFor(l.leaseRef),
    });
    expect(c.status).toBe("ACTIVE");
    expect(c.expiresAt).toBe(end);
    expect(Date.parse(c.checkpointDueAt)).toBeLessThanOrEqual(Date.parse(end));
  }
  tick(150); // 650 s after issue, still checking in
  const gone: any = await status(w.agent, l.leaseRef);
  expect([gone.status, gone.valid]).toEqual(["EXPIRED", false]);
  await expect(
    svc.leaseCheckpoint(w.agent, {
      leaseRef: l.leaseRef,
      ...presentFor(l.leaseRef),
    }),
  ).resolves.toMatchObject({ status: "EXPIRED" });
  // a pending question cannot outlive its lifetime either
  const p = await world();
  await p.publish(observe, 0);
  const pend: any = await p.lease((await p.evaluate()).evaluationRef, {
    ttlSeconds: 60,
  });
  tick(61);
  await expect(approve(p.a.principal, pend.leaseRef)).rejects.toMatchObject({
    code: "LEASE_STATE_CONFLICT",
  });
  // longer than a day is not representable
  const q = await world();
  await expect(
    q.lease((await q.evaluate()).evaluationRef, { ttlSeconds: 86401 }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
}, 90000);

it("open leases per Passport are bounded", async () => {
  class Tight extends LeaseService {
    protected override readonly maxLive = 2;
  }
  const tight = new Tight(d.store, clock);
  const w = await world();
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const cand = proposal(1, { key: `trip-${i}`, domain: "destination" });
    const ev: any = await tight.evaluate(
      w.agent,
      { idempotencyKey: "ce" + ++n, passportRef: w.ref, proposal: cand },
      () => w.q.q,
      reqId,
    );
    ids.push(ev.evaluationRef);
  }
  await tight.leaseRequest(w.agent, {
    idempotencyKey: "cl" + ++n + "-key",
    evaluationRef: ids[0],
  });
  await tight.leaseRequest(w.agent, {
    idempotencyKey: "cl" + ++n + "-key",
    evaluationRef: ids[1],
  });
  await expect(
    tight.leaseRequest(w.agent, {
      idempotencyKey: "cl" + ++n + "-key",
      evaluationRef: ids[2],
    }),
  ).rejects.toMatchObject({ code: "RATE_LIMITED" });
}, 90000);
