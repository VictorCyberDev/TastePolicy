// @vitest-environment node
import { beforeAll, afterAll, it, expect } from "vitest";
import {
  platformDatabase,
  account,
  init,
  subjectProvider,
  future,
} from "./platform-fixtures";
import { PolicyService } from "@/server/platform/policy-service";
import { DEFAULT_POLICY, type PolicyDocument } from "@/lib/policy/types";
import { proposal, reqId } from "./interactive-fixtures";
import type { Principal } from "@/lib/platform/types";

let d: Awaited<ReturnType<typeof platformDatabase>>;
let svc: PolicyService;
beforeAll(async () => {
  d = await platformDatabase();
  svc = new PolicyService(d.store);
}, 30000);
afterAll(async () => d?.db.close());

const observe: PolicyDocument = {
  ...DEFAULT_POLICY,
  autonomy: { default: "OBSERVE", byDomain: {}, byAgent: {} },
};
async function world() {
  const a = await account(d),
    q = subjectProvider(),
    passport = await svc.initialize(a.principal, init(), () => q.q);
  let n = 0;
  const evaluate = (
    p: Principal,
    key = `e${++n}`,
    who = passport.passportRef,
    grantId?: string,
  ) =>
    svc.evaluate(
      p,
      {
        idempotencyKey: key,
        passportRef: who,
        ...(grantId ? { grantId } : {}),
        proposal: proposal(1),
      },
      () => q.q,
      reqId,
    ) as Promise<Record<string, any>>;
  const publish = (
    document: PolicyDocument,
    expectedVersion: number,
    p = a.principal,
  ) =>
    svc.policyPublish(p, {
      idempotencyKey: `p${++n}`,
      passportRef: passport.passportRef,
      document,
      expectedVersion,
    });
  return { a, q, passport, evaluate, publish, ref: passport.passportRef };
}

