// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- assertions over loosely typed JSON responses */
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { exportJWK, generateKeyPair } from "jose";
import {
  platformDatabase,
  account,
  init,
  subjectProvider,
} from "./platform-fixtures";
import { proposal, reqId } from "./interactive-fixtures";
import { AttestationService } from "@/server/platform/attest-service";
import { present } from "@/lib/attest/sdjwt";
import { admitPublic } from "@/server/platform/public-limit";

let d: Awaited<ReturnType<typeof platformDatabase>>;
vi.mock("@/server/state/postgres", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/state/postgres")>()),
  getStateStore: () => (globalThis as any).__store,
}));
const ORIGIN = "https://tastepolicy.test",
  AUD = "https://merchant.test";
beforeAll(async () => {
  d = await platformDatabase();
  (globalThis as any).__store = d.store;
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  process.env.TASTEPOLICY_PUBLIC_ORIGIN = ORIGIN;
  process.env.TASTEPOLICY_ATTESTATION_KEY = JSON.stringify(
    await exportJWK(privateKey),
  );
}, 30000);
afterAll(async () => {
  delete process.env.TASTEPOLICY_PUBLIC_ORIGIN;
  delete process.env.TASTEPOLICY_ATTESTATION_KEY;
  await d?.db.close();
});
const post = (
  body: unknown,
  headers: Record<string, string> = {},
  ip = "203.0.113.5",
) =>
  new Request(`${ORIGIN}/api/attest/verify`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
async function attestation() {
  const a = await account(d),
    q = subjectProvider(),
    svc = new AttestationService(d.store);
  const passport = await svc.initialize(a.principal, init(), () => q.q);
  const key = await svc.issueKey(a.principal, {
    idempotencyKey: "rk-key-0001",
    displayLabel: "SYNTHETIC TEST DATA",
    scopes: ["TASTE_EVALUATE", "RECEIPT_READ"],
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  const agent = await svc.credentialPrincipal(key.secret!);
  const ev = (await svc.evaluate(
    agent,
    {
      idempotencyKey: "re-key-0001",
      passportRef: passport.passportRef,
      proposal: proposal(1),
    },
    () => q.q,
    reqId,
  )) as any;
  const lease = (await svc.leaseRequest(agent, {
    idempotencyKey: "rl-key-0001",
    evaluationRef: ev.evaluationRef,
  })) as any;
  return (await svc.attestationIssue(agent, {
    leaseRef: lease.leaseRef,
    audience: AUD,
  })) as any;
}

it("issuer metadata serves only public parameters, with the issuer pinned from configuration", async () => {
  const meta = await (
    await import("@/app/.well-known/jwt-vc-issuer/route")
  ).GET();
  const jwks = await (await import("@/app/.well-known/jwks.json/route")).GET();
  const m = await meta.json(),
    k = await jwks.json();
  expect(m.issuer).toBe(ORIGIN);
  expect(m.jwks.keys).toHaveLength(1);
  expect(JSON.stringify([m, k])).not.toContain('"d"');
  expect(k.keys[0]).toMatchObject({
    kty: "EC",
    crv: "P-256",
    alg: "ES256",
    use: "sig",
  });
  expect(meta.headers.get("cache-control")).toContain("public");
});
it("the hosted verifier route accepts JSON only, bounds bodies, never leaks internals, and rate-limits per client", async () => {
  const { POST } = await import("@/app/api/attest/verify/route");
  const at = await attestation();
  const ok = await POST(
    post({
      presentation: await present(at.attestation, ["decision"]),
      audience: AUD,
      dryRun: true,
    }),
  );
  expect(ok.status).toBe(200);
  const body = await ok.json();
  expect(body.data).toMatchObject({ valid: true, dryRun: true });
  expect(JSON.stringify(body)).not.toMatch(
    /subject_ref|candidate_name|agent_id/,
  );
  expect((await POST(post("x", { "content-type": "text/plain" }))).status).toBe(
    400,
  );
  expect(
    (await POST(post({ presentation: "a".repeat(20000), audience: AUD })))
      .status,
  ).toBe(413);
  const bad = await POST(post({ presentation: "garbage", audience: AUD }));
  expect((await bad.json()).data.valid).toBe(false);
  const invalid = await POST(
    post({ presentation: "x", audience: "http://insecure" }),
  );
  expect(invalid.status).toBe(400);
  const first = await POST(
    post(
      { presentation: await present(at.attestation, []), audience: AUD },
      {},
      "198.51.100.9",
    ),
  );
  expect((await first.json()).data.valid).toBe(true);
  const replay = await POST(
    post(
      { presentation: await present(at.attestation, []), audience: AUD },
      {},
      "198.51.100.9",
    ),
  );
  expect((await replay.json()).data).toMatchObject({
    valid: false,
    reasons: ["REPLAY"],
  });
});
it("the status route serves the signed list publicly and cacheably; unknown lists are 404, bad ids 400", async () => {
  const { GET } = await import("@/app/api/attest/status/[id]/route");
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const r = await GET(
    new Request(`${ORIGIN}/api/attest/status/1`, {
      headers: { "x-forwarded-for": "203.0.113.50" },
    }),
    ctx("1"),
  );
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toBe("application/statuslist+jwt");
  expect(r.headers.get("cache-control")).toContain("max-age=60");
  expect((await r.text()).split(".")).toHaveLength(3);
  expect(
    (await GET(new Request(`${ORIGIN}/api/attest/status/77`), ctx("77")))
      .status,
  ).toBe(404);
  expect(
    (await GET(new Request(`${ORIGIN}/api/attest/status/abc`), ctx("abc")))
      .status,
  ).toBe(400);
  expect(
    (await GET(new Request(`${ORIGIN}/api/attest/status/0`), ctx("0"))).status,
  ).toBe(400);
});
it("public admission: per-client window and concurrency are bounded and independent of the credential budget", () => {
  const req = (ip: string) =>
    new Request(ORIGIN, { headers: { "x-forwarded-for": ip } });
  const t = 10_000_000,
    releases: (() => void)[] = [];
  for (let i = 0; i < 7; i++)
    releases.push(admitPublic(req(`192.0.2.${i}`), t)!);
  expect(releases.every(Boolean)).toBe(true);
  const eighth = admitPublic(req("192.0.2.200"), t)!;
  expect(eighth).toBeTruthy();
  expect(admitPublic(req("192.0.2.201"), t)).toBeNull(); // concurrency cap of 8
  eighth();
  releases.forEach((r) => r());
  for (let i = 0; i < 60; i++) admitPublic(req("192.0.2.77"), t + i)!();
  expect(admitPublic(req("192.0.2.77"), t + 61)).toBeNull(); // 60 per minute
  expect(admitPublic(req("192.0.2.77"), t + 61_000)).toBeTruthy();
});
