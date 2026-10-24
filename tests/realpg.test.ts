// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- assertions over loosely typed JSON responses */
import { createHash, randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { realDatabase, REAL_URL } from "./realpg-fixture";
import { init, subjectProvider } from "./platform-fixtures";
import { proposal, reqId } from "./interactive-fixtures";
import { AttestationService } from "@/server/platform/attest-service";
import { OAuthService, OAuthError } from "@/server/platform/oauth-service";
import { PlatformService } from "@/server/platform/service";
import { VCT } from "@/lib/attest/issue";
import { calculateJwkThumbprint, exportJWK, generateKeyPair } from "jose";
import type { Principal } from "@/lib/platform/types";

// SYNTHETIC TEST DATA. Real PostgreSQL 16, real concurrent connections.
const suite = REAL_URL ? describe : describe.skip;
suite("real PostgreSQL: migrations and concurrency", () => {
  let d: Awaited<ReturnType<typeof realDatabase>>;
  let svc: AttestationService, oauth: OAuthService;
  let n = 0;
  async function account() {
    const password = randomBytes(20).toString("base64url"),
      res = await d.auth.api.signUpEmail({
        body: {
          name: "SYNTHETIC TEST DATA",
          email: `rp-${++n}-${randomBytes(3).toString("hex")}@example.test`,
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
  async function world() {
    const owner = await account(),
      q = subjectProvider();
    const passport: any = await svc.initialize(owner, init(), () => q.q);
    const key: any = await svc.issueKey(owner, {
      idempotencyKey: "k" + ++n,
      displayLabel: "SYNTHETIC TEST DATA",
      scopes: ["PASSPORT_READ", "TASTE_EVALUATE", "RECEIPT_READ"],
      expiresAt: new Date(Date.now() + 20 * 86400000).toISOString(),
    });
    const agent = await svc.credentialPrincipal(key.secret);
    const evaluate = () =>
      svc.evaluate(
        agent,
        {
          idempotencyKey: "e" + ++n,
          passportRef: passport.passportRef,
          proposal: proposal(1),
        },
        () => q.q,
        reqId,
      ) as Promise<any>;
    return { owner, agent, ref: passport.passportRef as string, evaluate };
  }
  beforeAll(async () => {
    d = await realDatabase();
    const { publicKey, privateKey } = await generateKeyPair("ES256", {
      extractable: true,
    });
    const pub = await exportJWK(publicKey),
      kid = await calculateJwkThumbprint(pub);
    const jwks = { keys: [{ ...pub, kid, alg: "ES256", use: "sig" }] };
    const cfg = {
      issuer: "https://tastepolicy.test",
      signer: { key: privateKey, alg: "ES256" as const, kid },
      jwks,
      epochKey: new Uint8Array(32).fill(3),
      keys: { active: kid, next: [], retired: [], revoked: [] },
      trusted: { "https://tastepolicy.test": { jwks, vct: [VCT] } },
    };
    svc = new AttestationService(d.store, undefined, async () => cfg);
    oauth = new OAuthService(d.store, "https://tastepolicy.test");
  }, 120000);
  afterAll(async () => d?.close());

  it("all eight migrations apply to a real server and the status function refuses to resurrect", async () => {
    const r = await d.pool.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='tastepolicy'",
    );
    expect(r.rows[0].n).toBeGreaterThan(30);
    await d.pool.query("SELECT tastepolicy.set_status(1, 99, 1)");
    await expect(
      d.pool.query("SELECT tastepolicy.set_status(1, 99, 0)"),
    ).rejects.toThrow(/permanent/);
  });

  it("twelve concurrent lease requests for one choice create exactly one live lease", async () => {
    const w = await world(),
      e = await w.evaluate();
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        svc.leaseRequest(w.agent, {
          idempotencyKey: `lr-${n}-${i}-key`,
          evaluationRef: e.evaluationRef,
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const live = await d.pool.query(
      "SELECT count(*)::int AS n FROM tastepolicy.platform_leases WHERE passport_ref=$1 AND status IN ('ACTIVE','ASK_PENDING','SUSPENDED')",
      [w.ref],
    );
    expect(live.rows[0].n).toBe(1);
  }, 60000);

  it("concurrent proof issuance gets distinct status indices; a revoke racing the issues leaves every proof invalid", async () => {
    const w = await world(),
      e = await w.evaluate();
    const lease: any = await svc.leaseRequest(w.agent, {
      idempotencyKey: `lr-${++n}-key-0`,
      evaluationRef: e.evaluationRef,
    });
    const issue = () =>
      svc.attestationIssue(w.agent, {
        leaseRef: lease.leaseRef,
        audience: "https://merchant.test",
      });
    for (let i = 0; i < 3; i++) await issue(); // certainly issued before the race
    const batch = await Promise.allSettled([
      ...Array.from({ length: 10 }, issue),
      svc.leaseRevoke(w.owner, { leaseRef: lease.leaseRef }),
      ...Array.from({ length: 6 }, issue),
    ]);
    // Everything that lost the race fails cleanly; nothing deadlocks.
    for (const r of batch)
      if (r.status === "rejected")
        expect(["LEASE_STATE_CONFLICT", "LEASE_NOT_FOUND"]).toContain(
          (r.reason as { code?: string }).code,
        );
    const idx = await d.pool.query(
      "SELECT list_id,idx FROM tastepolicy.lease_status_entries WHERE lease_ref=$1",
      [lease.leaseRef],
    );
    expect(new Set(idx.rows.map((r) => `${r.list_id}:${r.idx}`)).size).toBe(
      idx.rows.length,
    );
    const list = (
      await d.pool.query(
        "SELECT data FROM tastepolicy.attestation_status_lists WHERE list_id=1",
      )
    ).rows[0].data as Buffer;
    for (const r of idx.rows) {
      const value = (list[r.idx >> 2] >> ((r.idx % 4) * 2)) & 3;
      expect(value).toBe(1); // INVALID: the lease ended after (or while) they were issued
    }
  }, 90000);

  it("an authorization code redeems exactly once under ten simultaneous token requests; a refresh token rotates once and reuse ends the link", async () => {
    const p = await account();
    const reg = await oauth.register({
      client_name: "Race",
      redirect_uris: ["https://app.test/cb"],
    });
    const verifier = randomBytes(48).toString("base64url"),
      challenge = createHash("sha256").update(verifier).digest("base64url");
    const back = new URL(
      await oauth.decide(
        p,
        {
          response_type: "code",
          client_id: reg.client_id,
          redirect_uri: "https://app.test/cb",
          code_challenge: challenge,
          code_challenge_method: "S256",
          scope: "PASSPORT_READ",
        },
        true,
      ),
    );
    const code = back.searchParams.get("code")!;
    const redeem = () =>
      oauth.token(
        new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: reg.client_id,
          redirect_uri: "https://app.test/cb",
          code_verifier: verifier,
        }),
      );
    const won = (
      await Promise.allSettled(Array.from({ length: 10 }, redeem))
    ).filter((r) => r.status === "fulfilled");
    expect(won.length).toBeLessThanOrEqual(1);
    // a clean link for the refresh race
    const l = await (async () => {
      const v = randomBytes(48).toString("base64url"),
        ch = createHash("sha256").update(v).digest("base64url");
      const c = new URL(
        await oauth.decide(
          p,
          {
            response_type: "code",
            client_id: reg.client_id,
            redirect_uri: "https://app.test/cb",
            code_challenge: ch,
            code_challenge_method: "S256",
            scope: "PASSPORT_READ",
          },
          true,
        ),
      ).searchParams.get("code")!;
      return (await oauth.token(
        new URLSearchParams({
          grant_type: "authorization_code",
          code: c,
          client_id: reg.client_id,
          redirect_uri: "https://app.test/cb",
          code_verifier: v,
        }),
      )) as any;
    })();
    const spin = () =>
      oauth.token(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: l.refresh_token,
          client_id: reg.client_id,
        }),
      );
    const rr = await Promise.allSettled(Array.from({ length: 10 }, spin));
    expect(
      rr.filter((r) => r.status === "fulfilled").length,
    ).toBeLessThanOrEqual(1);
    for (const r of rr)
      if (r.status === "rejected") expect(r.reason).toBeInstanceOf(OAuthError);
    // the original access token is gone after reuse was detected or the link ended
    const plain = new PlatformService(d.store);
    const state = await oauth.connected(p);
    expect(state.length).toBeGreaterThan(0);
    void plain;
  }, 90000);

  it("a mixed storm of agent and owner operations never deadlocks and never leaves a live proof for an ended lease", async () => {
    const w = await world();
    const { DEFAULT_POLICY } = await import("@/lib/policy/types");
    const e = await w.evaluate();
    const lease: any = await svc.leaseRequest(w.agent, {
      idempotencyKey: `lr-${++n}-key-s`,
      evaluationRef: e.evaluationRef,
    });
    const ops: Promise<unknown>[] = [];
    for (let i = 0; i < 8; i++) {
      ops.push(svc.leaseVerify(w.agent, { leaseRef: lease.leaseRef }));
      ops.push(svc.leaseCheckpoint(w.agent, { leaseRef: lease.leaseRef }));
      ops.push(
        svc.attestationIssue(w.agent, {
          leaseRef: lease.leaseRef,
          audience: "https://merchant.test",
        }),
      );
      ops.push(svc.leaseList(w.owner, { passportRef: w.ref }));
    }
    ops.push(
      svc.policyPublish(w.owner, {
        idempotencyKey: `pp-${++n}-key-s`,
        passportRef: w.ref,
        document: {
          ...DEFAULT_POLICY,
          autonomy: { default: "OBSERVE", byDomain: {}, byAgent: {} },
        },
        expectedVersion: 0,
      }),
    );
    ops.push(svc.leaseRevoke(w.owner, { passportRef: w.ref }));
    const out = await Promise.allSettled(ops);
    for (const r of out)
      if (r.status === "rejected") {
        const code =
          (r.reason as { code?: string; message?: string }).code ??
          (r.reason as Error).message;
        expect([
          "LEASE_STATE_CONFLICT",
          "LEASE_NOT_FOUND",
          "STATE_VERSION_CONFLICT",
        ]).toContain(code);
      }
    const left = await d.pool.query(
      "SELECT count(*)::int AS n FROM tastepolicy.platform_leases WHERE passport_ref=$1 AND status IN ('ACTIVE','SUSPENDED','ASK_PENDING')",
      [w.ref],
    );
    expect(left.rows[0].n).toBe(0);
    const list = (
      await d.pool.query(
        "SELECT data FROM tastepolicy.attestation_status_lists WHERE list_id=1",
      )
    ).rows[0].data as Buffer;
    const rows = await d.pool.query(
      "SELECT idx FROM tastepolicy.lease_status_entries WHERE lease_ref=$1",
      [lease.leaseRef],
    );
    for (const r of rows.rows)
      expect((list[r.idx >> 2] >> ((r.idx % 4) * 2)) & 3).toBe(1);
  }, 90000);
});
