// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- assertions over loosely typed JSON responses */
import { beforeAll, afterAll, it, expect } from "vitest";
import {
  platformDatabase,
  account,
  init,
  subjectProvider,
} from "./platform-fixtures";
import { ActivationService } from "@/server/platform/activation-service";
import { DEFAULT_POLICY } from "@/lib/policy/types";
import { proposal, reqId } from "./interactive-fixtures";

let d: Awaited<ReturnType<typeof platformDatabase>>;
let svc: ActivationService;
beforeAll(async () => {
  d = await platformDatabase();
  svc = new ActivationService(d.store);
}, 30000);
afterAll(async () => d?.db.close());

async function world() {
  const a = await account(d),
    q = subjectProvider(),
    passport = await svc.initialize(a.principal, init(), () => q.q);
  return { a, q, ref: passport.passportRef };
}
const needs = {
  requirements: [
    {
      key: "walking_minutes",
      operator: "lte",
      expected: 10,
      importance: "hard",
      unit: "min",
      label: "Walk of 10 minutes or less",
      sourceRequirement: "USER",
    },
  ],
  origin: { label: "Brooklyn, New York", lat: 40.65, lng: -73.95 },
};

it("a new account has no Passport until onboarding creates one", async () => {
  const a = await account(d);
  expect((await svc.inspect(a.principal)).passport).toBeNull();
});
it("taste returns the person's own reviewed anchors, nothing else", async () => {
  const w = await world();
  const t = (await svc.taste(w.a.principal, { passportRef: w.ref })) as any;
  expect(t.anchors).toHaveLength(5);
  expect(t.needs).toEqual({ requirements: [], origin: null });
  expect(JSON.stringify(t)).not.toContain(w.a.principal.userId);
});
it("needs persist per Passport and are private to the owner", async () => {
  const w = await world(),
    other = await world();
  await svc.needsSet(w.a.principal, { passportRef: w.ref, ...needs });
  const t = (await svc.taste(w.a.principal, { passportRef: w.ref })) as any;
  expect(t.needs.requirements[0].key).toBe("walking_minutes");
  expect(t.needs.origin.label).toBe("Brooklyn, New York");
  // Another signed-in person can neither read nor overwrite them.
  await expect(
    svc.taste(other.a.principal, { passportRef: w.ref }),
  ).rejects.toMatchObject({ code: "PASSPORT_NOT_FOUND" });
  await expect(
    svc.needsSet(other.a.principal, { passportRef: w.ref, ...needs }),
  ).rejects.toMatchObject({ code: "PASSPORT_NOT_FOUND" });
  expect(
    ((await svc.taste(other.a.principal, { passportRef: other.ref })) as any)
      .needs.requirements,
  ).toEqual([]);
});
it("rejects malformed needs", async () => {
  const w = await world();
  for (const bad of [
    { requirements: "x" },
    { requirements: [], origin: { label: "x", lat: 999, lng: 0 } },
    { requirements: [], origin: { label: "", lat: 0, lng: 0 } },
  ])
    await expect(
      svc.needsSet(w.a.principal, { passportRef: w.ref, ...bad }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
it("choose returns the explained evaluation for the person's own Passport and ceiling", async () => {
  const w = await world();
  await svc.policyPublish(w.a.principal, {
    idempotencyKey: "pub-activation-1",
    passportRef: w.ref,
    document: {
      ...DEFAULT_POLICY,
      actions: { default: "SHORTLIST", byDomain: {}, byAgent: {} },
    },
    expectedVersion: 0,
  });
  const r = (await svc.choose(
    w.a.principal,
    {
      idempotencyKey: "choose-activation-1",
      passportRef: w.ref,
      proposal: proposal(1),
      requestedAction: "PRESENT_AS_SELECTED",
    },
    () => w.q.q,
    reqId,
  )) as any;
  expect(r.evaluation.authority.ceiling).toBe("SHORTLIST");
  expect(r.evaluation.authority.escalationRequired).toBe(true);
  expect(r.evaluation.authority.outcome).toBe("ASK");
  expect(r.response.evaluationRef).toMatch(/\S/);
});
