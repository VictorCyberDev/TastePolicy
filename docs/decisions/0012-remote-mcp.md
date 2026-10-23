# ADR 0012 — Remote MCP (Streamable HTTP)

Status: accepted for M6G. Recorded before implementation. Evidence: primary-source research of 2026-10-23.

## Protocol and version

| Item                   | Value                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Protocol               | Model Context Protocol, Streamable HTTP transport                                                                             |
| Current specification  | **2026-07-28**, published 2026-07-28 — https://modelcontextprotocol.io/specification/2026-07-28 (versioning: https://modelcontextprotocol.io/specification/versioning) |
| Also served (legacy)   | 2025-11-25 and 2025-06-18 (`initialize` era), stateless                                                                         |
| Authorization profile  | MCP authorization, OAuth 2.1 profile; RFC 9728, RFC 8414, RFC 8707, RFC 9207, RFC 7591 (deprecated), Client ID Metadata Documents |
| Reference SDK          | `@modelcontextprotocol/server` **2.4.0**, Apache-2.0, depends on `zod ^4.2.0` and `@modelcontextprotocol/core` 2.4.0, Node >= 20 |

The 2026-07-28 revision is stateless (no `initialize`, no `Mcp-Session-Id`, no GET stream, no resumability) and mandates `server/discover`. Vendor documentation still links 2025-era auth specifications, and the wire version sent by ChatGPT, Claude and Gemini is **not published**. The server therefore serves both eras on one endpoint.

## Decision

- Use the official SDK v2 handler (`createMcpHandler`, web `Request` → `Response`) rather than hand-rolling dual-era negotiation. The SDK adds one package and no Express/Hono dependency for our route. `mcp-handler` (Vercel) is not adopted: it is a thin wrapper over the same SDK and one more dependency to audit.
- Single route `POST /api/mcp`. Responses are `application/json`, never SSE. `GET` and `DELETE` return 405. No session identifiers are issued; any `Mcp-Session-Id` or `Last-Event-ID` is ignored.
- Five semantic tools: `tastepolicy_capabilities`, `tastepolicy_get_authority`, `tastepolicy_evaluate_choice`, `tastepolicy_get_receipt`, `tastepolicy_get_status`. Tool definitions come from the one shared contract that also drives REST, the SDK, OpenAPI and A2A. Every tool calls the existing `PlatformService` operations; there is no second evaluator.
- Tool annotations are set explicitly (the defaults are unsafe): reads use `readOnlyHint:true, openWorldHint:false`; `tastepolicy_evaluate_choice` is `readOnlyHint:false, destructiveHint:false, idempotentHint:true` (idempotency-keyed), `openWorldHint:false`. Results carry `structuredContent` plus the same JSON in a text block and declare `outputSchema`.
- Domain results are never errors: ALLOW, ASK, REJECT and UNAVAILABLE are normal results. Validation and access failures use `isError:true` with a stable code; protocol faults use JSON-RPC errors.
- `tools/list` returns `ttlMs` and `cacheScope:"private"` (the set can differ per credential scope).

## Authentication

- A bearer developer credential (existing opaque, hashed, scoped, expiring keys) is accepted on `Authorization: Bearer` only; never in the URL. Wrong or missing credential → 401 with `WWW-Authenticate: Bearer resource_metadata="…"`. Insufficient scope → 403 `insufficient_scope` naming the scope.
- Protected Resource Metadata is served at `/.well-known/oauth-protected-resource/api/mcp` (RFC 9728) so spec-compliant clients can discover the authorization server. The authorization server and its consent flow are specified in ADR 0014.
- A TastePolicy credential is valid only for this resource. Tokens are never passed through to any upstream service.

## Features used / not used

Used: single-endpoint POST, JSON responses, `server/discover`, `tools/list`, `tools/call`, `ping`, legacy `initialize` + `notifications/initialized` (stateless), `structuredContent`, `outputSchema`, tool annotations, RFC 9728 metadata, Origin validation.

Deliberately not used: SSE response streams, `subscriptions/listen`, sessions, GET stream, resumability, resources, prompts, sampling, elicitation, roots, logging, the tasks extension, the deprecated HTTP+SSE transport, dynamic client registration as a primary route.

## Security implications

- The SDK handler does **not** validate `Origin` or `Host`. The route rejects a present, non-allowlisted `Origin` with 403 (DNS-rebinding defence, a spec MUST) before calling the SDK.
- Tool descriptions are static and contain no user data. Receipt content is returned as structured fields, not free text, to limit prompt-injection surface.
- Rate limits, body limits and the existing provider budget apply to MCP exactly as to REST; calls are attributed to the credential's account.
- The SDK changes quickly (four minors in three months). The version is pinned and covered by lockfile, audit and conformance tests.

## Compatibility requirements

A dual-era conformance test posts a modern `server/discover` request and a legacy `initialize` request and asserts semantically identical tool behaviour. Header/body mismatch must yield -32020 and an unsupported version -32022. The official `@modelcontextprotocol/conformance` suite is run where its scenarios apply; its modern-era coverage is not claimed.
