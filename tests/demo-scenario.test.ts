// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- narrative assertions over loosely typed JSON */
import { beforeAll, afterAll, it, expect } from "vitest";
import { calculateJwkThumbprint, exportJWK, generateKeyPair } from "jose";
import {
  platformDatabase,
  account,
  init,
  subjectProvider,
} from "./platform-fixtures";
import { AttestationService } from "@/server/platform/attest-service";
import {
  attestationConfig,
  type AttestationConfig,
} from "@/server/platform/attest-config";
import { present, type Signer } from "@/lib/attest/sdjwt";
import { VCT } from "@/lib/attest/issue";
import { verifyPresentation } from "@/lib/attest/verify";
import { DEFAULT_POLICY } from "@/lib/policy/types";
import { proposal, reqId } from "./interactive-fixtures";
void attestationConfig;

// The whole story in one place: a person sets rules, an agent asks, the person
// answers, the agent gets a lease, proves it to a merchant, hands it to a second
// agent, and the person ends it. Every step is real service code on real SQL.
let d: Awaited<ReturnType<typeof platformDatabase>>;
let cfg: AttestationConfig, svc: AttestationService;
beforeAll(async () => {
  d = await platformDatabase();
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const pub = await exportJWK(publicKey),
    kid = await calculateJwkThumbprint(pub);
  const jwks = { keys: [{ ...pub, kid, alg: "ES256", use: "sig" }] };
  cfg = {
    issuer: "https://tastepolicy.test",
    signer: { key: privateKey, alg: "ES256", kid },
    jwks,
    epochKey: new Uint8Array(32).fill(7),
    trusted: { "https://tastepolicy.test": { jwks, vct: [VCT] } },
  };
  svc = new AttestationService(d.store, undefined, async () => cfg);
}, 30000);
afterAll(async () => d?.db.close());

