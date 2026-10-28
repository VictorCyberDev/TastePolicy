// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- assertions over loosely typed JSON responses */
import { beforeAll, afterAll, it, expect } from "vitest";
import { calculateJwkThumbprint, exportJWK, generateKeyPair } from "jose";
import {
  platformDatabase,
  account,
  init,
  subjectProvider,
  future,
} from "./platform-fixtures";
import { AttestationService } from "@/server/platform/attest-service";
import type { AttestationConfig } from "@/server/platform/attest-config";
import { VCT } from "@/lib/attest/issue";
import { proposal, reqId, commitOf } from "./interactive-fixtures";

let d: Awaited<ReturnType<typeof platformDatabase>>;
let svc: AttestationService;
let now = Date.now();
const clock = () => new Date(now).toISOString();
beforeAll(async () => {
  d = await platformDatabase();
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const pub = await exportJWK(publicKey),
    kid = await calculateJwkThumbprint(pub);
  const jwks = { keys: [{ ...pub, kid, alg: "ES256", use: "sig" }] };
  const cfg: AttestationConfig = {
    issuer: "https://tastepolicy.test",
    signer: { key: privateKey, alg: "ES256", kid },
    jwks,
    epochKey: new Uint8Array(32).fill(3),
    keys: { active: kid, next: [], retired: [], revoked: [] },
    trusted: { "https://tastepolicy.test": { jwks, vct: [VCT] } },
  };
  svc = new AttestationService(d.store, clock, async () => cfg);
}, 30000);
afterAll(async () => d?.db.close());

const priced = (amount: number) =>
  proposal(1, {
    key: "trip",
    domain: "destination",
    price: { amount, currency: "USD" },
  });
it("one timeline shows the whole story in order, in plain words, with no identifiers that work as credentials", async () => {
  now = Date.now();
  const a = await account(d),
    q = subjectProvider(),
    passport: any = await svc.initialize(a.principal, init(), () => q.q);
  const ref = passport.passportRef as string;
  const key: any = await svc.issueKey(a.principal, {
    idempotencyKey: "tk1",
    displayLabel: "SYNTHETIC TEST DATA agent",
    scopes: ["PASSPORT_READ", "TASTE_EVALUATE", "RECEIPT_READ"],
    expiresAt: future(),
  });
  const agent = await svc.credentialPrincipal(key.secret);
  const evalAt = (amount: number) =>
    svc.evaluate(
      agent,
      {
        idempotencyKey: "te" + Math.random().toString(36).slice(2) + "-key",
        passportRef: ref,
        proposal: priced(amount),
      },
      () => q.q,
      reqId,
    ) as Promise<any>;
  await svc.policyPublish(a.principal, {
    idempotencyKey: "tp-1-key-aa",
    passportRef: ref,
    expectedVersion: 0,
    note: "first rules",
    document: {
      schemaVersion: "taste-policy-v1",
      freshness: {},
      autonomy: { default: "AUTONOMOUS", byDomain: {}, byAgent: {} },
    },
  });
  now += 1000;
  const e1 = await evalAt(100);
  const lease: any = await svc.leaseRequest(agent, {
    idempotencyKey: "tl-1-key-aa",
    evaluationRef: e1.evaluationRef,
  });
  now += 1000;
  const proof: any = await svc.attestationIssue(agent, {
    leaseRef: lease.leaseRef,
    audience: "https://receiver.test",
    delegateAgentId: undefined,
  });
  expect(proof.attestation).toContain("~");
  now += 1000;
  await svc.leaseCheckpoint(agent, {
    leaseRef: lease.leaseRef,
    candidateCommitment: commitOf(lease).candidateCommitment,
    context: priced(450).context,
  });
  now += 1000;
  const e2 = await evalAt(450);
  await svc.leaseResume(agent, {
    idempotencyKey: "tr-1-key-aa",
    leaseRef: lease.leaseRef,
    evaluationRef: e2.evaluationRef,
    candidateCommitment: commitOf(lease).candidateCommitment,
    context: priced(450).context,
  });
  now += 1000;
  await svc.leaseRevoke(a.principal, { leaseRef: lease.leaseRef });
  const t: any = await svc.authorityTimeline(a.principal, { passportRef: ref });
  expect(t.schemaVersion).toBe("taste-authority-timeline-v1");
  // newest first
  const times = t.events.map((e: any) => e.at);
  expect([...times].sort().reverse()).toEqual(times);
  const kinds = t.events.map((e: any) => e.kind);
  // oldest to newest
  const story = [...kinds].reverse();
  const order = [
    "PASSPORT_CREATED",
    "POLICY_PUBLISHED",
    "EVALUATED",
    "LEASE_ISSUED",
    "PROOF_ISSUED",
    "PAUSED",
    "PROOFS_INVALIDATED",
    "EVALUATED",
    "RESUMED",
    "LEASE_ENDED",
  ];
  let at = -1;
  for (const k of order) {
    const next = story.indexOf(k, at + 1);
    expect(next, k).toBeGreaterThan(at);
    at = next;
  }
  expect(kinds).toContain("AGENT_KEY_CREATED");
  const paused = t.events.find((e: any) => e.kind === "PAUSED");
  expect(paused.detail).toMatch(/the situation changed/);
  expect(paused.technical.reasons).toEqual(["CONTEXT_CHANGED"]);
  const invalidated = t.events.find(
    (e: any) => e.kind === "PROOFS_INVALIDATED",
  );
  expect(invalidated.technical).toMatchObject({ count: 1, epoch: 1 });
  expect(invalidated.detail).toMatch(/do not come back/);
  expect(t.events.find((e: any) => e.kind === "RESUMED").technical.epoch).toBe(
    2,
  );
  // privacy: nothing that works as a credential, no state hash, no account id
  const json = JSON.stringify(t);
  expect(json).not.toMatch(/tp_[a-f0-9]{20}|tl_[a-f0-9]{20}|tp_live_|sha-256:/);
  expect(json).not.toContain(a.principal.userId);
  expect(json).not.toMatch(/stateHash/);
  expect(json).not.toContain(key.secret);
  // another account cannot read it; a credential is not a session
  const other = await account(d);
  await expect(
    svc.authorityTimeline(other.principal, { passportRef: ref }),
  ).rejects.toMatchObject({ code: "PASSPORT_NOT_FOUND" });
  await expect(
    svc.authorityTimeline(agent, { passportRef: ref }),
  ).rejects.toBeTruthy();
  await expect(
    svc.authorityTimeline(a.principal, { passportRef: ref, limit: 0 }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const small: any = await svc.authorityTimeline(a.principal, {
    passportRef: ref,
    limit: 3,
  });
  expect([small.events.length, small.truncated]).toEqual([3, true]);
}, 90000);
