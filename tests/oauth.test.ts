// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- assertions over loosely typed JSON responses */
import { createHash, randomBytes } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import {
  platformDatabase,
  account,
  init,
  subjectProvider,
} from "./platform-fixtures";
import { PlatformService } from "@/server/platform/service";
import { OAuthService, OAuthError } from "@/server/platform/oauth-service";
import { gatewayInvoke } from "@/server/platform/gateway";
import { PLATFORM_TOOLS } from "@/lib/platform/contracts";
import type { Principal } from "@/lib/platform/types";

// SYNTHETIC TEST DATA. Real Better Auth sessions and real SQL in PGlite.
let d: Awaited<ReturnType<typeof platformDatabase>>;
let now = Date.now();
const clock = () => new Date(now).toISOString();
const ORIGIN = "https://tastepolicy.test";
let oauth: OAuthService, svc: PlatformService;
const cimdDocs = new Map<string, string>();
beforeAll(async () => {
  d = await platformDatabase();
  oauth = new OAuthService(d.store, ORIGIN, clock, async (u) => {
    const doc = cimdDocs.get(u);
    if (!doc) throw Error("unreachable");
    return doc;
  });
  svc = new PlatformService(d.store, clock);
}, 30000);
afterAll(async () => d?.db.close());

const REDIRECT = "https://chatgpt.test/connector_platform_oauth_redirect";
const pkce = () => {
  const verifier = randomBytes(48).toString("base64url");
  return {
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
};
async function person(withPassport = true) {
  now = Date.now();
  const a = await account(d);
  if (withPassport) {
    const q = subjectProvider();
    await svc.initialize(a.principal, init(), () => q.q);
  }
  return a.principal;
}
async function client(redirect = REDIRECT) {
  const c = await oauth.register({
    client_name: "ChatGPT",
    redirect_uris: [redirect],
    token_endpoint_auth_method: "none",
  });
  return c.client_id as string;
}
const authQ = (clientId: string, challenge: string, extra = {}) => ({
  response_type: "code",
  client_id: clientId,
  redirect_uri: REDIRECT,
  scope: "PASSPORT_READ TASTE_EVALUATE",
  state: "xyz",
  code_challenge: challenge,
  code_challenge_method: "S256",
  resource: `${ORIGIN}/api/mcp`,
  ...extra,
});
async function link(p: Principal) {
  const id = await client(),
    k = pkce();
  const back = new URL(await oauth.decide(p, authQ(id, k.challenge), true));
  expect(back.searchParams.get("state")).toBe("xyz");
  expect(back.searchParams.get("iss")).toBe(ORIGIN);
  const code = back.searchParams.get("code")!;
  const exchange = (extra: Record<string, string> = {}) =>
    oauth.token(
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: id,
        redirect_uri: REDIRECT,
        code_verifier: k.verifier,
        ...extra,
      }),
    ) as Promise<Record<string, any>>;
  return { id, k, code, exchange };
}
const code = (p: Promise<unknown>) =>
  p.then(
    () => "OK",
    (e) => (e instanceof OAuthError ? e.error : (e as Error).message),
  );

it("authorization server metadata: PKCE S256, public clients, CIMD, iss parameter; no client secrets", () => {
  const m: any = oauth.metadata();
  expect(m.issuer).toBe(ORIGIN);
  expect(m.code_challenge_methods_supported).toEqual(["S256"]);
  expect(m.token_endpoint_auth_methods_supported).toEqual(["none"]);
  expect(m.client_id_metadata_document_supported).toBe(true);
  expect(m.authorization_response_iss_parameter_supported).toBe(true);
  expect(m.grant_types_supported).toEqual([
    "authorization_code",
    "refresh_token",
  ]);
});

