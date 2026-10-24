// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- assertions over loosely typed JSON responses */
import { createHash, randomBytes } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import { platformDatabase } from "./platform-fixtures";
import {
  handleAuthorize,
  handleDecision,
  handleRegister,
  handleRevoke,
  handleToken,
  metadataResponse,
} from "@/server/platform/oauth-http";
import { GET as prm } from "@/app/.well-known/oauth-protected-resource/api/mcp/route";

let d: Awaited<ReturnType<typeof platformDatabase>>;
const ORIGIN = "https://tastepolicy.test";
beforeAll(async () => {
  d = await platformDatabase();
}, 30000);
afterAll(async () => {
  delete process.env.TASTEPOLICY_PUBLIC_ORIGIN;
  await d?.db.close();
});
const req = (path: string, init: RequestInit = {}) =>
  new Request(ORIGIN + path, init);

it("without a pinned HTTPS origin the authorization server does not exist and no authorization server is advertised", async () => {
  delete process.env.TASTEPOLICY_PUBLIC_ORIGIN;
  expect(
    metadataResponse(req("/.well-known/oauth-authorization-server")).status,
  ).toBe(404);
  expect(
    (await handleAuthorize(req("/api/oauth/authorize?x=1"), d.store)).status,
  ).toBe(404);
  expect(
    (await handleToken(req("/api/oauth/token", { method: "POST" }), d.store))
      .status,
  ).toBe(404);
  const m: any = await prm(
    req("/.well-known/oauth-protected-resource/api/mcp"),
  ).json();
  expect(m.authorization_servers).toBeUndefined();
});

it("with a pinned origin: metadata, protected-resource metadata, DCR, authorize redirect to consent, token endpoint rules", async () => {
  process.env.TASTEPOLICY_PUBLIC_ORIGIN = ORIGIN;
  const meta = metadataResponse(req("/.well-known/oauth-authorization-server"));
  expect(meta.status).toBe(200);
  expect(meta.headers.get("access-control-allow-origin")).toBe("*");
  expect(((await meta.json()) as any).issuer).toBe(ORIGIN);
  const r: any = await prm(
    req("/.well-known/oauth-protected-resource/api/mcp"),
  ).json();
  expect(r.authorization_servers).toEqual([ORIGIN]);
  expect(r.resource).toBe(`${ORIGIN}/api/mcp`);
  // a forged Host header cannot move the issuer
  const forged = metadataResponse(
    new Request("https://evil.test/.well-known/oauth-authorization-server"),
  );
  expect(((await forged.json()) as { issuer: string }).issuer).toBe(ORIGIN);

  const reg = await handleRegister(
    req("/api/oauth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Test",
        redirect_uris: ["https://app.test/cb"],
      }),
    }),
    d.store,
  );
  expect(reg.status).toBe(201);
  const client = ((await reg.json()) as any).client_id;
  const verifier = randomBytes(48).toString("base64url"),
    challenge = createHash("sha256").update(verifier).digest("base64url");
  const q = new URLSearchParams({
    response_type: "code",
    client_id: client,
    redirect_uri: "https://app.test/cb",
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: "PASSPORT_READ",
    state: "s",
  });
  const ok = await handleAuthorize(req("/api/oauth/authorize?" + q), d.store);
  expect(ok.status).toBe(302);
  const loc = new URL(ok.headers.get("location")!);
  expect(loc.origin + loc.pathname).toBe(ORIGIN + "/oauth/consent");
  expect(loc.searchParams.get("client_id")).toBe(client);
  // bad redirect: an error response, never a redirect
  q.set("redirect_uri", "https://evil.test/cb");
  const bad = await handleAuthorize(req("/api/oauth/authorize?" + q), d.store);
  expect(bad.status).toBe(400);
  expect(bad.headers.get("location")).toBeNull();
  // decision: cross-origin and bearer callers are refused; preview works without a session
  const cross = await handleDecision(
    new Request(ORIGIN + "/api/oauth/decision", {
      method: "POST",
      headers: {
        origin: "https://evil.test",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    d.store,
  );
  expect(cross.status).toBe(400);
  const prev = await handleDecision(
    new Request(ORIGIN + "/api/oauth/decision", {
      method: "POST",
      headers: {
        origin: ORIGIN,
        host: "tastepolicy.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        params: Object.fromEntries(
          new URLSearchParams({
            response_type: "code",
            client_id: client,
            redirect_uri: "https://app.test/cb",
            code_challenge: challenge,
            code_challenge_method: "S256",
            scope: "PASSPORT_READ",
          }),
        ),
      }),
    }),
    d.store,
  );
  expect((await prev.json()) as any).toMatchObject({
    clientName: "Test",
    redirectHost: "app.test",
    scopes: ["PASSPORT_READ"],
  });
  // token endpoint: form encoding only, never cached
  const json = await handleToken(
    req("/api/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
    d.store,
  );
  expect(json.status).toBe(400);
  const form = await handleToken(
    req("/api/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body:
        "grant_type=authorization_code&client_id=" +
        client +
        "&code=nope&code_verifier=" +
        verifier +
        "&redirect_uri=https%3A%2F%2Fapp.test%2Fcb",
    }),
    d.store,
  );
  expect(form.status).toBe(400);
  expect(((await form.json()) as any).error).toBe("invalid_grant");
  expect(form.headers.get("cache-control")).toBe("no-store");
  expect(
    (
      await handleRevoke(
        req("/api/oauth/revoke", { method: "POST", body: "token=whatever" }),
        d.store,
      )
    ).status,
  ).toBe(200);
}, 60000);
