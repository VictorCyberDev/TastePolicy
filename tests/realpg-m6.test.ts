// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- assertions over loosely typed JSON responses */
import { createHash, randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { realDatabase, REAL_URL } from "./realpg-fixture";
import { init, subjectProvider } from "./platform-fixtures";
import { PlatformService } from "@/server/platform/service";
import { OAuthService, OAuthError } from "@/server/platform/oauth-service";
import { PostgresStateStore } from "@/server/state/postgres";
import type { Principal } from "@/lib/platform/types";

// SYNTHETIC TEST DATA. Real PostgreSQL, real concurrent connections. Runs when
// TASTEPOLICY_TEST_DATABASE_URL is set (CI provides a postgres service).
const suite = REAL_URL ? describe : describe.skip;
suite("M6 on real PostgreSQL: accounts, OAuth, isolation", () => {
  let d: Awaited<ReturnType<typeof realDatabase>>;
  let svc: PlatformService, oauth: OAuthService;
  let n = 0;
  async function account() {
    const password = randomBytes(20).toString("base64url"),
      res = await d.auth.api.signUpEmail({
        body: {
          name: "SYNTHETIC TEST DATA",
          email: `m6-${++n}-${randomBytes(3).toString("hex")}@example.test`,
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
  const pair = () => {
    const verifier = randomBytes(48).toString("base64url");
    return {
      verifier,
      challenge: createHash("sha256").update(verifier).digest("base64url"),
    };
  };
  const REDIRECT = "https://app.test/cb";
  async function link(p: Principal, clientId?: string) {
    const reg =
      clientId ??
      (await oauth.register({ client_name: "Race", redirect_uris: [REDIRECT] }))
        .client_id;
    const k = pair();
    const back = new URL(
      await oauth.decide(
        p,
        {
          response_type: "code",
          client_id: reg,
          redirect_uri: REDIRECT,
          code_challenge: k.challenge,
          code_challenge_method: "S256",
          scope: "PASSPORT_READ",
        },
        true,
      ),
    );
    const code = back.searchParams.get("code")!;
    const exchange = () =>
      oauth.token(
        new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: reg,
          redirect_uri: REDIRECT,
          code_verifier: k.verifier,
        }),
      ) as Promise<any>;
    return { client: reg, exchange };
  }
  beforeAll(async () => {
    d = await realDatabase();
    svc = new PlatformService(d.store);
    oauth = new OAuthService(d.store, "https://tastepolicy.test");
  }, 120000);
  afterAll(async () => d?.close());

  it("every migration at this head applies to a real server", async () => {
    const r = await d.pool.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='tastepolicy'",
    );
    expect(r.rows[0].n).toBeGreaterThan(20);
    const o = await d.pool.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='tastepolicy' AND table_name LIKE 'oauth_%'",
    );
    expect(o.rows[0].n).toBe(4);
  });

  it("an authorization code redeems exactly once under ten simultaneous token requests; replay ends the link", async () => {
    const p = await account();
    const l = await link(p);
    const out = await Promise.allSettled(
      Array.from({ length: 10 }, () => l.exchange()),
    );
    const won = out.filter((r) => r.status === "fulfilled");
    expect(won).toHaveLength(1);
    for (const r of out)
      if (r.status === "rejected") expect(r.reason).toBeInstanceOf(OAuthError);
    // the replays revoked what the single winner received
    const token = (won[0] as PromiseFulfilledResult<any>).value.access_token;
    await expect(svc.credentialPrincipal(token, "mcp")).rejects.toMatchObject({
      code: "CREDENTIAL_REVOKED",
    });
  }, 90000);

  it("a refresh token rotates once; concurrent reuse is detected and ends the whole link", async () => {
    const p = await account();
    const first = await (await link(p)).exchange();
    const client = (await oauth.connected(p))[0];
    expect(client.active).toBe(true);
    const clientId = (
      await d.pool.query(
        "SELECT client_id FROM tastepolicy.oauth_families WHERE family_id=$1",
        [client.familyId],
      )
    ).rows[0].client_id as string;
    const spin = () =>
      oauth.token(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: first.refresh_token,
          client_id: clientId,
        }),
      ) as Promise<any>;
    const out = await Promise.allSettled(Array.from({ length: 10 }, spin));
    expect(
      out.filter((r) => r.status === "fulfilled").length,
    ).toBeLessThanOrEqual(1);
    // a second wave with the (now spent) token certainly fails and the link is dead
    await expect(spin()).rejects.toBeInstanceOf(OAuthError);
    expect((await oauth.connected(p))[0].active).toBe(false);
    await expect(
      svc.credentialPrincipal(first.access_token, "mcp"),
    ).rejects.toMatchObject({ code: "CREDENTIAL_REVOKED" });
  }, 90000);

  it("another account cannot see, end or use a link; an OAuth token cannot reach generic REST", async () => {
    const a = await account(),
      b = await account();
    const q = subjectProvider();
    await svc.initialize(a, init(), () => q.q);
    const t = await (await link(a)).exchange();
    expect(await oauth.connected(b)).toEqual([]);
    const [fam] = await oauth.connected(a);
    await expect(oauth.disconnect(b, fam.familyId)).rejects.toBeInstanceOf(
      OAuthError,
    );
    const mcp = await svc.credentialPrincipal(t.access_token, "mcp");
    expect(mcp.userId).toBe(a.userId);
    await expect(
      svc.credentialPrincipal(t.access_token, "rest"),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(
      svc.credentialPrincipal(t.access_token, "a2a"),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    const bRef = (await svc.initialize(b, init(), () => q.q)) as any;
    await expect(
      svc.read(mcp, { passportRef: bRef.passportRef }),
    ).rejects.toMatchObject({ code: "GRANT_REQUIRED" });
    await oauth.disconnect(a, fam.familyId);
    await expect(
      svc.credentialPrincipal(t.access_token, "mcp"),
    ).rejects.toMatchObject({ code: "CREDENTIAL_REVOKED" });
  }, 90000);

  it("the shared admission counter lets exactly the limit through for concurrent callers on two pools", async () => {
    const key = "a".repeat(64);
    const second = new Pool({
      connectionString: (d.pool as any).options.connectionString,
      max: 4,
    });
    second.on("error", () => {});
    const other = new PostgresStateStore(second);
    const results = await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        (i % 2 ? d.store : other).transaction((r) =>
          r.oauth.admit(key, "2026-10-24T11:30", 10),
        ),
      ),
    );
    await second.end();
    expect(results.filter(Boolean)).toHaveLength(10);
  }, 60000);
});