it("without a policy the response and record are unchanged (no policy field)", async () => {
  const w = await world(),
    r = await w.evaluate(w.a.principal);
  expect(r.decision).toBe("ALLOW");
  expect(r).not.toHaveProperty("policy");
  expect(
    (await svc.receipt(w.a.principal, { evaluationRef: r.evaluationRef }))
      .decision,
  ).toBe("ALLOW");
}, 30000);
it("a published ceiling lowers ALLOW to ASK, is traced, and leaves the recorded base evaluation intact", async () => {
  const w = await world();
  const v1: any = await w.publish(observe, 0);
  expect(v1.version).toBe(1);
  const r = await w.evaluate(w.a.principal);
  expect([r.decision, r.decisionBasis]).toEqual(["ASK", "AUTONOMY_CEILING"]);
  expect(r.policy).toMatchObject({ version: 1, baseDecision: "ALLOW" });
  expect(r.continuation.permitted).toEqual(["request_clarification"]);
  const rec: any = await svc.receipt(w.a.principal, {
    evaluationRef: r.evaluationRef,
  });
  expect(rec.decision).toBe("ASK");
  expect(rec.authorizationEvidence.decision.outcome).toBe("ALLOW"); // recorded base is untouched
  const again = await w.evaluate(w.a.principal, "same-key-1");
  expect(again.decision).toBe("ASK");
}, 30000);
it("publishing is versioned, optimistic, idempotent; loosening needs a fresh sign-in, tightening does not", async () => {
  const w = await world();
  await w.publish(observe, 0);
  await expect(w.publish(observe, 0)).rejects.toMatchObject({
    code: "STATE_VERSION_CONFLICT",
  });
  const loosen = {
    ...observe,
    autonomy: { ...observe.autonomy, default: "AUTONOMOUS" as const },
  };
  const stale: Principal = {
    ...w.a.principal,
    authenticatedAt: "2020-01-01T00:00:00.000Z",
  };
  await expect(w.publish(loosen, 1, stale)).rejects.toMatchObject({
    code: "RECENT_AUTH_REQUIRED",
  });
  const v2: any = await w.publish(loosen, 1);
  expect([v2.version, v2.parentVersion]).toEqual([2, 1]);
  // tightening with a stale session is allowed
  const v3: any = await w.publish(observe, 2, stale);
  expect(v3.version).toBe(3);
  await expect(
    svc.policyPublish(w.a.principal, {
      idempotencyKey: "dup",
      passportRef: w.ref,
      document: { schemaVersion: "bad" },
      expectedVersion: 3,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const view = await svc.policyGet(w.a.principal, { passportRef: w.ref });
  expect(view.active?.version).toBe(3);
  expect(view.history.map((h: any) => h.version)).toEqual([3, 2, 1]);
}, 30000);
it("a temporary override raises ASK to ALLOW until revoked; creating one needs a fresh sign-in", async () => {
  const w = await world();
  await w.publish(observe, 0);
  const stale: Principal = {
    ...w.a.principal,
    authenticatedAt: "2020-01-01T00:00:00.000Z",
  };
  const body = {
    idempotencyKey: "ov-1",
    passportRef: w.ref,
    effect: "ALLOW_THROUGH_ASK",
    scope: { domain: "destination" },
    days: 3,
  };
  await expect(svc.overrideCreate(stale, body)).rejects.toMatchObject({
    code: "RECENT_AUTH_REQUIRED",
  });
  const o: any = await svc.overrideCreate(w.a.principal, body);
  expect(await svc.overrideCreate(w.a.principal, body)).toEqual(o); // idempotent
  const allowed = await w.evaluate(w.a.principal);
  expect([allowed.decision, allowed.decisionBasis]).toEqual([
    "ALLOW",
    "USER_TEMPORARY_OVERRIDE",
  ]);
  await svc.overrideRevoke(w.a.principal, {
    passportRef: w.ref,
    overrideId: o.overrideId,
  });
  expect((await w.evaluate(w.a.principal)).decision).toBe("ASK");
  // the earlier evaluation still replays as it was decided
  const x = await svc.policyExplain(w.a.principal, {
    evaluationRef: allowed.evaluationRef,
  });
  expect(x.final.outcome).toBe("ALLOW");
}, 30000);
it("cultural-reject override needs explicit confirmation and a candidate scope; agent-only scopes are invalid", async () => {
  const w = await world();
  const bad = (extra: object) =>
    svc.overrideCreate(w.a.principal, {
      idempotencyKey: crypto.randomUUID().slice(0, 12),
      passportRef: w.ref,
      ...extra,
    });
  await expect(
    bad({
      effect: "ALLOW_THROUGH_CULTURAL_REJECT",
      scope: { candidateId: "x" },
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    bad({
      effect: "ALLOW_THROUGH_CULTURAL_REJECT",
      scope: { domain: "place" },
      confirmCulturalReject: true,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    bad({ effect: "ALLOW_THROUGH_ASK", scope: { agentId: "a" } }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    bad({ effect: "ALLOW_THROUGH_ASK", scope: { domain: "place" }, days: 31 }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
}, 30000);
it("only the owner's session can author or inspect; credentials read only the resolved summary", async () => {
  const w = await world(),
    other = await account(d);
  await expect(
    svc.policyGet(other.principal, { passportRef: w.ref }),
  ).rejects.toMatchObject({ code: "PASSPORT_NOT_FOUND" });
  await expect(w.publish(observe, 0, other.principal)).rejects.toMatchObject({
    code: "PASSPORT_NOT_FOUND",
  });
  const k = await svc.issueKey(w.a.principal, {
    idempotencyKey: "k",
    displayLabel: "SYNTHETIC TEST DATA",
    scopes: ["PASSPORT_READ"],
    expiresAt: future(),
  });
  const cred = await svc.credentialPrincipal(k.secret!);
  await expect(
    svc.policyGet(cred, { passportRef: w.ref }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  await expect(w.publish(observe, 0, cred)).rejects.toMatchObject({
    code: "ACCESS_DENIED",
  });
  await w.publish(observe, 0);
  const s = await svc.policySummary(cred, { passportRef: w.ref });
  expect(s).toMatchObject({ policyVersion: 1, autonomy: { place: "OBSERVE" } });
  expect(JSON.stringify(s)).not.toMatch(/overrideId|history/);
  const k2 = await svc.issueKey(other.principal, {
    idempotencyKey: "k2",
    displayLabel: "SYNTHETIC TEST DATA",
    scopes: ["PASSPORT_READ"],
    expiresAt: future(),
  });
  await expect(
    svc.policySummary(await svc.credentialPrincipal(k2.secret!), {
      passportRef: w.ref,
    }),
  ).rejects.toMatchObject({ code: "GRANT_REQUIRED" });
}, 30000);
it("simulation, impact and explanation are pure re-decisions of recorded evaluations", async () => {
  const w = await world();
  const r1 = await w.evaluate(w.a.principal),
    r2 = await w.evaluate(w.a.principal);
  expect([r1.decision, r2.decision]).toEqual(["ALLOW", "ALLOW"]);
  const sim = await svc.policySimulate(w.a.principal, {
    passportRef: w.ref,
    evaluationRef: r1.evaluationRef,
    document: observe,
  });
  expect([sim.current.outcome, sim.proposed.outcome, sim.changed]).toEqual([
    "ALLOW",
    "ASK",
    true,
  ]);
  const impact = await svc.policyImpact(w.a.principal, {
    passportRef: w.ref,
    document: observe,
  });
  expect(impact).toMatchObject({
    total: 2,
    changed: 2,
    transitions: { "ALLOW->ASK": 2 },
  });
  const none = await svc.policyImpact(w.a.principal, {
    passportRef: w.ref,
    document: DEFAULT_POLICY,
  });
  expect(none.changed).toBe(0);
  await w.publish(observe, 0);
  const r3 = await w.evaluate(w.a.principal);
  const ex = await svc.policyExplain(w.a.principal, {
    evaluationRef: r3.evaluationRef,
  });
  expect(ex.base.outcome).toBe("ALLOW");
  expect(ex.final.trace.map((t: any) => t.step)).toContain("AUTONOMY");
  expect(ex.counterfactuals.map((c: any) => c.change)).toEqual(
    expect.arrayContaining(["RAISE_AUTONOMY", "OVERRIDE_THIS_CANDIDATE"]),
  );
  // the simulation changed nothing
  expect(
    (await svc.policyGet(w.a.principal, { passportRef: w.ref })).active
      ?.version,
  ).toBe(1);
}, 30000);
it("deleting the Passport removes its policy, overrides and decisions", async () => {
  const w = await world();
  await w.publish(observe, 0);
  await svc.overrideCreate(w.a.principal, {
    idempotencyKey: "ov-del",
    passportRef: w.ref,
    effect: "ALLOW_THROUGH_ASK",
    scope: { domain: "place" },
  });
  await w.evaluate(w.a.principal);
  await svc.delete(
    w.a.principal,
    {
      idempotencyKey: "del-1",
      passportRef: w.ref,
      confirmation: "DELETE PASSPORT",
    },
    false,
  );
  const gone = await d.db.query(
    "SELECT count(*)::int AS n FROM tastepolicy.taste_passports WHERE passport_ref=$1",
    [w.ref],
  );
  expect((gone.rows[0] as { n: number }).n).toBe(0);
  const left = await d.db.query(
    "SELECT (SELECT count(*) FROM tastepolicy.policy_versions WHERE passport_ref=$1)::int AS v, (SELECT count(*) FROM tastepolicy.policy_overrides WHERE passport_ref=$1)::int AS o, (SELECT count(*) FROM tastepolicy.platform_policy_decisions WHERE passport_ref=$1)::int AS d",
    [w.ref],
  );
  expect(left.rows[0]).toEqual({ v: 0, o: 0, d: 0 });
}, 30000);
