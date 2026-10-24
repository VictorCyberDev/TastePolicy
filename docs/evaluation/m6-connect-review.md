# M6 CONNECT — interoperability review

Scope: remote MCP, A2A 1.0, shared contract, typed errors, OpenAPI, sandbox, vendor routes. Built on the reconciled M6 foundation (Win Gate head f7fbbc0 merged).

## What exists

| Surface    | Route                                                                        | Notes                                                                                             |
| ---------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| REST       | `/api/v1/{capabilities,passport,evaluate,receipt,status}`, `/api/v1/openapi` | OpenAPI generated from the shared contract                                                        |
| Remote MCP | `POST /api/mcp`                                                              | SDK `@modelcontextprotocol/server` 2.4.0; 2026-07-28 and 2025-era clients, stateless, JSON        |
| A2A        | `/.well-known/agent-card.json`, `POST /api/a2a`                              | 1.0 JSON-RPC, hand-rolled (ADR 0013)                                                              |
| Discovery  | `/.well-known/oauth-protected-resource/api/mcp`                              | RFC 9728; no authorization server advertised                                                      |
| SDK        | `src/sdk`                                                                    | typed `TastePolicyError`, injectable fetch, `capabilities()`                                      |
| Sandbox    | `src/sdk/sandbox`                                                            | offline deterministic ALLOW/ASK/REJECT/UNAVAILABLE, grant/version/idempotency/credential failures |

One evaluator: every door calls `PlatformService`. `tests/conformance.test.ts` evaluates the same proposal through service, REST, SDK, MCP and A2A and asserts identical decision, basis, state hash, subject reference, continuation and schema version.

## Evidence

- Local `npm run verify` (format, lint, strict types, 636 unit tests, production build) passed at the pre-fix head; focused suites re-run after review fixes.
- MCP is exercised with the **official** `@modelcontextprotocol/client` in both eras (`getProtocolEra()` asserted `modern` and `legacy`). A2A is exercised with the **official** `@a2a-js/sdk` client (card resolution plus `sendMessage`).
- Independent security review of the new surfaces found one blocking and three should-fix items; all four were fixed (below).

### Security review outcomes

| Finding                                                          | Resolution                                                                  |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Shared budget consumed before auth (anonymous exhaustion)        | admission now happens after authentication; tested                          |
| JSON-RPC batch multiplied work under one rate token              | batches rejected (400); tested                                              |
| MCP body read had no deadline                                    | bodies pre-read with the 3 s / 16 KiB platform reader                       |
| Discovery origin derived from Host                               | `TASTEPOLICY_PUBLIC_ORIGIN` pins it; unset falls back to the request origin |
| Unknown error codes map to 403                                   | retained for REST backward compatibility; noted                             |
| Receipt lookup distinguishes missing vs foreign refs on REST/MCP | refs are 192-bit random; not practically exploitable; A2A already masks     |

## Not done, with reason

- **OAuth authorization server for hosted connectors** (ChatGPT, claude.ai directory, Gemini Enterprise). Needs a Better Auth bump to 1.7.12, an OAuth provider, consent UI, new tables and token-to-principal mapping. It is a separate security component; ADR 0014 records the decision. These connector routes are therefore **unsupported**, not partially supported.
- **Gemini Enterprise** requires A2A 0.3; we serve 1.0.
- **Hosted persistence and auth proof**: the Vercel project has Neon `DATABASE_URL` only for the Win Gate branch. Proving M6 hosted would need new branch-scoped secrets, which means a connection string would pass through this session. Not done. `M6_LIVE_AUTH_ENVIRONMENT_BLOCKED` and `M6_REMOTE_PERSISTENCE_ENVIRONMENT_BLOCKED` stand. Deployed liveness and unauthenticated behaviour of the new routes are checked separately.
- **Vendor live runs** (OpenAI, Anthropic, Gemini model-driven, ChatGPT/claude.ai UI): no vendor credentials or UI access. Configuration shapes come from vendor docs and are in `examples/integrations`; they are not executed.
- Official MCP conformance package and `a2a-tck`/`a2a-cli` were not run; the official clients above are the compatibility evidence.
- Rate budget: each authenticated request spends one per-account token (30/min), including MCP discovery and listing.
