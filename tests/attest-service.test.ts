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
import { present, type Signer } from "@/lib/attest/sdjwt";
import { VCT } from "@/lib/attest/issue";
import { DEFAULT_POLICY, type PolicyDocument } from "@/lib/policy/types";
import { decodeList, getStatus } from "@/lib/attest/status-list";
import { proposal, reqId } from "./interactive-fixtures";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { handleMcp } from "@/server/platform/mcp";
import { compactVerify, importJWK } from "jose";

let d: Awaited<ReturnType<typeof platformDatabase>>;
let svc: AttestationService, cfgA: AttestationConfig;
let now = Date.now();
const clock = () => new Date(now).toISOString();
const AUD = "https://merchant.test";
async function makeConfig(
  issuer: string,
): Promise<{ cfg: AttestationConfig; pub: JWK; privJwk: JWK }> {
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const pub = await exportJWK(publicKey),
    kid = await calculateJwkThumbprint(pub);
  const privJwk = await exportJWK(privateKey);
  const jwks = { keys: [{ ...pub, kid, alg: "ES256", use: "sig" }] };
  return {
    cfg: {
      issuer,
      signer: { key: privateKey, alg: "ES256", kid },
      jwks,
      trusted: { [issuer]: { jwks, vct: [VCT] } },
    },
    pub: jwks.keys[0],
    privJwk,
  };
}
beforeAll(async () => {
  d = await platformDatabase();
  cfgA = (await makeConfig("https://tastepolicy.test")).cfg;
  svc = new AttestationService(d.store, clock, async () => cfgA);
}, 30000);
afterAll(async () => d?.db.close());

const observe: PolicyDocument = {
  ...DEFAULT_POLICY,
  autonomy: { default: "OBSERVE", byDomain: {}, byAgent: {} },
};
let n = 0;
async function world() {
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
  const evaluate = () =>
    svc.evaluate(
      agent,
      { idempotencyKey: "e" + ++n, passportRef: ref, proposal: proposal(1) },
      () => q.q,
      reqId,
    ) as Promise<Record<string, any>>;
  const lease = async () =>
    (await svc.leaseRequest(agent, {
      idempotencyKey: "l" + ++n + "-key",
      evaluationRef: (await evaluate()).evaluationRef,
    })) as Record<string, any>;
  const attest = (leaseRef: string, extra: object = {}) =>
    svc.attestationIssue(agent, {
      leaseRef,
      audience: AUD,
      ...extra,
    }) as Promise<Record<string, any>>;
  const verify = (presentation: string, extra: object = {}) =>
    svc.attestationVerify({ presentation, audience: AUD, ...extra }) as Promise<
      Record<string, any>
    >;
  return { a, agent, ref, lease, attest, verify, evaluate, q };
}

