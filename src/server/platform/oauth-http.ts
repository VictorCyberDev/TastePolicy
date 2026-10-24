import "server-only";
import { createHmac } from "node:crypto";
import { OAuthError, OAuthService } from "./oauth-service";
import { publicOrigin } from "./origin";
import { clientKey } from "./public-limit";
import { sessionPrincipal, trustedOrigin } from "./http";
import { readJsonBody } from "@/server/taste/read-body";
import type { StateStore } from "@/server/state/repositories";

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  "Content-Type": "application/json",
};
// The authorization server is only offered on a pinned HTTPS origin, so a
// forged Host header can never put an attacker URL into metadata or redirects.
export function oauthOrigin(request: Request): string | null {
  const pinned = process.env.TASTEPOLICY_PUBLIC_ORIGIN;
  if (!pinned) return null;
  const o = publicOrigin(request);
  return o === new URL(pinned).origin ? o : null;
}
export const status = (e: OAuthError) =>
  e.error === "login_required" || (e.error === "invalid_client" && !e.direct)
    ? 401
    : e.error === "server_error"
      ? 500
      : 400;
const notConfigured = () =>
  Response.json(
    { error: "not_configured" },
    { status: 404, headers: JSON_HEADERS },
  );
const err = (e: unknown, headers: Record<string, string> = {}) => {
  const o = e instanceof OAuthError ? e : new OAuthError("server_error");
  return new Response(
    JSON.stringify({
      error: o.error,
      ...(o.description ? { error_description: o.description } : {}),
    }),
    { status: status(o), headers: { ...JSON_HEADERS, ...headers } },
  );
};
// Two tiers: a cheap per-process pre-check, then a counter in the database that
// all instances share. The key is an HMAC of the caller, never an address.
const hits = new Map<string, { n: number; at: number }>();
export async function limited(
  request: Request,
  pool: string,
  max: number,
  store?: StateStore | null,
) {
  const ip = clientKey(request),
    k = `${pool}|${ip}`,
    now = Date.now();
  if (hits.size > 5000) hits.clear();
  const h = hits.get(k);
  if (!h || now - h.at > 60_000) hits.set(k, { n: 1, at: now });
  else if (++h.n > max * 2) return true;
  if (!store) return false;
  const secret = process.env.BETTER_AUTH_SECRET ?? "unconfigured";
  const keyHash = createHmac("sha256", secret).update(k).digest("hex");
  try {
    return !(await store.transaction((r) =>
      r.oauth.admit(keyHash, new Date(now).toISOString().slice(0, 16), max),
    ));
  } catch {
    // The shared tier failing must not open the endpoint: the local tier holds.
    return false;
  }
}
// Reads at most `max` bytes; a larger body is refused before it is buffered.
async function readCapped(request: Request, max: number) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > max)
    throw new OAuthError("invalid_request", "Body too large.");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new OAuthError("invalid_request", "Body too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function service(request: Request, store: StateStore | null) {
  const origin = oauthOrigin(request);
  if (!origin || !store) return null;
  return new OAuthService(store, origin);
}
export const metadataResponse = (request: Request) => {
  const origin = oauthOrigin(request);
  if (!origin)
    return Response.json({ error: "not_configured" }, { status: 404 });
  return Response.json(new OAuthService(null as never, origin).metadata(), {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
export async function handleAuthorize(
  request: Request,
  store: StateStore | null,
) {
  const svc = service(request, store);
  if (!svc || (await limited(request, "authorize", 60, store)))
    return new Response("Authorization is not available.", { status: 404 });
  try {
    const q = svc.parse(new URL(request.url).searchParams);
    await svc.preview(q); // validates everything, including the client
    const to = new URL("/oauth/consent", svc.issuer);
    for (const [k, v] of Object.entries(q)) to.searchParams.set(k, v);
    return new Response(null, {
      status: 302,
      headers: { Location: to.toString(), "Cache-Control": "no-store" },
    });
  } catch (e) {
    // Never redirect on an error about the client or redirect URI.
    return err(e);
  }
}
export async function handleDecision(
  request: Request,
  store: StateStore | null,
) {
  const svc = service(request, store);
  if (!svc) return notConfigured();
  if (!trustedOrigin(request) || request.headers.get("authorization"))
    return err(new OAuthError("access_denied", "", true));
  if (await limited(request, "decision", 30, store))
    return err(new OAuthError("access_denied", "Slow down.", true));
  try {
    const body = (await readJsonBody(request)) as {
      params?: Record<string, string>;
      approve?: boolean;
    };
    const q: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.params ?? {}))
      if (typeof v === "string") q[k] = v;
    if (body.approve === undefined)
      return Response.json(await svc.preview(q), { headers: JSON_HEADERS });
    const p = await sessionPrincipal(request).catch(() => {
      throw new OAuthError("login_required", "", true);
    });
    const redirectTo = await svc.decide(p, q, body.approve === true);
    return Response.json({ redirectTo }, { headers: JSON_HEADERS });
  } catch (e) {
    return err(e);
  }
}
export async function handleToken(request: Request, store: StateStore | null) {
  const svc = service(request, store);
  if (!svc) return notConfigured();
  if (await limited(request, "token", 120, store))
    return err(new OAuthError("invalid_request", "Slow down."));
  try {
    if (
      request.headers.get("content-type")?.split(";")[0].trim() !==
      "application/x-www-form-urlencoded"
    )
      throw new OAuthError(
        "invalid_request",
        "Use application/x-www-form-urlencoded.",
      );
    const text = await readCapped(request, 8192);
    return new Response(
      JSON.stringify(await svc.token(new URLSearchParams(text))),
      {
        headers: JSON_HEADERS,
      },
    );
  } catch (e) {
    return err(e);
  }
}
export async function handleRegister(
  request: Request,
  store: StateStore | null,
) {
  const svc = service(request, store);
  if (!svc) return notConfigured();
  if (await limited(request, "register", 10, store))
    return err(new OAuthError("invalid_request", "Slow down."));
  try {
    const out = await svc.register(await readJsonBody(request));
    return new Response(JSON.stringify(out), {
      status: 201,
      headers: JSON_HEADERS,
    });
  } catch (e) {
    return err(e);
  }
}
export async function handleRevoke(request: Request, store: StateStore | null) {
  const svc = service(request, store);
  if (!svc) return notConfigured();
  if (await limited(request, "revoke", 60, store))
    return err(new OAuthError("invalid_request", "Slow down."));
  try {
    const text = await readCapped(request, 4096);
    const token = new URLSearchParams(text).get("token");
    if (token) await svc.revoke(token);
    return new Response(null, { status: 200, headers: JSON_HEADERS });
  } catch (e) {
    return err(e);
  }
}
