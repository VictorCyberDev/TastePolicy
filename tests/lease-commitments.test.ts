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
import { proposal, reqId } from "./interactive-fixtures";
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
  const evaluate = (id = proposal(1), p: Principal = agent) =>
    svc.evaluate(
      p,
      { idempotencyKey: "e" + ++n, passportRef: ref, proposal: id },
      () => q.q,
      reqId,
    ) as Promise<Record<string, any>>;
  const lease = (evaluationRef: string, extra: object = {}) =>
    svc.leaseRequest(agent, {
      idempotencyKey: "l" + ++n + "-key",
      evaluationRef,
      ...extra,
    }) as Promise<Record<string, any>>;
  return { a, q, agent, ref, evaluate, lease, key };
}

import { proposal as mk } from "./interactive-fixtures";
const priced = (amount: number) =>
  mk(1, {
    key: "trip",
    domain: "destination",
    price: { amount, currency: "USD" },
  });
const check = (
  w: Awaited<ReturnType<typeof world>>,
  leaseRef: string,
  extra: object,
) =>
  svc.leaseCheckpoint(w.agent, { leaseRef, ...extra }) as Promise<
    Record<string, any>
  >;
const statusOf = (p: Principal, leaseRef: string, extra: object = {}) =>
  svc.leaseVerify(p, { leaseRef, ...extra }) as Promise<Record<string, any>>;

it("evaluation and lease carry canonical commitments; presentation fields never change them", async () => {
  const w = await world();
  const e = await w.evaluate(priced(100));
  expect(e.commitments.schemaVersion).toBe("taste-commitments-v1");
  const l = await w.lease(e.evaluationRef);
  expect(l.commitments).toEqual(e.commitments);
  const same = await statusOf(w.agent, l.leaseRef, {
    candidate: {
      imageUrl: "https://cdn.example/x.png",
      type: proposal(1).candidate.type,
      name: proposal(1).candidate.name,
      id: proposal(1).candidate.id,
      ...(proposal(1).candidate.releaseYear
        ? { releaseYear: proposal(1).candidate.releaseYear }
        : {}),
    },
    context: {
      cardLayout: "wide",
      price: { currency: "USD", amount: 100 },
      domain: "destination",
      key: "trip",
    },
  });
  expect([same.status, same.valid, same.reasons]).toEqual(["ACTIVE", true, []]);
}, 60000);
it("a changed price is CONTEXT_CHANGED; a changed candidate field is CANDIDATE_CHANGED; both suspend", async () => {
  const w = await world();
  const e = await w.evaluate(priced(100)),
    l = await w.lease(e.evaluationRef);
  const moved = await check(w, l.leaseRef, {
    context: {
      key: "trip",
      domain: "destination",
      price: { amount: 450, currency: "USD" },
    },
  });
  expect([moved.status, moved.valid, moved.reasons]).toEqual([
    "SUSPENDED",
    false,
    ["CONTEXT_CHANGED"],
  ]);
  const w2 = await world();
  const e2 = await w2.evaluate(priced(100)),
    l2 = await w2.lease(e2.evaluationRef);
  const renamed = await check(w2, l2.leaseRef, {
    candidate: {
      ...proposal(1).candidate,
      address: "another address entirely",
    },
  });
  expect([renamed.status, renamed.reasons]).toEqual([
    "SUSPENDED",
    ["CANDIDATE_CHANGED"],
  ]);
  const w3 = await world();
  const e3 = await w3.evaluate(priced(100)),
    l3 = await w3.lease(e3.evaluationRef);
  const key = await check(w3, l3.leaseRef, {
    context: {
      key: "other",
      domain: "destination",
      price: { amount: 100, currency: "USD" },
    },
    candidate: { ...proposal(1).candidate, name: "A different place" },
  });
  expect(key.reasons).toEqual(["CANDIDATE_CHANGED", "CONTEXT_CHANGED"]);
}, 90000);
it("commitments can be presented instead of the material; a malformed value is rejected, not ignored", async () => {
  const w = await world();
  const e = await w.evaluate(priced(100)),
    l = await w.lease(e.evaluationRef);
  const ok = await statusOf(w.agent, l.leaseRef, {
    candidateCommitment: l.commitments.candidate,
    contextCommitment: l.commitments.context,
  });
  expect(ok.valid).toBe(true);
  for (const bad of [
    { contextCommitment: "sha-256:short" },
    { context: { key: "bad key", domain: "destination" } },
    { candidate: { id: "x" } },
    {
      candidateCommitment: l.commitments.candidate,
      candidate: { ...proposal(1).candidate, name: "zzz" },
    },
  ])
    await expect(statusOf(w.agent, l.leaseRef, bad)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  const wrong = await statusOf(w.agent, l.leaseRef, {
    contextCommitment: "sha-256:" + "A".repeat(43),
  });
  expect(wrong.reasons).toEqual(["CONTEXT_CHANGED"]);
}, 60000);
it("what the server is never told is not detected: no presentation, no context drift", async () => {
  const w = await world();
  const e = await w.evaluate(priced(100)),
    l = await w.lease(e.evaluationRef);
  tick(30);
  const c = await check(w, l.leaseRef, {});
  expect([c.status, c.valid]).toEqual(["ACTIVE", true]);
}, 40000);
it("resume needs a fresh ALLOW for the current choice: the old evaluation cannot resume, a mismatched presentation cannot resume, the new commitments replace the old", async () => {
  const w = await world();
  const e = await w.evaluate(priced(100)),
    l = await w.lease(e.evaluationRef);
  tick(5);
  await check(w, l.leaseRef, {
    context: {
      key: "trip",
      domain: "destination",
      price: { amount: 450, currency: "USD" },
    },
  });
  tick(2);
  await expect(
    svc.leaseResume(w.agent, {
      idempotencyKey: "rs-old-key",
      leaseRef: l.leaseRef,
      evaluationRef: e.evaluationRef,
    }),
  ).rejects.toMatchObject({ code: "STATE_VERSION_CONFLICT" });
  const fresh = await w.evaluate(priced(450));
  expect(fresh.commitments.context).not.toBe(e.commitments.context);
  // saying the choice is still the OLD context cannot ride on the new evaluation
  await expect(
    svc.leaseResume(w.agent, {
      idempotencyKey: "rs-mis-key",
      leaseRef: l.leaseRef,
      evaluationRef: fresh.evaluationRef,
      contextCommitment: e.commitments.context,
    }),
  ).rejects.toMatchObject({ code: "COMMITMENT_MISMATCH" });
  const back: any = await svc.leaseResume(w.agent, {
    idempotencyKey: "rs-ok-key",
    leaseRef: l.leaseRef,
    evaluationRef: fresh.evaluationRef,
    contextCommitment: fresh.commitments.context,
  });
  expect([back.status, back.valid]).toEqual(["ACTIVE", true]);
  expect(back.commitments).toEqual(fresh.commitments);
  // and it is now bound to the new context: the old one is a mismatch again
  const again = await check(w, l.leaseRef, {
    contextCommitment: e.commitments.context,
  });
  expect(again.reasons).toEqual(["CONTEXT_CHANGED"]);
}, 90000);
