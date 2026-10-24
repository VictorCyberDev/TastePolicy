// Black-box acceptance against a running deployment (a preview, or `next start`).
// Usage: BASE_URL=https://… node scripts/acceptance/hosted-acceptance.mjs
// It creates two throwaway accounts, never prints a secret, and records every
// step as PASS / FAIL / SKIP with the reason. A step that needs something the
// deployment lacks (for example a Qloo key) is SKIP, never a fake PASS.
import { createHash, randomBytes } from "node:crypto";

const B = (process.env.BASE_URL ?? "").replace(/\/$/, "");
if (!B) throw Error("BASE_URL is required");
const rows = [];
const rec = (area, step, state, note = "") => {
  rows.push({ area, step, state, note });
  console.log(
    `${state.padEnd(4)} ${area} · ${step}${note ? ` — ${note}` : ""}`,
  );
};
const check = async (area, step, fn) => {
  try {
    const r = await fn();
    if (r === "SKIP") return;
    rec(area, step, "PASS", typeof r === "string" ? r : "");
  } catch (e) {
    rec(area, step, "FAIL", e instanceof Error ? e.message : String(e));
  }
};
const ok = (c, m) => {
  if (!c) throw Error(m);
};
const J = { "content-type": "application/json", origin: B };
const jf = async (path, init = {}) => {
  const r = await fetch(B + path, { redirect: "manual", ...init });
  let body = null;
  try {
    body = await r.clone().json();
  } catch {}
  return { r, body };
};
async function account(tag) {
  const email = `acc-${tag}-${randomBytes(4).toString("hex")}@example.test`,
    password = randomBytes(18).toString("base64url");
  await fetch(B + "/api/auth/sign-up/email", {
    method: "POST",
    headers: J,
    body: JSON.stringify({ name: "Acceptance", email, password }),
  });
  const si = await fetch(B + "/api/auth/sign-in/email", {
    method: "POST",
    headers: J,
    body: JSON.stringify({ email, password }),
  });
  ok(si.status === 200, `sign-in ${si.status}`);
  return si.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
const acct = (cookie, op, body = {}) =>
  jf(`/api/account/${op}`, {
    method: "POST",
    headers: { ...J, cookie },
    body: JSON.stringify(body),
  });

let ready;
await check("platform", "GET /api/ready reports honestly", async () => {
  const { r, body } = await jf("/api/ready");
  ready = body;
  ok(body?.checks, "no checks");
  return (
    `status ${r.status} ${body.status}; ` +
    Object.entries(body.checks)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ")
  );
});
const persisted =
  ready?.checks?.database === "up" && ready?.checks?.authentication === "up";
for (const [path, key] of [
  ["/.well-known/agent-card.json", "name"],
  ["/.well-known/oauth-protected-resource/api/mcp", "resource"],
  ["/api/v1/openapi", "paths"],
])
  await check("discovery", path, async () => {
    const { r, body } = await jf(path);
    ok(r.status === 200 && body?.[key] !== undefined, `status ${r.status}`);
  });
await check(
  "mcp",
  "unauthenticated request is 401 with a challenge",
  async () => {
    const { r } = await jf("/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: "{}",
    });
    ok(
      r.status === 401 &&
        /resource_metadata/.test(r.headers.get("www-authenticate") ?? ""),
      `status ${r.status}`,
    );
  },
);
if (!persisted) {
  rec(
    "accounts",
    "persistence, auth, Passport, grants, keys, OAuth, isolation, revocation, restart",
    "SKIP",
    "deployment has no database/auth configuration (DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL)",
  );
} else {
  const a = await account("a"),
    b = await account("b");
  let secret = "";
  await check(
    "keys",
    "developer credential is issued once and works on REST and MCP",
    async () => {
      const exp = new Date(Date.now() + 3 * 86400000).toISOString();
      const { body } = await acct(a, "create-key", {
        idempotencyKey: randomBytes(9).toString("hex"),
        displayLabel: "acceptance",
        scopes: ["PASSPORT_READ", "TASTE_EVALUATE", "RECEIPT_READ"],
        expiresAt: exp,
      });
      secret = body?.data?.secret;
      ok(secret, "no secret");
      const cap = await jf("/api/v1/capabilities", {
        headers: { authorization: `Bearer ${secret}` },
      });
      ok(cap.r.status === 200, `REST ${cap.r.status}`);
      const mcp = await jf("/api/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${secret}`,
          "mcp-protocol-version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "acc", version: "1" },
          },
        }),
      });
      ok(mcp.r.status === 200, `MCP ${mcp.r.status}`);
    },
  );
  await check(
    "passport",
    "Passport creation needs the cultural provider",
    async () => {
      if (ready.checks.cultural_provider !== "configured") {
        rec(
          "passport",
          "creation, evaluation, leases, proofs (end-to-end story)",
          "SKIP",
          "QLOO_API_KEY not configured: resolving the five anchors would need the real provider",
        );
        return "SKIP";
      }
      return "provider configured; run the Win Gate live acceptance for the full story";
    },
  );
  const origin = ready.checks.oauth === "up";
  if (!origin)
    rec(
      "oauth",
      "account linking",
      "SKIP",
      "TASTEPOLICY_PUBLIC_ORIGIN (https) is not configured, so no authorization server is offered",
    );
  else {
    await check(
      "oauth",
      "full flow: DCR → authorize → consent → PKCE token → MCP → refresh rotation → reuse detection → isolation",
      async () => {
        const prm = (await jf("/.well-known/oauth-protected-resource/api/mcp"))
          .body;
        ok(
          prm.authorization_servers?.length,
          "PRM names no authorization server",
        );
        const as = (await jf("/.well-known/oauth-authorization-server")).body;
        ok(as.code_challenge_methods_supported?.includes("S256"), "no S256");
        const redirect = "http://127.0.0.1:9/cb";
        const reg = (
          await jf("/api/oauth/register", {
            method: "POST",
            headers: J,
            body: JSON.stringify({
              client_name: "Acceptance",
              redirect_uris: [redirect],
            }),
          })
        ).body;
        const v = randomBytes(48).toString("base64url"),
          ch = createHash("sha256").update(v).digest("base64url");
        const q = {
          response_type: "code",
          client_id: reg.client_id,
          redirect_uri: redirect,
          scope: "PASSPORT_READ TASTE_EVALUATE",
          state: "s",
          code_challenge: ch,
          code_challenge_method: "S256",
          resource: prm.resource,
        };
        const authz = await fetch(
          as.authorization_endpoint + "?" + new URLSearchParams(q),
          { redirect: "manual" },
        );
        ok(authz.status === 302, `authorize ${authz.status}`);
        const noSession = await jf("/api/oauth/decision", {
          method: "POST",
          headers: J,
          body: JSON.stringify({ params: q, approve: true }),
        });
        ok(
          noSession.r.status === 401,
          `decision without session ${noSession.r.status}`,
        );
        const dec = (
          await jf("/api/oauth/decision", {
            method: "POST",
            headers: { ...J, cookie: a },
            body: JSON.stringify({ params: q, approve: true }),
          })
        ).body;
        const back = new URL(dec.redirectTo);
        ok(
          back.searchParams.get("iss") === as.issuer &&
            back.searchParams.get("state") === "s",
          "iss/state",
        );
        const form = (o) => new URLSearchParams(o);
        const tok = await (
          await fetch(as.token_endpoint, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: form({
              grant_type: "authorization_code",
              code: back.searchParams.get("code"),
              client_id: reg.client_id,
              redirect_uri: redirect,
              code_verifier: v,
              resource: prm.resource,
            }),
          })
        ).json();
        ok(tok.access_token && tok.refresh_token, "no tokens");
        const mcp = (t) =>
          jf("/api/mcp", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "application/json, text/event-stream",
              authorization: `Bearer ${t}`,
              "mcp-protocol-version": "2025-06-18",
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "initialize",
              params: {
                protocolVersion: "2025-06-18",
                capabilities: {},
                clientInfo: { name: "acc", version: "1" },
              },
            }),
          });
        ok(
          (await mcp(tok.access_token)).r.status === 200,
          "MCP with OAuth token",
        );
        ok(
          (
            await jf("/api/v1/capabilities", {
              headers: { authorization: `Bearer ${tok.access_token}` },
            })
          ).r.status === 403,
          "REST must refuse an OAuth token",
        );
        const agentsB = (await acct(b, "connected-agents")).body.data;
        ok(
          Array.isArray(agentsB) && agentsB.length === 0,
          "account B sees A's link",
        );
        const rt = await (
          await fetch(as.token_endpoint, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: form({
              grant_type: "refresh_token",
              refresh_token: tok.refresh_token,
              client_id: reg.client_id,
            }),
          })
        ).json();
        ok(
          rt.refresh_token && rt.refresh_token !== tok.refresh_token,
          "refresh did not rotate",
        );
        const reuse = await fetch(as.token_endpoint, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: form({
            grant_type: "refresh_token",
            refresh_token: tok.refresh_token,
            client_id: reg.client_id,
          }),
        });
        ok(reuse.status === 400, "reuse not rejected");
        ok(
          (await mcp(rt.access_token)).r.status === 403,
          "link not revoked after reuse",
        );
        const list = (await acct(a, "connected-agents")).body.data;
        ok(
          list.some((x) => x.clientName === "Acceptance" && x.active === false),
          "owner does not see the revoked link",
        );
      },
    );
  }
  await check(
    "keys",
    "revoking the developer credential ends access at once",
    async () => {
      const list = (await acct(a, "inspect")).body.data.credentials;
      ok(list.length > 0, "no credential listed");
      await acct(a, "revoke-key", {
        idempotencyKey: randomBytes(9).toString("hex"),
        credentialId: list[0].credentialId,
      });
      const cap = await jf("/api/v1/capabilities", {
        headers: { authorization: `Bearer ${secret}` },
      });
      ok(
        cap.r.status === 403 || cap.r.status === 401,
        `after revoke ${cap.r.status}`,
      );
    },
  );
  const att = await jf("/.well-known/tastepolicy-issuer");
  if (att.r.status === 200)
    await check(
      "attestation",
      "issuer metadata and hosted verifier answer",
      async () => {
        ok(att.body.trust?.discoveryGrantsTrust === false, "metadata");
        const v = await jf("/api/attest/verify", {
          method: "POST",
          headers: J,
          body: JSON.stringify({
            presentation: "x",
            audience: "https://a.test",
            dryRun: true,
          }),
        });
        ok(v.r.status === 200, `verify ${v.r.status}`);
      },
    );
  else
    rec(
      "attestation",
      "issuer metadata",
      "SKIP",
      "TASTEPOLICY_ATTESTATION_KEY not configured",
    );
}
const n = (s) => rows.filter((r) => r.state === s).length;
console.log(
  `\n${n("PASS")} passed, ${n("FAIL")} failed, ${n("SKIP")} skipped (skips are things this deployment cannot prove, not passes)`,
);
process.exit(n("FAIL") ? 1 : 0);
