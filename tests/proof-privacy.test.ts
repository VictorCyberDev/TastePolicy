// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- assertions over loosely typed JSON responses */
import { beforeAll, afterAll, it, expect } from "vitest";
import {
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  type JWK,
} from "jose";
import {
  platformDatabase,
  account,
  init,
  subjectProvider,
} from "./platform-fixtures";
import { AttestationService } from "@/server/platform/attest-service";
import type { AttestationConfig } from "@/server/platform/attest-config";
import { present } from "@/lib/attest/sdjwt";
import { VCT } from "@/lib/attest/issue";
import {
  OPTIONAL_CLAIMS,
  REQUIRED_CLAIMS,
  applyDisclosure,
  optionalEnabled,
  parseDisclosure,
  widensDisclosure,
  DEFAULT_DISCLOSURE,
} from "@/lib/attest/disclosure";
import { proposal, reqId } from "./interactive-fixtures";
import type { Principal } from "@/lib/platform/types";

let d: Awaited<ReturnType<typeof platformDatabase>>;
let svc: AttestationService;
const now = Date.now();
const clock = () => new Date(now).toISOString();
const AUD = "https://merchant.test";
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
    epochKey: new Uint8Array(32).fill(7),
    keys: { active: kid, next: [], retired: [], revoked: [] },
    trusted: { "https://tastepolicy.test": { jwks, vct: [VCT] } },
  };
  svc = new AttestationService(d.store, clock, async () => cfg);
}, 30000);
afterAll(async () => d?.db.close());

let n = 0;
async function world() {
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
  const lease = async () => {
    const e: any = await svc.evaluate(
      agent,
      { idempotencyKey: "e" + ++n, passportRef: ref, proposal: proposal(1) },
      () => q.q,
      reqId,
    );
    return (await svc.leaseRequest(agent, {
      idempotencyKey: "l" + ++n + "-key",
      evaluationRef: e.evaluationRef,
    })) as Record<string, any>;
  };
  const attest = (leaseRef: string, extra: object = {}) =>
    svc.attestationIssue(agent, {
      leaseRef,
      audience: AUD,
      ...extra,
    }) as Promise<Record<string, any>>;
  const set = (mode: string, claims: object = {}, p: Principal = a.principal) =>
    svc.proofPrivacySet(p, { passportRef: ref, mode, claims }) as Promise<any>;
  return { a, agent, ref, lease, attest, set, q };
}
const REQUIRED = [...REQUIRED_CLAIMS].sort();

