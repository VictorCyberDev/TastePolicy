// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- assertions over loosely typed JSON responses */
import { beforeAll, afterAll, it, expect } from "vitest";
import {
  platformDatabase,
  account,
  init,
  subjectProvider,
} from "./platform-fixtures";
import { LeaseService } from "@/server/platform/lease-service";
import {
  DEFAULT_POLICY,
  type PolicyDocument,
  type SubjectiveAction,
} from "@/lib/policy/types";
import { proposal, reqId, commitOf } from "./interactive-fixtures";
import type { Principal } from "@/lib/platform/types";

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

const ladder = (
  def: SubjectiveAction,
  extra: Partial<PolicyDocument> = {},
): PolicyDocument => ({
  ...DEFAULT_POLICY,
  actions: { default: def, byDomain: {}, byAgent: {} },
  ...extra,
});
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
  const evaluate = (
    requestedAction?: SubjectiveAction,
    p: Principal = agent,
    id = proposal(1),
  ) =>
    svc.evaluate(
      p,
      {
        idempotencyKey: "e" + ++n,
        passportRef: ref,
        proposal: id,
        ...(requestedAction ? { requestedAction } : {}),
      },
      () => q.q,
      reqId,
    ) as Promise<Record<string, any>>;
  const lease = (evaluationRef: string, extra: object = {}) =>
    svc.leaseRequest(agent, {
      idempotencyKey: "l" + ++n + "-key",
      evaluationRef,
      ...extra,
    }) as Promise<Record<string, any>>;
  const publish = (document: PolicyDocument, expectedVersion: number) =>
    svc.policyPublish(a.principal, {
      idempotencyKey: "p" + ++n + "-key",
      passportRef: ref,
      document,
      expectedVersion,
    });
  return { a, q, agent, ref, evaluate, lease, publish, key };
}

