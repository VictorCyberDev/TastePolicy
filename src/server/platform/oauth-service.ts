import "server-only";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { StateStore, Repositories } from "@/server/state/repositories";
import { hash } from "@/server/state/hash";
import {
  KEY_SCOPES,
  type Credential,
  type Principal,
} from "@/lib/platform/types";
import { safeFetchText } from "@/lib/net/safe-fetch";
import type { OAuthClient } from "./oauth-repository";

// OAuth 2.1 authorization server for account linking (ADR 0022). Public
// clients only (PKCE S256 required), exact redirect matching, audience-bound
// short-lived access tokens, rotating refresh tokens with reuse detection.
export const ACCESS_TTL = 900;
export const REFRESH_TTL = 30 * 86400;
export const CODE_TTL = 120;
export const CONSENT_FRESH_MS = 10 * 60_000;
const MAX_CLIENTS = 5000;
// Names are self-asserted: no control or bidirectional-override characters.
function cleanName(raw: string, fallback: string) {
  const n = raw
    .replace(/[\p{C}\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu, "")
    .trim()
    .slice(0, 100);
  return n || fallback;
}
export const REFRESH_ABSOLUTE = 90 * 86400;
export class OAuthError extends Error {
  constructor(
    readonly error:
      | "invalid_request"
      | "invalid_client"
      | "invalid_grant"
      | "invalid_scope"
      | "invalid_target"
      | "unsupported_grant_type"
      | "unsupported_response_type"
      | "access_denied"
      | "server_error"
      | "login_required",
    readonly description = "",
    // Unsafe to redirect (bad client or redirect URI): show, never redirect.
    readonly direct = false,
  ) {
    super(error);
  }
}
const b64u = /^[A-Za-z0-9_-]+$/;
// CIMD's plural choices describe methods the client can use. The legacy
// singular field is a preference, not a requirement when choices are present.
// This server still accepts only public clients (none + mandatory PKCE).
function publicClientMethod(doc: Record<string, unknown>): boolean {
  const method = (v: unknown) =>
    typeof v === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(v);
  const preferred = doc.token_endpoint_auth_method;
  if (preferred !== undefined && !method(preferred)) return false;
  if (!("token_endpoint_auth_methods_supported" in doc))
    return preferred === undefined || preferred === "none";
  const choices = doc.token_endpoint_auth_methods_supported;
  return (
    Array.isArray(choices) &&
    choices.length > 0 &&
    choices.length <= 16 &&
    choices.every(method) &&
    choices.includes("none")
  );
}
const sha256b64u = (s: string) =>
  createHash("sha256").update(s).digest("base64url");
const loopback = (h: string) =>
  h === "localhost" || h === "127.0.0.1" || h === "[::1]";
// Loopback redirects (a native client on the person's own machine, RFC 8252) are
// a developer-mode feature: allowed on a localhost issuer, and on a hosted one
// only when the operator sets TASTEPOLICY_OAUTH_ALLOW_LOOPBACK=true.
export function loopbackAllowed(origin: string) {
  return (
    process.env.TASTEPOLICY_OAUTH_ALLOW_LOOPBACK === "true" ||
    new URL(origin).hostname === "localhost"
  );
}
export function validRedirect(u: string, allowLoopback = false): URL | null {
  try {
    const x = new URL(u);
    if (x.hash || x.username || x.password) return null;
    if (x.protocol === "https:") return x;
    if (allowLoopback && x.protocol === "http:" && loopback(x.hostname))
      return x;
    return null;
  } catch {
    return null;
  }
}
// Exact match; a loopback redirect may differ only in port (RFC 8252).
export function redirectMatches(
  registered: string[],
  given: string,
  allowLoopback = false,
) {
  const g = validRedirect(given, allowLoopback);
  if (!g) return false;
  return registered.some((r) => {
    if (r === given) return true;
    const x = validRedirect(r, allowLoopback);
    return (
      !!x &&
      loopback(x.hostname) &&
      x.protocol === g.protocol &&
      x.hostname === g.hostname &&
      x.pathname === g.pathname &&
      x.search === g.search
    );
  });
}
export interface AuthorizeRequest {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  resource: string;
  codeChallenge: string;
  state?: string;
}
export class OAuthService {
  constructor(
    private readonly store: StateStore,
    private readonly origin: string,
    private readonly clock = () => new Date().toISOString(),
    // Overridable in tests; production uses the SSRF-guarded fetcher.
    private readonly fetchDoc: (url: string) => Promise<string> = (u) =>
      safeFetchText(u, "application/json", { maxBytes: 8192 }),
    private readonly allowLoopback = loopbackAllowed(origin),
  ) {}
  get issuer() {
    return this.origin;
  }
  get resource() {
    return `${this.origin}/api/mcp`;
  }
  metadata() {
    return {
      issuer: this.origin,
      authorization_endpoint: `${this.origin}/api/oauth/authorize`,
      token_endpoint: `${this.origin}/api/oauth/token`,
      registration_endpoint: `${this.origin}/api/oauth/register`,
      revocation_endpoint: `${this.origin}/api/oauth/revoke`,
      scopes_supported: [...KEY_SCOPES],
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
      service_documentation: `${this.origin}/docs/integrations`,
    };
  }
  // ---- clients ----
  // Inside a transaction a client is only ever read. The outbound metadata fetch
  // happens in ensureClient, before any transaction, so a slow client host can
  // never hold a database connection or a row lock.
  async client(r: Repositories, id: string): Promise<OAuthClient> {
    if (id.length < 8 || id.length > 512)
      throw new OAuthError("invalid_client", "", true);
    const c = await r.oauth.client(id);
    if (!c) throw new OAuthError("invalid_client", "Unknown client.", true);
    return c;
  }
  async ensureClient(id: unknown): Promise<void> {
    if (typeof id !== "string" || id.length < 8 || id.length > 512) return;
    if (!/^https:\/\//.test(id)) return; // DCR clients are already stored
    const now = this.clock();
    const cached = await this.store.transaction((r) => r.oauth.client(id));
    if (cached && Date.parse(now) - Date.parse(cached.fetchedAt) < 3_600_000)
      return;
    // Client ID Metadata Document: the client_id is the URL of its metadata.
    let doc: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(await this.fetchDoc(id));
      doc = parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      doc = null;
    }
    if (!doc) {
      // A cached copy survives a short outage, never a long one.
      if (
        cached &&
        Date.parse(now) - Date.parse(cached.fetchedAt) < 7 * 86_400_000
      )
        return;
      throw new OAuthError(
        "invalid_client",
        "Client metadata unavailable.",
        true,
      );
    }
    const uris = doc.redirect_uris;
    let path = "";
    try {
      path = new URL(id).pathname;
    } catch {}
    if (
      doc.client_id !== id ||
      path.length < 2 ||
      !Array.isArray(uris) ||
      uris.length < 1 ||
      uris.length > 10 ||
      !uris.every(
        (u) => typeof u === "string" && validRedirect(u, this.allowLoopback),
      ) ||
      !publicClientMethod(doc) ||
      "client_secret" in doc
    )
      throw new OAuthError(
        "invalid_client",
        "Client metadata is not acceptable.",
        true,
      );
    const c: OAuthClient = {
      clientId: id,
      source: "CIMD",
      clientName: cleanName(
        typeof doc.client_name === "string" ? doc.client_name : "",
        new URL(id).hostname,
      ),
      redirectUris: uris as string[],
      fetchedAt: now,
    };
    await this.saveBounded(c);
  }
  // Clients nobody linked are pruned after a day, and the table is capped.
  private async saveBounded(c: OAuthClient) {
    await this.store.transaction(async (r) => {
      await r.oauth.pruneClients(
        new Date(Date.parse(this.clock()) - 86_400_000).toISOString(),
      );
      // Full: make room by dropping the oldest client nobody linked, so a flood
      // of registrations cannot lock real clients out. Only when every slot is
      // in use by a linked client does registration fail.
      if (
        (await r.oauth.clientCount()) >= MAX_CLIENTS &&
        !(await r.oauth.evictOldestUnlinked())
      )
        throw new OAuthError("server_error", "Too many clients.");
      await r.oauth.saveClient(c);
    });
  }
  // RFC 7591, public clients only.
  async register(raw: unknown) {
    const v = (raw ?? {}) as Record<string, unknown>;
    const uris = v.redirect_uris;
    if (
      !Array.isArray(uris) ||
      uris.length < 1 ||
      uris.length > 5 ||
      !uris.every(
        (u) => typeof u === "string" && validRedirect(u, this.allowLoopback),
      )
    )
      throw new OAuthError(
        "invalid_request",
        "redirect_uris must be https or loopback URLs.",
      );
    if (
      v.token_endpoint_auth_method !== undefined &&
      v.token_endpoint_auth_method !== "none"
    )
      throw new OAuthError(
        "invalid_request",
        "Only public clients (none) are supported.",
      );
    const name = cleanName(
      typeof v.client_name === "string" ? v.client_name : "",
      "Unnamed client",
    );
    const id = `tpc_${randomBytes(18).toString("base64url")}`;
    await this.saveBounded({
      clientId: id,
      source: "DCR",
      clientName: name,
      redirectUris: uris as string[],
      fetchedAt: this.clock(),
    });
    return {
      client_id: id,
      client_name: name,
      redirect_uris: uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    };
  }
  // ---- authorization ----
  parse(q: URLSearchParams): Record<string, string> {
    const o: Record<string, string> = {};
    for (const k of [
      "response_type",
      "client_id",
      "redirect_uri",
      "scope",
      "state",
      "code_challenge",
      "code_challenge_method",
      "resource",
    ]) {
      const all = q.getAll(k);
      if (all.length > 1)
        throw new OAuthError("invalid_request", `Duplicate ${k}.`, true);
      if (all[0] !== undefined) o[k] = all[0];
    }
    return o;
  }
  // Validates a request. Errors before the redirect URI is trusted are `direct`.
  async validate(
    r: Repositories,
    q: Record<string, string>,
  ): Promise<{ req: AuthorizeRequest; client: OAuthClient }> {
    if (!q.client_id)
      throw new OAuthError("invalid_request", "client_id is required.", true);
    const client = await this.client(r, q.client_id);
    if (
      !q.redirect_uri ||
      !redirectMatches(client.redirectUris, q.redirect_uri, this.allowLoopback)
    )
      throw new OAuthError(
        "invalid_request",
        "redirect_uri is not registered.",
        true,
      );
    if (q.response_type !== "code")
      throw new OAuthError("unsupported_response_type");
    if (
      q.code_challenge_method !== "S256" ||
      !q.code_challenge ||
      q.code_challenge.length !== 43 ||
      !b64u.test(q.code_challenge)
    )
      throw new OAuthError("invalid_request", "PKCE with S256 is required.");
    // Audience: the only protected resource is the MCP endpoint of this origin.
    if (
      q.resource !== undefined &&
      q.resource.replace(/\/$/, "") !== this.resource
    )
      throw new OAuthError("invalid_target", "Unknown resource.");
    const scopes = (q.scope ?? "PASSPORT_READ TASTE_EVALUATE")
      .split(" ")
      .filter(Boolean);
    if (
      !scopes.length ||
      new Set(scopes).size !== scopes.length ||
      !scopes.every((s) => (KEY_SCOPES as readonly string[]).includes(s))
    )
      throw new OAuthError("invalid_scope");
    if (q.state !== undefined && q.state.length > 512)
      throw new OAuthError("invalid_request", "state is too long.");
    return {
      client,
      req: {
        clientId: client.clientId,
        redirectUri: q.redirect_uri,
        scopes: [...scopes].sort(),
        resource: this.resource,
        codeChallenge: q.code_challenge,
        state: q.state,
      },
    };
  }
  async preview(q: Record<string, string>) {
    await this.ensureClient(q.client_id);
    return this.store.transaction(async (r) => {
      const { req, client } = await this.validate(r, q);
      return {
        clientName: client.clientName,
        clientSource: client.source,
        clientHost:
          client.source === "CIMD" ? new URL(client.clientId).host : null,
        redirectHost: new URL(req.redirectUri).host,
        scopes: req.scopes,
        expiresInDays: REFRESH_TTL / 86400,
      };
    });
  }
  // The signed-in owner decides. Returns the URL to send the browser to.
  async decide(p: Principal, q: Record<string, string>, approve: boolean) {
    if (p.kind !== "SESSION") throw new OAuthError("login_required", "", true);
    if (
      Date.parse(p.authenticatedAt) <
      Date.parse(this.clock()) - CONSENT_FRESH_MS
    )
      throw new OAuthError(
        "login_required",
        "Sign in again to continue.",
        true,
      );
    await this.ensureClient(q.client_id);
    return this.store.transaction(async (r) => {
      if (!(await r.platform.user(p.userId, true)))
        throw new OAuthError("login_required", "", true);
      const { req } = await this.validate(r, q);
      const back = new URL(req.redirectUri);
      if (req.state !== undefined) back.searchParams.set("state", req.state);
      back.searchParams.set("iss", this.origin);
      if (!approve) {
        back.searchParams.set("error", "access_denied");
        return back.toString();
      }
      const code = randomBytes(32).toString("base64url");
      await r.oauth.insertCode({
        codeHash: hash(code),
        userId: p.userId,
        clientId: req.clientId,
        redirectUri: req.redirectUri,
        codeChallenge: req.codeChallenge,
        scopes: req.scopes,
        resource: req.resource,
        expiresAt: new Date(
          Date.parse(this.clock()) + CODE_TTL * 1000,
        ).toISOString(),
      });
      back.searchParams.set("code", code);
      return back.toString();
    });
  }
  // ---- tokens ----
  private async issue(
    r: Repositories,
    f: {
      familyCreatedAt: string;
      familyId: string;
      userId: string;
      clientId: string;
      clientName: string;
      scopes: string[];
      resource: string;
    },
  ) {
    const now = this.clock();
    const id = randomUUID(),
      secret = randomBytes(32).toString("base64url"),
      raw = `tp_live_${id}.${secret}`;
    const expiresAt = new Date(
      Date.parse(now) + ACCESS_TTL * 1000,
    ).toISOString();
    const cred: Credential = {
      credentialId: id,
      userId: f.userId,
      displayLabel: `OAuth: ${f.clientName}`.slice(0, 80),
      scopes: f.scopes as Credential["scopes"],
      createdAt: now,
      expiresAt,
      oauth: {
        clientId: f.clientId,
        familyId: f.familyId,
        resource: f.resource,
      },
    };
    await r.platform.credential(cred, hash(raw));
    const refresh = randomBytes(32).toString("base64url");
    await r.oauth.insertRefresh(
      hash(refresh),
      f.familyId,
      new Date(
        Math.min(
          Date.parse(now) + REFRESH_TTL * 1000,
          Date.parse(f.familyCreatedAt) + REFRESH_ABSOLUTE * 1000,
        ),
      ).toISOString(),
    );
    return {
      access_token: raw,
      token_type: "Bearer",
      expires_in: ACCESS_TTL,
      refresh_token: refresh,
      scope: f.scopes.join(" "),
    };
  }
  async token(form: URLSearchParams) {
    const get = (k: string) => {
      const a = form.getAll(k);
      if (a.length > 1)
        throw new OAuthError("invalid_request", `Duplicate ${k}.`);
      return a[0];
    };
    const grant = get("grant_type"),
      clientId = get("client_id");
    if (!clientId)
      throw new OAuthError("invalid_client", "client_id is required.");
    if (form.has("client_secret") || form.has("client_assertion"))
      throw new OAuthError(
        "invalid_client",
        "Only public clients are supported.",
      );
    const resource = get("resource");
    if (resource !== undefined && resource.replace(/\/$/, "") !== this.resource)
      throw new OAuthError("invalid_target");
    const out = await this.store.transaction(async (r) => {
      const client = await r.oauth.client(clientId);
      if (!client) return new OAuthError("invalid_client");
      const now = this.clock();
      if (grant === "authorization_code") {
        const code = get("code"),
          verifier = get("code_verifier"),
          redirect = get("redirect_uri");
        if (!code || !verifier || !redirect)
          throw new OAuthError("invalid_request");
        if (
          verifier.length < 43 ||
          verifier.length > 128 ||
          !/^[A-Za-z0-9._~-]+$/.test(verifier)
        )
          return new OAuthError("invalid_grant");
        const row = await r.oauth.redeemCode(hash(code), now);
        if (!row) {
          // Replay of a used code ends everything it produced.
          const prior = await r.oauth.codeByHash(hash(code));
          if (prior?.familyId) await r.oauth.revokeFamily(prior.familyId, now);
          return new OAuthError("invalid_grant");
        }
        const a = Buffer.from(sha256b64u(verifier)),
          b = Buffer.from(row.codeChallenge);
        if (
          row.clientId !== clientId ||
          row.redirectUri !== redirect ||
          row.expiresAt <= now ||
          a.length !== b.length ||
          !timingSafeEqual(a, b)
        )
          return new OAuthError("invalid_grant");
        const familyId = randomUUID();
        await r.oauth.insertFamily({
          familyId,
          userId: row.userId,
          clientId,
          clientName: client.clientName,
          scopes: row.scopes,
          resource: row.resource,
          createdAt: now,
          revokedAt: null,
          lastUsedAt: null,
        });
        await r.oauth.attachFamily(row.codeHash, familyId);
        return this.issue(r, {
          familyCreatedAt: now,
          familyId,
          userId: row.userId,
          clientId,
          clientName: client.clientName,
          scopes: row.scopes,
          resource: row.resource,
        });
      }
      if (grant === "refresh_token") {
        const rt = get("refresh_token");
        if (!rt) throw new OAuthError("invalid_request");
        // Check the family before spending the token: a thief presenting it under
        // another client_id must not be able to burn the real client's token, and
        // the family row is locked so a concurrent disconnect cannot be missed.
        const famId = await r.oauth.refreshFamily(hash(rt));
        const fam = famId ? await r.oauth.family(famId, true) : null;
        if (fam && fam.clientId !== clientId)
          throw new OAuthError("invalid_grant");
        if (
          fam &&
          Date.parse(now) > Date.parse(fam.createdAt) + REFRESH_ABSOLUTE * 1000
        )
          return new OAuthError("invalid_grant");
        if (fam && !(await r.platform.user(fam.userId)))
          return new OAuthError("invalid_grant");
        const used = await r.oauth.useRefresh(hash(rt), now);
        if (used.state === "REUSED") {
          await r.oauth.revokeFamily(used.familyId, now);
          return new OAuthError("invalid_grant");
        }
        if (used.state !== "OK") return new OAuthError("invalid_grant");
        const f = await r.oauth.family(used.familyId);
        if (!f || f.revokedAt || f.clientId !== clientId)
          return new OAuthError("invalid_grant");
        let scopes = f.scopes;
        const asked = get("scope");
        if (asked) {
          const want = asked.split(" ").filter(Boolean);
          if (!want.every((s) => f.scopes.includes(s)))
            throw new OAuthError("invalid_scope"); // rolls back: the refresh token is not spent
          scopes = want.sort();
        }
        await r.oauth.touchFamily(f.familyId, now);
        return this.issue(r, {
          familyCreatedAt: f.createdAt,
          familyId: f.familyId,
          userId: f.userId,
          clientId,
          clientName: f.clientName,
          scopes,
          resource: f.resource,
        });
      }
      return new OAuthError("unsupported_grant_type");
    });
    // Failures after a state change (a burned code, a revoked family) must
    // commit, so the error is raised only once the transaction is done.
    if (out instanceof OAuthError) throw out;
    return out;
  }
  // RFC 7009: unknown tokens are not an error.
  async revoke(token: string) {
    await this.store.transaction(async (r) => {
      const now = this.clock();
      const m =
        /^tp_live_([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\./.exec(
          token,
        );
      if (m) {
        const c = await r.platform.findCredential(m[1], hash(token));
        if (c?.oauth) await r.platform.revokeCredential(c, now);
        return;
      }
      const used = await r.oauth.useRefresh(hash(token), now);
      if ("familyId" in used) await r.oauth.revokeFamily(used.familyId, now);
    });
  }
  // ---- owner view ----
  async connected(p: Principal) {
    return this.store.transaction(async (r) => {
      if (p.kind !== "SESSION")
        throw new OAuthError("login_required", "", true);
      if (!(await r.platform.user(p.userId)))
        throw new OAuthError("login_required", "", true);
      return (await r.oauth.families(p.userId)).map((f) => ({
        familyId: f.familyId,
        clientName: f.clientName,
        scopes: f.scopes,
        connectedAt: f.createdAt,
        lastUsedAt: f.lastUsedAt,
        active: !f.revokedAt,
      }));
    });
  }
  async disconnect(p: Principal, familyId: string) {
    return this.store.transaction(async (r) => {
      if (p.kind !== "SESSION")
        throw new OAuthError("login_required", "", true);
      const f = await r.oauth.family(familyId);
      if (!f || f.userId !== p.userId)
        throw new OAuthError("invalid_request", "", true);
      await r.oauth.revokeFamily(familyId, this.clock());
      return { familyId, active: false };
    });
  }
}
