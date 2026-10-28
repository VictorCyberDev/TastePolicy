// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- assertions over loosely typed JSON responses */
// Controlled local load and contention probe: real PostgreSQL, real concurrent
// connections, the deterministic local provider (no Qloo calls), the real
// services. It measures the request path and database contention of this
// repository's code. It is NOT a capacity claim: the numbers depend on the
// machine, and a hosted deployment (network, cold starts, a managed database)
// will differ. Budgets below are regression tripwires with wide margins.
// Set LOAD_REPORT=<path> to also write the measurements as JSON.
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { calculateJwkThumbprint, exportJWK, generateKeyPair } from "jose";
import { realDatabase, REAL_URL } from "./realpg-fixture";
import { init, subjectProvider } from "./platform-fixtures";
import { proposal, reqId, commitOf } from "./interactive-fixtures";
import { AttestationService } from "@/server/platform/attest-service";
import type { AttestationConfig } from "@/server/platform/attest-config";
import { VCT } from "@/lib/attest/issue";
import type { Principal } from "@/lib/platform/types";

const suite = REAL_URL ? describe : describe.skip;
const AUD = "https://receiver.test";
const report: Record<string, unknown> = {
  note: "Local controlled probe; synthetic data; deterministic provider; not a capacity claim.",
  at: new Date().toISOString(),
  scenarios: {} as Record<string, unknown>,
};
const q = (a: number[], p: number) =>
  a[Math.min(a.length - 1, Math.floor(a.length * p))];
