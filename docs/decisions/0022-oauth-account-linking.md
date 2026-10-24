# ADR 0022 — OAuth account linking for hosted connectors (M6 repair R4)

Status: accepted. Supersedes the "no authorization server" position in ADR 0014. Developer credentials are unchanged and additive.

## Sources (primary, read 2026-10-23)

MCP authorization (2025-11-25 and 2026-07-28): RFC 9728 protected-resource metadata, RFC 8414 server metadata, OAuth 2.1 with mandatory PKCE S256, RFC 8707 `resource`, Client ID Metadata Documents (preferred) with DCR as fallback, exact redirect matching, RFC 9207 `iss`. OpenAI Apps/plugins auth guide: CIMD preferred, PKCE S256, redirect `https://chatgpt.com/connector_platform_oauth_redirect`, `resource` on both requests, no static bearer in the ChatGPT UI. Claude connector builder docs: 401 + PRM, CIMD only if the server advertises it, `https://claude.ai/api/mcp/auth_callback`, loopback for Claude Code, form-encoded token endpoint. Google: Gemini Enterprise A2A registration needs A2A 0.3 and end-user OAuth (not supported, see below).

## Decision

TastePolicy is its own minimal OAuth 2.1 authorization server for **public clients** (`token_endpoint_auth_method: none`). It is only offered on a pinned HTTPS origin (`TASTEPOLICY_PUBLIC_ORIGIN`); otherwise every endpoint answers 404 and the protected-resource metadata advertises no authorization server.

- Endpoints: `/.well-known/oauth-authorization-server`, `/api/oauth/authorize` (validates, redirects to the consent page), `/oauth/consent` + `/api/oauth/decision`, `/api/oauth/token`, `/api/oauth/register` (RFC 7591, public clients), `/api/oauth/revoke` (RFC 7009).
- Clients: CIMD (client_id is an https URL; the document must name that URL, use https or loopback redirects, no secrets; fetched with the SSRF-guarded fetcher, 8 KB, cached 1 h) or DCR. Redirect URIs match exactly (loopback may vary the port).
- Authorization: PKCE S256 required, single-use codes (2 min), `resource` must be the MCP endpoint of this origin, scopes are the existing `PASSPORT_READ`, `TASTE_EVALUATE`, `RECEIPT_READ`. Errors about the client or redirect never redirect. Responses carry `iss`.
- Consent: the signed-in owner, with a sign-in no older than 10 minutes, sees who is asking, what it can and cannot do, and for how long, and can deny. The consent decision endpoint accepts same-origin session requests only.
- Tokens: opaque, stored hashed. Access tokens are 15-minute `developer_credentials` rows (so every existing check — revocation, expiry, scope, rate — applies) marked with `data.oauth`; they are audience bound to the MCP surface (REST and A2A refuse them). Refresh tokens rotate; presenting a spent refresh token, or replaying a code, revokes the whole link. Token→principal mapping is server-side only; a token never carries identity the server does not look up.
- Owner control: "Connected assistants" lists links and disconnects one (ends access tokens at once); account deletion cascades.
- The token acts as the person on **their own** Passport. It carries no grant to anyone else's.

## Vendor status (honest)

| Surface                       | Status                                                                                                                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ChatGPT custom MCP / plugin   | Protocol-compatible by construction and tested with our own OAuth client; **no live ChatGPT run** (needs a ChatGPT account, a public HTTPS deployment and human consent).                                             |
| claude.ai custom connector    | Same: protocol tests only; no live run. Claude Code supports bearer or OAuth.                                                                                                                                         |
| OpenAI Responses `type:"mcp"` | Pass a developer credential or an OAuth access token as `authorization`; model-driven run needs credentials not present here.                                                                                         |
| Gemini / ADK                  | Use developer credential headers on MCP. Gemini Enterprise A2A registration needs A2A 0.3 + end-user OAuth: **not supported**, documented; the other Google routes are ADK `McpToolset`/`RemoteA2aAgent` with bearer. |

## Not done / limits

No dynamic scope step-up; no JWT access tokens (opaque by design); the OAuth endpoints use a per-process limiter until the distributed limiter lands; the consent page's "sign in again" round trip uses `/account?next=`.

## Security review (independent, read-only) and outcome

No blocking finding. Fixed: client metadata is fetched before any database transaction (a slow client host cannot hold a connection or a row lock); client rows are capped (5000) and unlinked clients pruned after a day; shared database-backed admission counters on all unauthenticated OAuth endpoints (keyed by HMAC of the caller; the caller identity is taken only from platform-set headers); consent shows that the name is self-asserted, where a metadata-described client says it lives, and the redirect host; control and bidirectional characters are stripped from names; expired/revoked tokens on MCP answer 401 with `error="invalid_token"` and the resource metadata so clients refresh; request bodies are read with a hard cap; a refresh token presented under another client is not spent, the family row is locked, and the family has a 90-day absolute lifetime; CIMD documents need a path, `null` documents are refused, cached metadata is trusted for at most 7 days when the host is down; malformed token ids are a no-op on revocation.

Accepted and documented: parallel retries of one refresh token revoke the link (standard reuse detection); revoking an access token ends only that token; authorize errors about scope/PKCE are returned as JSON rather than redirected; credential rows from refreshes are not yet purged.