it("the default proof is the smallest verifiable one: only required claims are disclosable", async () => {
  const w = await world(),
    l = await w.lease(),
    at = await w.attest(l.leaseRef);
  expect(at.disclosable.sort()).toEqual(REQUIRED);
  const view: any = await svc.proofPrivacyGet(w.a.principal, {
    passportRef: w.ref,
  });
  expect(view).toMatchObject({
    mode: "MINIMAL",
    claims: {
      candidate_name: false,
      candidate_id: false,
      context_key: false,
      agent_id: false,
      policy: false,
    },
  });
  expect(view.required.sort()).toEqual(REQUIRED);
  // and it is still a real proof: the verifier checks it against its own choice
  const pres = await present(at.attestation, [
    "decision",
    "candidate_commitment",
    "context_commitment",
  ]);
  const v: any = await svc.attestationVerify({
    presentation: pres,
    audience: AUD,
    dryRun: true,
    expect: { candidateCommitment: l.commitments.candidate },
  });
  expect(v.valid).toBe(true);
  expect(JSON.stringify(v)).not.toMatch(/candidate_name|agent_id|context_key/);
}, 60000);
it("each human-readable claim can be turned on alone; the others stay out", async () => {
  const w = await world();
  for (const claim of OPTIONAL_CLAIMS) {
    await w.set("MINIMAL", { [claim]: true });
    const l = await w.lease();
    const at = await w.attest(l.leaseRef);
    expect(at.disclosable.sort(), claim).toEqual([...REQUIRED, claim].sort());
    await svc.leaseRelease(w.agent, { leaseRef: l.leaseRef });
  }
}, 120000);
it("STANDARD includes every optional claim unless one is switched off", async () => {
  const w = await world();
  await w.set("STANDARD");
  let l = await w.lease(),
    at = await w.attest(l.leaseRef);
  expect(at.disclosable.sort()).toEqual(
    [...REQUIRED, ...OPTIONAL_CLAIMS].sort(),
  );
  await svc.leaseRelease(w.agent, { leaseRef: l.leaseRef });
  await w.set("STANDARD", { agent_id: false, candidate_name: false });
  l = await w.lease();
  at = await w.attest(l.leaseRef);
  expect(at.disclosable).not.toContain("agent_id");
  expect(at.disclosable).not.toContain("candidate_name");
  expect(at.disclosable).toContain("candidate_id");
}, 120000);
it("required claims cannot be removed, renamed or smuggled in; malformed settings are refused", async () => {
  const w = await world();
  for (const bad of [
    { mode: "MINIMAL", claims: { decision: false } },
    { mode: "MINIMAL", claims: { candidate_commitment: false } },
    { mode: "MINIMAL", claims: { permitted_actions: false } },
    { mode: "MINIMAL", claims: { context_commitment: false } },
    { mode: "MINIMAL", claims: { lease_ref: true } },
    { mode: "MINIMAL", claims: { candidate_name: "yes" } },
    { mode: "NONE", claims: {} },
    { mode: "MINIMAL", claims: [] },
    { mode: "MINIMAL", claims: {}, extra: 1 },
  ])
    await expect(
      svc.proofPrivacySet(w.a.principal, { passportRef: w.ref, ...bad }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  // nothing was stored by the refused calls
  expect(
    ((await svc.proofPrivacyGet(w.a.principal, { passportRef: w.ref })) as any)
      .mode,
  ).toBe("MINIMAL");
  // even under the widest setting the required set is untouched
  await w.set("STANDARD");
  const l = await w.lease();
  expect((await w.attest(l.leaseRef)).disclosable).toEqual(
    expect.arrayContaining(REQUIRED),
  );
}, 60000);
it("a handoff keeps its binding to the receiving agent even under MINIMAL", async () => {
  const w = await world(),
    l = await w.lease();
  const { publicKey } = await generateKeyPair("ES256", { extractable: true });
  const pub: JWK = await exportJWK(publicKey);
  const at = await w.attest(l.leaseRef, {
    holderKey: pub,
    delegateAgentId: "Agent-B",
  });
  expect(at.disclosable.sort()).toEqual(
    [...REQUIRED, "delegate_agent_id"].sort(),
  );
}, 60000);
it("the setting applies to proofs issued afterwards; an earlier proof is not rewritten", async () => {
  const w = await world(),
    l = await w.lease();
  const before = await w.attest(l.leaseRef);
  await w.set("STANDARD");
  const after = await w.attest(l.leaseRef);
  expect(before.disclosable.sort()).toEqual(REQUIRED);
  expect(after.disclosable.length).toBe(
    REQUIRED.length + OPTIONAL_CLAIMS.length,
  );
}, 60000);
it("only the owner's signed-in session can read or change it; an agent or another account cannot", async () => {
  const w = await world(),
    other = await world();
  await expect(
    svc.proofPrivacySet(w.agent, {
      passportRef: w.ref,
      mode: "STANDARD",
      claims: {},
    }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  await expect(
    svc.proofPrivacyGet(w.agent, { passportRef: w.ref }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  await expect(
    svc.proofPrivacySet(other.a.principal, {
      passportRef: w.ref,
      mode: "STANDARD",
      claims: {},
    }),
  ).rejects.toMatchObject({ code: "PASSPORT_NOT_FOUND" });
  expect(
    ((await svc.proofPrivacyGet(w.a.principal, { passportRef: w.ref })) as any)
      .mode,
  ).toBe("MINIMAL");
}, 60000);
it("letting proofs say more needs a recent sign-in; saying less never does", async () => {
  const w = await world();
  const stale: Principal = {
    ...w.a.principal,
    authenticatedAt: "2020-01-01T00:00:00.000Z",
  };
  await expect(w.set("STANDARD", {}, stale)).rejects.toMatchObject({
    code: "RECENT_AUTH_REQUIRED",
  });
  await expect(
    w.set("MINIMAL", { candidate_name: true }, stale),
  ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
  await w.set("STANDARD");
  const narrowed = await w.set("MINIMAL", {}, stale);
  expect(narrowed.mode).toBe("MINIMAL");
}, 60000);
it("pure rules: default, parsing, widening and filtering", () => {
  expect(optionalEnabled(DEFAULT_DISCLOSURE)).toEqual([]);
  expect(parseDisclosure(undefined)).toBeNull();
  expect(parseDisclosure({ mode: "MINIMAL" })).toEqual({
    mode: "MINIMAL",
    claims: {},
  });
  expect(
    widensDisclosure(DEFAULT_DISCLOSURE, { mode: "MINIMAL", claims: {} }),
  ).toBe(false);
  expect(
    widensDisclosure(DEFAULT_DISCLOSURE, {
      mode: "MINIMAL",
      claims: { agent_id: true },
    }),
  ).toBe(true);
  expect(
    widensDisclosure(
      { mode: "STANDARD", claims: {} },
      { mode: "STANDARD", claims: { agent_id: false } },
    ),
  ).toBe(false);
  const claims = { decision: "ALLOW", candidate_name: "x", agent_id: "a" };
  expect(applyDisclosure(claims, DEFAULT_DISCLOSURE)).toEqual({
    decision: "ALLOW",
  });
  expect(
    applyDisclosure(claims, { mode: "MINIMAL", claims: { agent_id: true } }),
  ).toEqual({ decision: "ALLOW", agent_id: "a" });
});