it("full account linking: consent → code → PKCE exchange → token authenticates as that person on MCP only, with granted scopes", async () => {
  const p = await person();
  const l = await link(p);
  const t = await l.exchange();
  expect(t).toMatchObject({
    token_type: "Bearer",
    expires_in: 900,
    scope: "PASSPORT_READ TASTE_EVALUATE",
  });
  expect(t.access_token).toMatch(/^tp_live_/);
  const mcp = await svc.credentialPrincipal(t.access_token, "mcp");
  expect(mcp.userId).toBe(p.userId);
  expect(mcp.scopes).toEqual(["PASSPORT_READ", "TASTE_EVALUATE"]);
  const summary: any = await svc.read(mcp, {
    passportRef: (await svc.inspect(p)).passport!.passportRef,
  });
  expect(summary.schemaVersion).toBe("taste-passport-v1");
  // audience bound: REST and A2A refuse an OAuth token
  await expect(
    svc.credentialPrincipal(t.access_token, "rest"),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  await expect(
    svc.credentialPrincipal(t.access_token, "a2a"),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  // the scope not granted is refused
  const receiptTool = PLATFORM_TOOLS.find((t) => t.op === "receipt")!;
  await expect(
    gatewayInvoke(
      { store: d.store, factory: () => null as never },
      mcp,
      receiptTool,
      {},
      "r",
    ),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  // OAuth links never appear as developer keys
  expect((await svc.inspect(p)).credentials).toEqual([]);
  // durable across a "restart": a new service over the same store still honours it
  const again = new OAuthService(d.store, ORIGIN, clock);
  expect((await again.connected(p))[0]).toMatchObject({
    clientName: "ChatGPT",
    active: true,
  });
  expect(
    (
      await new PlatformService(d.store, clock).credentialPrincipal(
        t.access_token,
        "mcp",
      )
    ).userId,
  ).toBe(p.userId);
}, 60000);

it("PKCE, redirect, client, scope, resource and duplicate-parameter checks fail closed", async () => {
  const p = await person(false);
  const id = await client();
  const k = pkce();
  const bad = (extra: object) =>
    code(oauth.decide(p, authQ(id, k.challenge, extra), true));
  expect(await bad({ redirect_uri: "https://evil.test/cb" })).toBe(
    "invalid_request",
  );
  expect(await bad({ client_id: "nope-nope-nope" })).toBe("invalid_client");
  expect(await bad({ response_type: "token" })).toBe(
    "unsupported_response_type",
  );
  expect(await bad({ code_challenge_method: "plain" })).toBe("invalid_request");
  expect(await bad({ code_challenge: "short" })).toBe("invalid_request");
  expect(await bad({ scope: "ADMIN" })).toBe("invalid_scope");
  expect(await bad({ scope: "PASSPORT_READ PASSPORT_READ" })).toBe(
    "invalid_scope",
  );
  expect(await bad({ resource: "https://other.test/api/mcp" })).toBe(
    "invalid_target",
  );
  expect(() =>
    oauth.parse(new URLSearchParams("client_id=a&client_id=b")),
  ).toThrow();
  // an unregistered redirect never produces a redirect, only a direct error
  try {
    await oauth.decide(
      p,
      authQ(id, k.challenge, { redirect_uri: "https://evil.test/cb" }),
      true,
    );
  } catch (e) {
    expect((e as OAuthError).direct).toBe(true);
  }
  // http redirects are only for loopback; fragments are never allowed
  await expect(
    oauth.register({ redirect_uris: ["http://evil.test/cb"] }),
  ).rejects.toBeInstanceOf(OAuthError);
  await expect(
    oauth.register({ redirect_uris: ["https://a.test/cb#f"] }),
  ).rejects.toBeInstanceOf(OAuthError);
  await expect(
    oauth.register({
      redirect_uris: ["https://a.test/cb"],
      token_endpoint_auth_method: "client_secret_basic",
    }),
  ).rejects.toBeInstanceOf(OAuthError);
  // a hosted issuer refuses loopback redirects unless the operator enabled developer mode
  await expect(
    oauth.register({ redirect_uris: ["http://127.0.0.1:1111/callback"] }),
  ).rejects.toBeInstanceOf(OAuthError);
  const dev = new OAuthService(d.store, ORIGIN, clock, undefined, true);
  // developer mode: loopback redirects may vary the port
  const lo = await dev.register({
    redirect_uris: ["http://127.0.0.1:1111/callback"],
  });
  const q = authQ(lo.client_id, k.challenge, {
    redirect_uri: "http://127.0.0.1:54321/callback",
  });
  expect(await code(dev.decide(p, q, true))).toBe("OK");
  // and a registered loopback client does not work against a hosted issuer that is not in developer mode
  expect(await code(oauth.decide(p, q, true))).toBe("invalid_request");
}, 60000);

it("consent needs a recent sign-in by the account owner; denial returns access_denied with iss", async () => {
  const p = await person(false);
  const k = pkce();
  const id = await client();
  const stale: Principal = {
    ...p,
    authenticatedAt: new Date(now - 3_600_000).toISOString(),
  };
  expect(await code(oauth.decide(stale, authQ(id, k.challenge), true))).toBe(
    "login_required",
  );
  expect(
    await code(
      oauth.decide({ ...p, kind: "CREDENTIAL" }, authQ(id, k.challenge), true),
    ),
  ).toBe("login_required");
  const denied = new URL(await oauth.decide(p, authQ(id, k.challenge), false));
  expect(denied.searchParams.get("error")).toBe("access_denied");
  expect(denied.searchParams.get("iss")).toBe(ORIGIN);
  expect(denied.searchParams.get("code")).toBeNull();
});

it("code exchange: wrong verifier, wrong redirect, wrong client, secrets, expiry and replay all fail; replay revokes what the code produced", async () => {
  const p = await person();
  const l = await link(p);
  expect(await code(l.exchange({ code_verifier: pkce().verifier }))).toBe(
    "invalid_grant",
  );
  // that failed attempt consumed the code: single use
  expect(await code(l.exchange())).toBe("invalid_grant");
  const l2 = await link(p);
  expect(
    await code(l2.exchange({ redirect_uri: "https://evil.test/cb" })),
  ).toBe("invalid_grant");
  const l3 = await link(p);
  expect(await code(l3.exchange({ client_secret: "x" }))).toBe(
    "invalid_client",
  );
  expect(
    await code(l3.exchange({ resource: "https://other.test/api/mcp" })),
  ).toBe("invalid_target");
  const l4 = await link(p);
  now += 3 * 60_000;
  expect(await code(l4.exchange())).toBe("invalid_grant");
  now = Date.now();
  // replay: the second redemption kills the tokens from the first
  const l5 = await link(p);
  const t = await l5.exchange();
  expect(await code(l5.exchange())).toBe("invalid_grant");
  await expect(
    svc.credentialPrincipal(t.access_token, "mcp"),
  ).rejects.toMatchObject({ code: "CREDENTIAL_REVOKED" });
  expect(
    await code(
      oauth.token(
        new URLSearchParams({ grant_type: "password", client_id: l.id }),
      ),
    ),
  ).toBe("unsupported_grant_type");
}, 60000);

it("refresh tokens rotate; presenting an old one ends the whole link; access tokens expire quickly", async () => {
  const p = await person();
  const l = await link(p);
  const t = await l.exchange();
  const refresh = (rt: string, extra: Record<string, string> = {}) =>
    oauth.token(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: rt,
        client_id: l.id,
        ...extra,
      }),
    ) as Promise<Record<string, any>>;
  expect(await code(refresh(t.refresh_token, { scope: "RECEIPT_READ" }))).toBe(
    "invalid_scope",
  );
  const t2 = await refresh(t.refresh_token, { scope: "PASSPORT_READ" });
  expect(t2.scope).toBe("PASSPORT_READ");
  expect(t2.refresh_token).not.toBe(t.refresh_token);
  expect(
    (await svc.credentialPrincipal(t2.access_token, "mcp")).scopes,
  ).toEqual(["PASSPORT_READ"]);
  // the first refresh token is spent: reuse is treated as theft and kills the link
  expect(await code(refresh(t.refresh_token))).toBe("invalid_grant");
  await expect(
    svc.credentialPrincipal(t2.access_token, "mcp"),
  ).rejects.toMatchObject({ code: "CREDENTIAL_REVOKED" });
  expect(await code(refresh(t2.refresh_token))).toBe("invalid_grant");
  // another client cannot use the token
  const l2 = await link(p),
    t3 = await l2.exchange();
  expect(
    await code(
      oauth.token(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: t3.refresh_token,
          client_id: await client(),
        }),
      ),
    ),
  ).toBe("invalid_grant");
  // expiry: access tokens last 15 minutes
  const t4 = await (await link(p)).exchange();
  const late = new PlatformService(d.store, () =>
    new Date(now + 16 * 60_000).toISOString(),
  );
  await expect(
    late.credentialPrincipal(t4.access_token, "mcp"),
  ).rejects.toMatchObject({ code: "CREDENTIAL_EXPIRED" });
}, 60000);