async function drive<T>(
  name: string,
  total: number,
  concurrency: number,
  call: (i: number) => Promise<T>,
) {
  const times: number[] = [],
    results: (T | Error)[] = [];
  let next = 0;
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (;;) {
        const i = next++;
        if (i >= total) return;
        const s = performance.now();
        try {
          results[i] = await call(i);
        } catch (e) {
          results[i] = e as Error;
        }
        times.push(performance.now() - s);
      }
    }),
  );
  times.sort((a, b) => a - b);
  const seconds = (performance.now() - t0) / 1000;
  const stat = {
    n: total,
    concurrency,
    p50Ms: Math.round(q(times, 0.5)),
    p95Ms: Math.round(q(times, 0.95)),
    maxMs: Math.round(times.at(-1)!),
    perSecond: Math.round(total / seconds),
  };
  (report.scenarios as Record<string, unknown>)[name] = stat;
  console.log(
    `${name.padEnd(34)} n=${stat.n} c=${stat.concurrency} p50=${stat.p50Ms}ms p95=${stat.p95Ms}ms max=${stat.maxMs}ms ${stat.perSecond}/s`,
  );
  return { stat, results };
}
suite("local load and contention on real PostgreSQL", () => {
  let d: Awaited<ReturnType<typeof realDatabase>>;
  let svc: AttestationService;
  let n = 0;
  async function owner() {
    const password = randomBytes(20).toString("base64url"),
      res = await d.auth.api.signUpEmail({
        body: {
          name: "SYNTHETIC TEST DATA",
          email: `load-${++n}-${randomBytes(3).toString("hex")}@example.test`,
          password,
        },
        asResponse: true,
      });
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const s = (await d.auth.api.getSession({
      headers: new Headers({ cookie }),
    }))!;
    return {
      userId: s.user.id,
      sessionId: s.session.id,
      authenticatedAt: s.session.createdAt.toISOString(),
      kind: "SESSION",
    } as Principal;
  }
  beforeAll(async () => {
    d = await realDatabase();
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
      epochKey: new Uint8Array(32).fill(5),
      keys: { active: kid, next: [], retired: [], revoked: [] },
      trusted: { "https://tastepolicy.test": { jwks, vct: [VCT] } },
    };
    svc = new AttestationService(d.store, undefined, async () => cfg);
  }, 60000);
  afterAll(async () => {
    if (process.env.LOAD_REPORT)
      writeFileSync(process.env.LOAD_REPORT, JSON.stringify(report, null, 2));
    await d?.close();
  });
  async function world() {
    const o = await owner(),
      p = subjectProvider();
    const passport: any = await svc.initialize(o, init(), () => p.q);
    const key: any = await svc.issueKey(o, {
      idempotencyKey: "k" + ++n,
      displayLabel: "SYNTHETIC TEST DATA",
      scopes: ["PASSPORT_READ", "TASTE_EVALUATE", "RECEIPT_READ"],
      expiresAt: new Date(Date.now() + 20 * 86400000).toISOString(),
    });
    const agent = await svc.credentialPrincipal(key.secret);
    const evaluate = (id: string) =>
      svc.evaluate(
        agent,
        {
          idempotencyKey: id,
          passportRef: passport.passportRef,
          proposal: proposal(1),
        },
        () => p.q,
        reqId,
      ) as Promise<any>;
    return { o, agent, ref: passport.passportRef as string, evaluate };
  }

  it("evaluate: distinct requests under concurrency succeed; identical requests persist exactly one evaluation", async () => {
    const w = await world();
    const { results, stat } = await drive("evaluate (distinct)", 40, 8, (i) =>
      w.evaluate(`dist-${i}-${randomBytes(4).toString("hex")}`),
    );
    expect(results.filter((r) => r instanceof Error)).toEqual([]);
    expect(stat.p95Ms).toBeLessThan(8000);
    const dup = await drive("evaluate (same key x20)", 20, 20, () =>
      w.evaluate("same-key-for-all-twenty"),
    );
    const refs = new Set(
      dup.results.map((r) =>
        r instanceof Error ? r.message : r.evaluationRef,
      ),
    );
    expect(refs.size).toBe(1);
    const rows = await d.pool.query(
      "SELECT count(*)::int AS n FROM tastepolicy.platform_evaluations WHERE passport_ref=$1",
      [w.ref],
    );
    expect(rows.rows[0].n).toBe(41);
  }, 180000);
  it("lease verify and checkpoint under contention stay consistent; a revoke wins every race", async () => {
    const w = await world();
    const e = await w.evaluate("lease-e-1");
    const lease: any = await svc.leaseRequest(w.agent, {
      idempotencyKey: "lease-1-key",
      evaluationRef: e.evaluationRef,
    });
    const v = await drive("lease verify", 100, 16, () =>
      svc.leaseVerify(w.agent, {
        leaseRef: lease.leaseRef,
        ...commitOf(lease),
      }),
    );
    expect(v.results.filter((r) => r instanceof Error)).toEqual([]);
    expect(v.stat.p95Ms).toBeLessThan(5000);
    const c = await drive("lease checkpoint (same lease)", 40, 16, () =>
      svc.leaseCheckpoint(w.agent, {
        leaseRef: lease.leaseRef,
        ...commitOf(lease),
      }),
    );
    expect(c.results.filter((r) => r instanceof Error)).toEqual([]);
    // revoke in the middle of a burst of checkpoints
    const burst = Array.from({ length: 30 }, () =>
      svc
        .leaseCheckpoint(w.agent, {
          leaseRef: lease.leaseRef,
          ...commitOf(lease),
        })
        .catch((x: any) => x),
    );
    const revoke = svc.leaseRevoke(w.o, { leaseRef: lease.leaseRef });
    await Promise.all([...burst, revoke]);
    const after: any = await svc.leaseVerify(w.agent, {
      leaseRef: lease.leaseRef,
      ...commitOf(lease),
    });
    expect([after.status, after.valid]).toEqual(["REVOKED", false]);
    // and nothing can extend it afterwards
    const late: any = await svc
      .leaseCheckpoint(w.agent, {
        leaseRef: lease.leaseRef,
        ...commitOf(lease),
      })
      .catch((x) => x);
    expect(late.valid ?? false).toBe(false);
  }, 180000);
  it("attestation verification, status list and malformed bursts stay bounded and correct", async () => {
    const w = await world();
    const e = await w.evaluate("att-e-1");
    const lease: any = await svc.leaseRequest(w.agent, {
      idempotencyKey: "att-lease-key",
      evaluationRef: e.evaluationRef,
    });
    const at: any = await svc.attestationIssue(w.agent, {
      leaseRef: lease.leaseRef,
      audience: AUD,
    });
    const ok = await drive("attestation verify (valid)", 100, 16, () =>
      svc.attestationVerify({
        presentation: at.attestation,
        audience: AUD,
        dryRun: true,
      }),
    );
    expect(
      ok.results.every((r) => !(r instanceof Error) && (r as any).valid),
    ).toBe(true);
    const bad = await drive("attestation verify (malformed)", 200, 16, (i) =>
      svc
        .attestationVerify({
          presentation: ["x", "a~b~", "x".repeat(2000), "~~"][i % 4],
          audience: AUD,
          dryRun: true,
        })
        .catch((x: any) => x),
    );
    expect(
      bad.results.every(
        (r: any) => r.valid === false || r.code === "INVALID_INPUT",
      ),
    ).toBe(true);
    const list = await drive("status list token", 100, 16, () =>
      svc.statusListToken(1),
    );
    expect(list.results.every((r) => typeof r === "string")).toBe(true);
    expect(ok.stat.p95Ms).toBeLessThan(5000);
  }, 180000);
  it("OAuth discovery documents are cheap and constant under load", async () => {
    const { GET: prm } =
      await import("@/app/.well-known/oauth-protected-resource/api/mcp/route");
    const r = await drive(
      "oauth protected-resource md",
      200,
      16,
      async () => (await prm(new Request("https://tastepolicy.test/x"))).status,
    );
    expect(new Set(r.results)).toEqual(new Set([200]));
  }, 60000);
});