it("legacy clients (no requestedAction, no ladder) get exactly the legacy answer plus the mapped ladder", async () => {
  const w = await world();
  const e = await w.evaluate();
  expect(e.decision).toBe("ALLOW");
  expect(e.continuation.permitted).toEqual(["recommend", "add_to_draft"]);
  expect(e.continuation.permittedActions).toEqual([
    "SUGGEST",
    "RANK",
    "SHORTLIST",
    "ADD_TO_DRAFT",
  ]);
  expect(e.requestedAction).toBeUndefined();
  const l = await w.lease(e.evaluationRef);
  expect([l.status, l.permitted, l.permittedActions]).toEqual([
    "ACTIVE",
    ["recommend", "add_to_draft"],
    ["SUGGEST", "RANK", "SHORTLIST", "ADD_TO_DRAFT"],
  ]);
}, 40000);
it("a request above the owner's ceiling is a typed authority-confirmation ASK; approval yields a lease bounded to the requested action", async () => {
  const w = await world();
  await w.publish(ladder("SHORTLIST"), 0);
  const low = await w.evaluate("SHORTLIST");
  expect([low.decision, low.continuation.permittedActions]).toEqual([
    "ALLOW",
    ["SUGGEST", "RANK", "SHORTLIST"],
  ]);
  expect(low.policy.action).toMatchObject({
    requested: "SHORTLIST",
    ceiling: "SHORTLIST",
    ceilingSource: "DEFAULT",
    escalationRequired: false,
  });
  const high = await w.evaluate("ADD_TO_DRAFT");
  expect([high.decision, high.decisionBasis, high.ask.kind]).toEqual([
    "ASK",
    "ACTION_CEILING",
    "AUTHORITY_CONFIRMATION",
  ]);
  expect(high.requestedAction).toBe("ADD_TO_DRAFT");
  expect(high.continuation.permittedActions).toEqual([]);
  const l = await w.lease(high.evaluationRef);
  expect([l.status, l.permittedActions]).toEqual(["ASK_PENDING", []]);
  const ok: any = await svc.leaseApprove(w.a.principal, {
    idempotencyKey: "ap-lad-1-key",
    confirm: true,
    leaseRef: l.leaseRef,
  });
  expect([ok.status, ok.permittedActions, ok.permitted]).toEqual([
    "ACTIVE",
    ["SUGGEST", "RANK", "SHORTLIST", "ADD_TO_DRAFT"],
    ["recommend", "add_to_draft"],
  ]);
}, 60000);
it("a sensitive domain that needs fresh explicit evidence is a clarification: no lease and no approval path", async () => {
  const w = await world();
  await w.publish(
    ladder("PRESENT_AS_SELECTED", {
      sensitive: { destination: { freshExplicitDays: 1 } },
    }),
    0,
  );
  tick(3 * 86400);
  const e = await w.evaluate("SUGGEST");
  expect([e.decision, e.decisionBasis, e.ask.kind]).toEqual([
    "ASK",
    "SENSITIVE_DOMAIN",
    "CLARIFICATION_REQUIRED",
  ]);
  await expect(w.lease(e.evaluationRef)).rejects.toMatchObject({
    code: "CLARIFICATION_REQUIRED",
  });
}, 40000);
it("narrow ceiling: SUGGEST-only owner policy leases with no legacy continuation word", async () => {
  const w = await world();
  await w.publish(ladder("SUGGEST"), 0);
  const e = await w.evaluate("SUGGEST");
  const l = await w.lease(e.evaluationRef);
  expect([l.status, l.permittedActions, l.permitted]).toEqual([
    "ACTIVE",
    ["SUGGEST"],
    [],
  ]);
}, 40000);
it("publishing a higher ceiling is a widening change and needs recent authentication", async () => {
  const w = await world();
  await w.publish(ladder("SUGGEST"), 0);
  const stale: Principal = {
    ...w.a.principal,
    authenticatedAt: "2020-01-01T00:00:00.000Z",
  };
  await expect(
    svc.policyPublish(stale, {
      idempotencyKey: "p-wide-key-1",
      passportRef: w.ref,
      document: ladder("PRESENT_AS_SELECTED"),
      expectedVersion: 1,
    }),
  ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
  await expect(
    svc.policyPublish(stale, {
      idempotencyKey: "p-narrow-key-1",
      passportRef: w.ref,
      document: ladder("SUGGEST", {
        sensitive: { destination: { alwaysAsk: true } },
      }),
      expectedVersion: 1,
    }),
  ).resolves.toBeTruthy();
}, 40000);

it("review fix: a resumed lease takes its ladder from the fresh evaluation, never the wider one it started with", async () => {
  const w = await world();
  await w.publish(ladder("PRESENT_AS_SELECTED"), 0);
  const e1 = await w.evaluate("ADD_TO_DRAFT");
  const l1 = await w.lease(e1.evaluationRef);
  expect(l1.permittedActions).toEqual([
    "SUGGEST",
    "RANK",
    "SHORTLIST",
    "ADD_TO_DRAFT",
    "PRESENT_AS_SELECTED",
  ]);
  // the owner tightens the rules: the lease pauses
  await w.publish(ladder("SUGGEST"), 1);
  tick(5);
  expect(
    (await svc.leaseVerify(w.agent, { leaseRef: l1.leaseRef, ...commitOf(l1) }))
      .status,
  ).toBe("SUSPENDED");
  tick(5);
  const e2 = await w.evaluate("SUGGEST");
  expect(e2.decision).toBe("ALLOW");
  const back: any = await svc.leaseResume(w.agent, {
    idempotencyKey: "rs-narrow-key",
    leaseRef: l1.leaseRef,
    evaluationRef: e2.evaluationRef,
    ...commitOf(l1),
  });
  expect([back.status, back.permittedActions, back.permitted]).toEqual([
    "ACTIVE",
    ["SUGGEST"],
    [],
  ]);
}, 60000);