it("rules → ask → approval → lease → proof → handoff → verification → revocation", async () => {
  const person = await account(d),
    q = subjectProvider();
  const passport = await svc.initialize(person.principal, init(), () => q.q);
  const ref = passport.passportRef;
  const key = await svc.issueKey(person.principal, {
    idempotencyKey: "demo-key-01",
    displayLabel: "SYNTHETIC TEST DATA",
    scopes: ["PASSPORT_READ", "TASTE_EVALUATE", "RECEIPT_READ"],
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  const agent = await svc.credentialPrincipal(key.secret!);
  const evaluate = (id: string) =>
    svc.evaluate(
      agent,
      { idempotencyKey: id, passportRef: ref, proposal: proposal(1) },
      () => q.q,
      reqId,
    ) as Promise<Record<string, any>>;

  // 1. With no rules a match is simply allowed.
  expect((await evaluate("demo-e1-key")).decision).toBe("ALLOW");
  // 2. The person says: ask me first. The same match now needs an answer.
  await svc.policyPublish(person.principal, {
    idempotencyKey: "demo-pol-01",
    passportRef: ref,
    document: {
      ...DEFAULT_POLICY,
      autonomy: { default: "OBSERVE", byDomain: {}, byAgent: {} },
    },
    expectedVersion: 0,
  });
  const asked = await evaluate("demo-e2-key");
  expect([asked.decision, asked.decisionBasis]).toEqual([
    "ASK",
    "AUTONOMY_CEILING",
  ]);
  // 3. The agent asks for a lease; it waits. No proof can exist yet.
  const lease: any = await svc.leaseRequest(agent, {
    idempotencyKey: "demo-lease-01",
    evaluationRef: asked.evaluationRef,
  });
  expect([lease.status, lease.valid, lease.permitted]).toEqual([
    "ASK_PENDING",
    false,
    [],
  ]);
  await expect(
    svc.attestationIssue(agent, {
      leaseRef: lease.leaseRef,
      audience: "https://merchant.test",
    }),
  ).rejects.toMatchObject({ code: "LEASE_STATE_CONFLICT" });
  // 4. The person answers yes, for ten minutes.
  const pending: any = await svc.leaseList(person.principal, {
    passportRef: ref,
  });
  expect(pending.pending.map((l: any) => l.leaseRef)).toEqual([lease.leaseRef]);
  const approved: any = await svc.leaseApprove(person.principal, {
    idempotencyKey: "demo-appr-01",
    leaseRef: lease.leaseRef,
    ttlSeconds: 600,
    confirm: true,
  });
  expect([approved.status, approved.valid]).toEqual(["ACTIVE", true]);
  // 5. The agent proves it to a merchant, revealing only the decision and the choice.
  const proof: any = await svc.attestationIssue(agent, {
    leaseRef: lease.leaseRef,
    audience: "https://merchant.test",
  });
  const shown = await present(proof.attestation, ["decision", "candidate_id"]);
  const merchant = await svc.attestationVerify({
    presentation: shown,
    audience: "https://merchant.test",
    dryRun: true,
  });
  expect(merchant.valid).toBe(true);
  expect(Object.keys(merchant.claims!)).not.toEqual(
    expect.arrayContaining(["agent_id", "candidate_name", "context_key"]),
  );
  expect(JSON.stringify(merchant)).not.toMatch(
    /tl_[a-f0-9]{48}|tps_|tp_[a-f0-9]{48}/,
  );
  // 6. The agent hands a key-bound proof to a second agent, who proves it itself.
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const jwk = await exportJWK(publicKey);
  const second: Signer = {
    key: privateKey,
    alg: "ES256",
    kid: await calculateJwkThumbprint(jwk),
  };
  const handed: any = await svc.attestationIssue(agent, {
    leaseRef: lease.leaseRef,
    audience: "https://publisher.test",
    holderKey: jwk,
    delegateAgentId: "Agent-B",
  });
  const byB = await present(
    handed.attestation,
    ["decision", "delegate_agent_id"],
    {
      signer: second,
      nonce: "publisher-challenge",
      aud: "https://publisher.test",
      iat: Math.floor(Date.now() / 1000),
    },
  );
  const publisher = await svc.attestationVerify({
    presentation: byB,
    audience: "https://publisher.test",
    nonce: "publisher-challenge",
    dryRun: true,
  });
  expect(publisher).toMatchObject({ valid: true });
  expect(publisher.claims).toMatchObject({
    delegate_agent_id: "Agent-B",
    authority: "CULTURAL_ONLY",
  });
  // 7. The person changes their mind: everything stops, at once, for everyone.
  await svc.leaseRevoke(person.principal, { passportRef: ref });
  expect(
    ((await svc.leaseVerify(agent, { leaseRef: lease.leaseRef })) as any).valid,
  ).toBe(false);
  for (const [p, aud, extra] of [
    [shown, "https://merchant.test", {}],
    [byB, "https://publisher.test", { nonce: "publisher-challenge" }],
  ] as const)
    expect(
      await svc.attestationVerify({
        presentation: p,
        audience: aud,
        dryRun: true,
        ...extra,
      }),
    ).toMatchObject({ valid: false, reasons: ["STATUS_INVALID"] });
  // 8. The timeline tells the story to the person.
  const after: any = await svc.leaseList(person.principal, {
    passportRef: ref,
  });
  expect(after.timeline.map((t: any) => t.kind).reverse()).toEqual([
    "ISSUED",
    "APPROVED",
    "REVOKED",
  ]);
  expect(after.attestations).toHaveLength(2);
  // 9. A verifier that never talked to TastePolicy agrees, using only configuration.
  const status = (await svc.statusListToken(1))!;
  const independent = await verifyPresentation(shown, {
    audience: "https://merchant.test",
    trustedIssuers: cfg.trusted,
    fetchStatus: async () => status,
  });
  expect(independent).toMatchObject({
    valid: false,
    reasons: ["STATUS_INVALID"],
  });
}, 60000);
