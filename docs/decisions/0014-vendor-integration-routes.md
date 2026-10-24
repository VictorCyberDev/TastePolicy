# ADR 0014 — Vendor integration routes and hosted-connector OAuth

Status: accepted (M6). Researched 2026-10-23 from vendor primary documentation. Items not confirmed from a primary page are marked UNVERIFIED and are never claimed as supported.

## Decision

TastePolicy exposes one authority through four wire surfaces (REST `/api/v1`, remote MCP `/api/mcp`, A2A `/api/a2a`, SDK) and documents the following vendor routes. Each route states what automation can prove.

| Route                                                                          | Wire                | Auth                                    | Automated proof                                                                              |
| ------------------------------------------------------------------------------ | ------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| OpenAI Responses `tools:[{type:"mcp",server_url,authorization,allowed_tools}]` | MCP Streamable HTTP | bearer passed in `authorization`        | Server-side only: official MCP client against `/api/mcp` (no OpenAI key available)           |
| OpenAI function calling                                                        | REST `/api/v1/*`    | developer credential in app code        | OpenAPI + JSON-schema validity                                                               |
| ChatGPT custom MCP / plugin                                                    | MCP                 | OAuth only (bearer headers unsupported) | Not verifiable; human step                                                                   |
| Claude Code `claude mcp add --transport http` / `.mcp.json`                    | MCP                 | bearer header or OAuth                  | Config shape validated; live add is a human step                                             |
| Claude Agent SDK `mcpServers:{type:"http",headers}`                            | MCP                 | bearer header                           | Same MCP client conformance                                                                  |
| Claude Messages MCP connector (beta `mcp-client-2025-11-20`)                   | MCP                 | `authorization_token`                   | Not verifiable without an Anthropic key                                                      |
| claude.ai custom connectors                                                    | MCP                 | OAuth or request headers                | Not verifiable; human step                                                                   |
| Gemini Interactions `{type:"mcp_server",name,url,headers}`                     | MCP                 | headers                                 | Not verifiable without a key; Gemini 3 remote-MCP support contradictory in docs (UNVERIFIED) |
| Gemini CLI / Antigravity CLI                                                   | MCP                 | headers / OAuth                         | Config shape only (Antigravity shape UNVERIFIED)                                             |
| Google ADK `McpToolset` / `RemoteA2aAgent`                                     | MCP / A2A           | headers                                 | Plumbing equivalent covered by the official MCP and A2A client tests                         |
| Gemini Enterprise A2A registration                                             | A2A v0.3            | end-user OAuth only                     | Not supported: we implement A2A 1.0 (ADR 0013); gap documented, not claimed                  |

## OAuth for hosted connectors

ChatGPT and claude.ai connectors require an MCP-spec OAuth 2.1 flow. Bearer developer credentials remain the primary route for API-level integrations (OpenAI `authorization`, Anthropic `authorization_token`, Claude Code/Agent SDK/ADK headers). The protected-resource metadata is served at `/.well-known/oauth-protected-resource/api/mcp` (RFC 9728) and names the authorization server.

An authorization server is a separate, security-critical component. Decision: use Better Auth's OAuth provider plugin only after the core surfaces are accepted, behind a time-box, and only if it ships RFC 8414 metadata, PKCE S256, CIMD or DCR, resource indicators (RFC 8707) and refresh rotation. Until then the PRM advertises no authorization server for hosted flows, and the documentation states that ChatGPT/claude.ai connector flows are not supported rather than implying they work.

## Security and privacy

- Credentials are only ever read from `Authorization`; never URL or body.
- Tool annotations are explicit; `readOnlyHint` is true for read tools and for `tastepolicy_evaluate_choice` (it records an evaluation but never acts on the user's behalf).
- No vendor receives anything beyond the minimal authorization response; Qloo affinity is never an authorization signal.

## Not claimed

Live ChatGPT, claude.ai, Gemini Enterprise, Gemini API and Claude/OpenAI model-driven runs. Each is recorded `unverified` with reason in the M6 review.

> Update: the "no authorization server" position above was replaced by ADR 0022.