it("disconnecting ends access at once; another account cannot see or end the link; tokens cannot reach other people's Passports", async () => {
  const a = await person(),
    b = await person();
  const l = await link(a);
  const t = await l.exchange();
  const [fam] = await oauth.connected(a);
  expect(await oauth.connected(b)).toEqual([]);
  await expect(oauth.disconnect(b, fam.familyId)).rejects.toBeInstanceOf(
    OAuthError,
  );
  // A's token against B's Passport
  const tok = await svc.credentialPrincipal(t.access_token, "mcp");
  const bRef = (await svc.inspect(b)).passport!.passportRef;
  await expect(svc.read(tok, { passportRef: bRef })).rejects.toMatchObject({
    code: "GRANT_REQUIRED",
  });
  // A disconnects
  expect(await oauth.disconnect(a, fam.familyId)).toMatchObject({
    active: false,
  });
  await expect(
    svc.credentialPrincipal(t.access_token, "mcp"),
  ).rejects.toMatchObject({ code: "CREDENTIAL_REVOKED" });
  expect(
    await code(
      oauth.token(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: t.refresh_token,
          client_id: l.id,
        }),
      ),
    ),
  ).toBe("invalid_grant");
  expect((await oauth.connected(a))[0].active).toBe(false);
  // RFC 7009 revocation of an access token
  const l2 = await link(a),
    t2 = await l2.exchange();
  await oauth.revoke(t2.access_token);
  await expect(
    svc.credentialPrincipal(t2.access_token, "mcp"),
  ).rejects.toMatchObject({ code: "CREDENTIAL_REVOKED" });
  await oauth.revoke("garbage");
}, 60000);