it("issues a proof for an ACTIVE lease and the hosted verifier checks signature, audience, status and replay", async () => {
  const w = await world(),
    l = await w.lease(),
    at = await w.attest(l.leaseRef);
  expect(at.disclosable.sort()).toEqual([
    "agent_id",
    "candidate_id",
    "candidate_name",
    "context_key",
    "decision",
    "lease_ref",
    "permitted",
    "policy",
    "subject_ref",
  ]);
  const full = await w.verify(at.attestation, { dryRun: true });
  expect(full).toMatchObject({ valid: true, status: "VALID", dryRun: true });
  expect(full.claims).toMatchObject({
    decision: "ALLOW",
    candidate_id: l.candidateId,
    authority: "CULTURAL_ONLY",
  });
  const minimal = await present(at.attestation, ["decision", "candidate_id"]);
  const r = await w.verify(minimal);
  expect(r.valid).toBe(true);
  expect(JSON.stringify(r)).not.toMatch(
    /subject_ref|agent_id|lease_ref|context_key|candidate_name/,
  );
  expect(await w.verify(minimal)).toMatchObject({
    valid: false,
    reasons: ["REPLAY"],
  });
  expect(await w.verify(at.attestation, { dryRun: true })).toMatchObject({
    valid: true,
  }); // dry runs never consume
  expect(
    await svc.attestationVerify({
      presentation: at.attestation,
      audience: "https://other.test",
    }),
  ).toMatchObject({ valid: false, reasons: ["AUDIENCE_MISMATCH"] });
  expect(Date.parse(at.expiresAt) - now).toBeLessThanOrEqual(900_000);
}, 40000);
it("status follows the lease at once: owner revoke, policy change, grant revoke and Passport deletion", async () => {
  const w = await world();
  const l1 = await w.lease(),
    a1 = await w.attest(l1.leaseRef);
  expect((await w.verify(a1.attestation, { dryRun: true })).status).toBe(
    "VALID",
  );
  await svc.leaseRevoke(w.a.principal, { leaseRef: l1.leaseRef });
  expect(await w.verify(a1.attestation, { dryRun: true })).toMatchObject({
    valid: false,
    reasons: ["STATUS_INVALID"],
  });

  const l2 = await w.lease(),
    a2 = await w.attest(l2.leaseRef);
  // no verify call happens between the change and the check: propagation is eager
  await svc.policyPublish(w.a.principal, {
    idempotencyKey: "pp-key-0001",
    passportRef: w.ref,
    document: observe,
    expectedVersion: 0,
  });
  expect(await w.verify(a2.attestation, { dryRun: true })).toMatchObject({
    valid: false,
    reasons: ["STATUS_SUSPENDED"],
  });

  const w2 = await world(),
    other = await account(d);
  const grant = await svc.grant(w2.a.principal, {
    idempotencyKey: "gr-key-0002",
    passportRef: w2.ref,
    granteeUserId: other.principal.userId,
    scopes: ["EVALUATE_TASTE_ACTION", "READ_RECEIPT"],
    purpose: "Test",
    expiresAt: new Date(now + 86400000).toISOString(),
  });
  const gk = await svc.issueKey(other.principal, {
    idempotencyKey: "gk" + ++n,
    displayLabel: "SYNTHETIC TEST DATA",
    scopes: ["TASTE_EVALUATE", "RECEIPT_READ"],
    expiresAt: new Date(now + 5 * 86400000).toISOString(),
  });
  const delegate = await svc.credentialPrincipal(gk.secret!);
  const ev = (await svc.evaluate(
    delegate,
    {
      idempotencyKey: "ge" + ++n,
      passportRef: w2.ref,
      grantId: grant.grantId,
      proposal: proposal(1),
    },
    () => w2.q.q,
    reqId,
  )) as Record<string, any>;
  const dl = (await svc.leaseRequest(delegate, {
    idempotencyKey: "gl" + ++n + "-key",
    evaluationRef: ev.evaluationRef,
  })) as Record<string, any>;
  const da = (await svc.attestationIssue(delegate, {
    leaseRef: dl.leaseRef,
    audience: AUD,
  })) as Record<string, any>;
  expect((await w.verify(da.attestation, { dryRun: true })).valid).toBe(true);
  await svc.revokeGrant(w2.a.principal, {
    idempotencyKey: "rg-key-0002",
    grantId: grant.grantId,
  });
  expect(await w.verify(da.attestation, { dryRun: true })).toMatchObject({
    valid: false,
    reasons: ["STATUS_SUSPENDED"],
  });

  const w3 = await world(),
    l3 = await w3.lease(),
    a3 = await w3.attest(l3.leaseRef);
  await svc.delete(
    w3.a.principal,
    {
      idempotencyKey: "dl-key-0003",
      passportRef: w3.ref,
      confirmation: "DELETE PASSPORT",
    },
    false,
  );
  expect(await w.verify(a3.attestation, { dryRun: true })).toMatchObject({
    valid: false,
    reasons: ["STATUS_INVALID"],
  });
}, 60000);
it("only an ACTIVE lease of the calling actor can be attested; inputs are validated", async () => {
  const w = await world(),
    l = await w.lease(),
    other = await world();
  await expect(other.attest(l.leaseRef)).rejects.toMatchObject({
    code: "LEASE_NOT_FOUND",
  });
  await expect(
    w.attest(l.leaseRef, { audience: "http://insecure.test" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    w.attest(l.leaseRef, { audience: "https://a.test/path" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    w.attest(l.leaseRef, {
      holderKey: { kty: "EC", crv: "P-256", x: "x", y: "y", d: "secret" },
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    w.attest(l.leaseRef, { delegateAgentId: "Agent-B" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" }); // needs a holder key
  await svc.policyPublish(w.a.principal, {
    idempotencyKey: "pq-key-0001",
    passportRef: w.ref,
    document: observe,
    expectedVersion: 0,
  });
  await expect(w.attest(l.leaseRef)).rejects.toMatchObject({
    code: "LEASE_STATE_CONFLICT",
  }); // suspended
  const ask = await w.lease().catch((e) => e);
  expect(ask).toBeDefined();
}, 40000);
it("handoff: a key-bound proof names the receiving agent and the delegator, needs the receiver's key and nonce, and dies with the lease", async () => {
  const w = await world(),
    l = await w.lease();
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const pub = await exportJWK(publicKey),
    kid = await calculateJwkThumbprint(pub);
  const receiver: Signer = { key: privateKey, alg: "ES256", kid };
  const at = await w.attest(l.leaseRef, {
    holderKey: pub,
    delegateAgentId: "Agent-B",
  });
  expect(at.holderBound).toBe(true);
  const ts = Math.floor(now / 1000);
  const pres = await present(
    at.attestation,
    ["decision", "agent_id", "act", "candidate_id"],
    { signer: receiver, nonce: "challenge-1", aud: AUD, iat: ts },
  );
  const ok = await w.verify(pres, { nonce: "challenge-1", dryRun: true });
  expect(ok.valid).toBe(true);
  expect(ok.claims).toMatchObject({
    agent_id: "Agent-B",
    act: { agent_id: l.agentId },
    decision: "ALLOW",
  });
  expect(
    await w.verify(await present(at.attestation, ["decision"]), {
      nonce: "challenge-1",
      dryRun: true,
    }),
  ).toMatchObject({ reasons: ["KB_REQUIRED"] });
  expect(await w.verify(pres, { nonce: "other", dryRun: true })).toMatchObject({
    reasons: ["KB_NONCE_MISMATCH"],
  });
  expect(await w.verify(pres, { dryRun: true })).toMatchObject({
    valid: false,
  });
  // a different holder key cannot present it
  const thief = await generateKeyPair("ES256", { extractable: true });
  const forged = await present(at.attestation, ["decision"], {
    signer: { key: thief.privateKey, alg: "ES256", kid: "x" },
    nonce: "challenge-1",
    aud: AUD,
    iat: ts,
  });
  expect(
    await w.verify(forged, { nonce: "challenge-1", dryRun: true }),
  ).toMatchObject({ reasons: ["KB_INVALID"] });
  await svc.leaseRevoke(w.a.principal, { leaseRef: l.leaseRef });
  expect(
    await w.verify(pres, { nonce: "challenge-1", dryRun: true }),
  ).toMatchObject({ valid: false, reasons: ["STATUS_INVALID"] });
}, 40000);
it("status list: served signed, matches the database, random never-reused indices", async () => {
  const w = await world(),
    l = await w.lease(),
    at = await w.attest(l.leaseRef);
  const token = (await svc.statusListToken(1))!;
  const { payload } = await compactVerify(
    token,
    await importJWK(cfgA.jwks.keys[0], "ES256"),
  );
  const body = JSON.parse(new TextDecoder().decode(payload));
  expect(body).toMatchObject({
    iss: cfgA.issuer,
    sub: "https://tastepolicy.test/api/attest/status/1",
    ttl: 60,
    status_list: { bits: 2 },
  });
  const list = decodeList(body.status_list.lst);
  expect(list.length).toBe(32768);
  const idx = Number(
    JSON.parse(
      Buffer.from(
        at.attestation.split("~")[0].split(".")[1],
        "base64url",
      ).toString(),
    ).status.status_list.idx,
  );
  expect(getStatus(list, idx, 2)).toBe(0);
  expect(await svc.statusListToken(99)).toBeNull();
  const used = await d.db.query(
    "SELECT count(*)::int AS n, count(DISTINCT idx)::int AS d FROM tastepolicy.attestation_status_used",
  );
  expect((used.rows[0] as any).n).toBe((used.rows[0] as any).d);
  // used indices are never freed, even after the lease is gone
  const before = (used.rows[0] as any).n;
  await svc.delete(
    w.a.principal,
    {
      idempotencyKey: "dl-key-0004",
      passportRef: w.ref,
      confirmation: "DELETE PASSPORT",
    },
    false,
  );
  const after = await d.db.query(
    "SELECT count(*)::int AS n FROM tastepolicy.attestation_status_used",
  );
  expect((after.rows[0] as any).n).toBe(before);
  await expect(
    d.db.query("SELECT tastepolicy.set_status(1, 999999999, 1)"),
  ).rejects.toThrow(/out of range/);
  await expect(
    d.db.query("SELECT tastepolicy.set_status(1, 0, 3)"),
  ).rejects.toThrow(/out of range/);
}, 40000);
it("a second issuer verifies only when explicitly trusted, using its own keys and list", async () => {
  const b = await makeConfig("https://issuer-two.test");
  const svcB = new AttestationService(d.store, clock, async () => b.cfg);
  const w = await world(),
    l = await w.lease();
  const atB = (await svcB.attestationIssue(w.agent, {
    leaseRef: l.leaseRef,
    audience: AUD,
  })) as Record<string, any>;
  expect((await w.verify(atB.attestation, { dryRun: true })).reasons).toEqual([
    "ISSUER_UNTRUSTED",
  ]);
  const trusting: AttestationConfig = {
    ...cfgA,
    trusted: {
      ...cfgA.trusted,
      [b.cfg.issuer]: { jwks: b.cfg.jwks, vct: [VCT] },
    },
  };
  const svcA2 = new AttestationService(
    d.store,
    clock,
    async () => trusting,
    async (uri) => {
      expect(uri.startsWith("https://issuer-two.test/api/attest/status/")).toBe(
        true,
      );
      return (await svcB.statusListToken(Number(uri.split("/").pop())))!;
    },
  );
  expect(
    await svcA2.attestationVerify({
      presentation: atB.attestation,
      audience: AUD,
      dryRun: true,
    }),
  ).toMatchObject({ valid: true, issuer: "https://issuer-two.test" });
}, 40000);
it("without configuration the issuer is NOT_CONFIGURED; there is no fallback key", async () => {
  const off = new AttestationService(d.store, clock, async () => null);
  const w = await world(),
    l = await w.lease();
  await expect(
    off.attestationIssue(w.agent, { leaseRef: l.leaseRef, audience: AUD }),
  ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  await expect(
    off.attestationVerify({ presentation: "a~", audience: AUD }),
  ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  await expect(off.statusListToken(1)).rejects.toMatchObject({
    code: "NOT_CONFIGURED",
  });
});
it("MCP exposes the issuer tool and issues from environment-configured keys", async () => {
  const { privJwk, pub } = await makeConfig("https://tastepolicy.test");
  void pub;
  process.env.TASTEPOLICY_PUBLIC_ORIGIN = "https://tastepolicy.test";
  process.env.TASTEPOLICY_ATTESTATION_KEY = JSON.stringify(privJwk);
  try {
    const w = await world(),
      l = await w.lease();
    const key = await svc.issueKey(w.a.principal, {
      idempotencyKey: "mk" + ++n,
      displayLabel: "SYNTHETIC TEST DATA",
      scopes: ["TASTE_EVALUATE"],
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const deps = { store: d.store, factory: () => w.q.q };
    const client = new Client(
      { name: "t", version: "1" },
      { versionNegotiation: { mode: "auto" } },
    );
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL("https://tastepolicy.test/api/mcp"),
        {
          fetch: ((i: string | URL | Request, o?: RequestInit) =>
            handleMcp(new Request(i as URL, o), deps)) as typeof fetch,
          requestInit: { headers: { Authorization: `Bearer ${key.secret}` } },
        },
      ),
    );
    const out = (
      await client.callTool({
        name: "tastepolicy_issue_attestation",
        arguments: { leaseRef: l.leaseRef, audience: AUD },
      })
    ).structuredContent as Record<string, any>;
    expect(out.attestation).toContain("~");
    const { attestationConfig } =
      await import("@/server/platform/attest-config");
    const c = await attestationConfig();
    expect(c?.issuer).toBe("https://tastepolicy.test");
    expect(JSON.stringify(c?.jwks)).not.toContain('"d"');
    await client.close();
  } finally {
    delete process.env.TASTEPOLICY_PUBLIC_ORIGIN;
    delete process.env.TASTEPOLICY_ATTESTATION_KEY;
  }
}, 40000);