it("client ID metadata documents: the document must name its own URL, use https/loopback redirects, stay public, and be fetched only through the guarded fetcher", async () => {
  const p = await person(false);
  const k = pkce();
  const url = "https://chatgpt.test/oauth/client.json";
  const doc = (o: object) =>
    JSON.stringify({
      client_id: url,
      client_name: "ChatGPT",
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
      ...o,
    });
  const run = (u = url) => code(oauth.decide(p, authQ(u, k.challenge), true));
  cimdDocs.set(url, doc({}));
  expect(await run()).toBe("OK");
  const other = "https://other.test/client.json";
  cimdDocs.set(other, doc({})); // names a different client_id
  expect(await run(other)).toBe("invalid_client");
  const secret = "https://secret.test/client.json";
  cimdDocs.set(
    secret,
    JSON.stringify({
      client_id: secret,
      redirect_uris: [REDIRECT],
      client_secret: "x",
    }),
  );
  expect(await run(secret)).toBe("invalid_client");
  const weird = "https://weird.test/client.json";
  cimdDocs.set(
    weird,
    JSON.stringify({
      client_id: weird,
      redirect_uris: ["http://evil.test/cb"],
    }),
  );
  expect(await run(weird)).toBe("invalid_client");
  expect(await run("https://unreachable.test/c.json")).toBe("invalid_client");
  // the production fetcher refuses private and metadata addresses
  const real = new OAuthService(d.store, ORIGIN, clock);
  for (const u of [
    "https://127.0.0.1/c.json",
    "https://169.254.169.254/c.json",
    "https://[::1]/c.json",
    "https://10.0.0.1/c.json",
  ])
    expect(await code(real.preview(authQ(u, k.challenge)))).toBe(
      "invalid_client",
    );
}, 60000);

it("CIMD negotiates public auth from plural choices despite a different legacy preference, while rejecting no intersection and malformed choices", async () => {
  const p = await person(false);
  const id = "https://chatgpt.com/oauth/client.json";
  const k = pkce();
  cimdDocs.set(
    id,
    JSON.stringify({
      client_id: id,
      client_name: "ChatGPT",
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "private_key_jwt",
      token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
      jwks_uri: "https://chatgpt.com/oauth/jwks.json",
    }),
  );
  const redirect = new URL(await oauth.decide(p, authQ(id, k.challenge), true));
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: id,
    code: redirect.searchParams.get("code")!,
    redirect_uri: REDIRECT,
    code_verifier: k.verifier,
  });
  // A signed assertion is not silently accepted or ignored by a public server.
  const assertion = new URLSearchParams(form);
  assertion.set("client_assertion", "not-a-supported-auth-method");
  expect(await code(oauth.token(assertion))).toBe("invalid_client");
  expect(await oauth.token(form)).toMatchObject({ token_type: "Bearer" });
  const invalid = [
    { token_endpoint_auth_methods_supported: ["private_key_jwt"] },
    { token_endpoint_auth_methods_supported: [] },
    { token_endpoint_auth_methods_supported: "none" },
    { token_endpoint_auth_methods_supported: ["none", null] },
    { token_endpoint_auth_methods_supported: Array(17).fill("none") },
    { token_endpoint_auth_method: "private_key_jwt" },
    {
      token_endpoint_auth_method: 42,
      token_endpoint_auth_methods_supported: ["none"],
    },
  ];
  for (const [i, fields] of invalid.entries()) {
    const badId = `https://client.test/${i}/metadata.json`;
    cimdDocs.set(
      badId,
      JSON.stringify({
        client_id: badId,
        redirect_uris: [REDIRECT],
        ...fields,
      }),
    );
    expect(await code(oauth.preview(authQ(badId, k.challenge)))).toBe(
      "invalid_client",
    );
  }
}, 60000);

it("review fixes: a client mismatch does not spend the refresh token; the family has an absolute lifetime; names are sanitized; revoke tolerates malformed ids", async () => {
  const p = await person();
  const l = await link(p);
  const t = await l.exchange();
  const other = await client();
  // a thief using the token under another client_id cannot burn it
  expect(
    await code(
      oauth.token(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: t.refresh_token,
          client_id: other,
        }),
      ),
    ),
  ).toBe("invalid_grant");
  const ok = await oauth.token(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: t.refresh_token,
      client_id: l.id,
    }),
  );
  expect((ok as any).access_token).toBeTruthy();
  // absolute lifetime: 90 days after consent a refresh is refused
  const old = new OAuthService(d.store, ORIGIN, () =>
    new Date(now + 91 * 86_400_000).toISOString(),
  );
  expect(
    await code(
      old.token(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: (ok as any).refresh_token,
          client_id: l.id,
        }),
      ),
    ),
  ).toBe("invalid_grant");
  // control and bidi characters never reach the consent screen
  const reg = await oauth.register({
    client_name: "Cl‮aude\u0000 \n",
    redirect_uris: [REDIRECT],
  });
  expect(reg.client_name).toBe("Claude");
  // a malformed token id is a no-op, not an error
  await oauth.revoke("tp_live_zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz.x");
  await oauth.revoke("tp_live_00000000-0000-0000-0000-00000000000g.x");
});

it("review fixes: a registration flood evicts the oldest unlinked client instead of locking OAuth out; linked clients survive", async () => {
  const p = await person();
  const linked = await link(p);
  await linked.exchange();
  await d.db.query(
    `INSERT INTO tastepolicy.oauth_clients(client_id,source,client_name,redirect_uris,fetched_at)
     SELECT 'tpc_flood' || g, 'DCR', 'flood', ARRAY['https://flood.test/cb'], now() + (g || ' milliseconds')::interval
     FROM generate_series(1, 5000) g`,
  );
  const total = async () =>
    (
      (
        await d.db.query(
          "SELECT count(*)::int AS n FROM tastepolicy.oauth_clients",
        )
      ).rows[0] as { n: number }
    ).n;
  const before = await total();
  expect(before).toBeGreaterThanOrEqual(5000);
  const fresh = await client(); // table is full; this must still succeed
  expect(fresh).toMatch(/^tpc_/);
  expect(await total()).toBe(before); // one made room for one
  const survivors = await d.db.query(
    "SELECT client_id FROM tastepolicy.oauth_clients WHERE client_id = ANY($1)",
    [[linked.id, fresh]],
  );
  expect(survivors.rows.length).toBe(2); // the linked client was never a candidate
  await d.db.query(
    "DELETE FROM tastepolicy.oauth_clients WHERE client_id LIKE 'tpc_flood%'",
  );
}, 90000);
it("review fixes: deleting the account ends every linked assistant, and a refresh token cannot outlive its person", async () => {
  const p = await person();
  const l = await link(p),
    t = await l.exchange();
  await svc.delete(
    p,
    {
      idempotencyKey: "del-account-key-1",
      confirmation: "DELETE ACCOUNT",
    },
    true,
  );
  await expect(
    svc.credentialPrincipal(t.access_token, "mcp"),
  ).rejects.toBeTruthy();
  const fam = await d.db.query(
    "SELECT revoked_at FROM tastepolicy.oauth_families WHERE client_id=$1",
    [l.id],
  );
  // either revoked in place or removed with the account; never still usable
  const row = fam.rows[0] as { revoked_at: unknown } | undefined;
  expect(row === undefined || !!row.revoked_at).toBe(true);
  expect(
    await code(
      oauth.token(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: t.refresh_token,
          client_id: l.id,
        }),
      ),
    ),
  ).toBe("invalid_grant");
}, 60000);
