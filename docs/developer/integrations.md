# Integrating agents with TastePolicy

TastePolicy answers one question for an autonomous agent: _does this proposed brand, place or destination match what this person has reviewed and authorized as their cultural preferences?_ The answer is `ALLOW`, `ASK`, `REJECT` or `UNAVAILABLE`. It is **cultural preference authorization only**: no answer grants purchase, payment, booking, messaging, legal, account or private-data authority, and `UNAVAILABLE` is never a rejection.

One evaluator sits behind every door below. Doors differ only in wire format and are checked against each other by `tests/conformance.test.ts`.

| Door           | Endpoint                                                                                         | Auth                                 | Use when                              |
| -------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------ | ------------------------------------- |
| REST           | `POST /api/v1/{capabilities,passport,evaluate,receipt,status}`; OpenAPI at `GET /api/v1/openapi` | `Authorization: Bearer <credential>` | Any HTTP client, function calling     |
| TypeScript SDK | `src/sdk` (`TastePolicyClient`, typed `TastePolicyError`)                                        | credential                           | Server-side agents in TS              |
| Remote MCP     | `POST /api/mcp` (MCP 2026-07-28 and 2025-era, stateless, JSON)                                   | bearer                               | Claude, OpenAI Responses, Gemini, ADK |
| A2A 1.0        | card `/.well-known/agent-card.json`, JSON-RPC `POST /api/a2a`                                    | bearer, `A2A-Version: 1.0`           | Agent-to-agent networks               |
| Sandbox        | `createSandbox()` from `src/sdk/sandbox`                                                         | built-in synthetic credential        | Offline tests and CI                  |

Credentials are issued in the account console (`/account`), are scoped (`PASSPORT_READ`, `TASTE_EVALUATE`, `RECEIPT_READ`), expire, and are shown once. Put them in a private environment variable; never in a URL, a browser bundle or a command-line argument.

## Tools (MCP) and skill (A2A)

MCP tools: `tastepolicy_capabilities`, `tastepolicy_get_authority`, `tastepolicy_evaluate_choice`, `tastepolicy_get_receipt`, `tastepolicy_get_status`. Reads declare `readOnlyHint:true`; `tastepolicy_evaluate_choice` records an evaluation (idempotent by `idempotencyKey`) but never acts for the user. Domain outcomes are normal results; invalid input or missing scope is `isError:true` with a stable `code` and `retryable` flag.

A2A skill `preference_authorization`: `SendMessage` with one `data` part `{passportRef, grantId?, idempotencyKey?, proposal}`. `messageId` is the idempotency key when none is given. The response is a `TASK_STATE_COMPLETED` task whose artifact holds the `taste-authorization-response`. `GetTask` takes the evaluation reference and returns `TaskNotFound` for anyone but the caller. Streaming, push notifications, `ListTasks` and the extended card are not supported and return the A2A error for that.

## Leases

After an ALLOW (or an ASK whose `ask.kind` is `AUTHORITY_CONFIRMATION`; a `CLARIFICATION_REQUIRED` ASK cannot be leased) an agent can request a short **lease** and keep verifying it while it works. See `docs/product/m8-preference-authority-leases.md`. A lease is never a purchase or booking authority.

## Attestations

For parties that cannot hold a TastePolicy credential, an agent can turn an ACTIVE lease into a short-lived verifiable proof. See `docs/product/m9-verifiable-attestations.md` and, for verifiers, `src/sdk/attest.ts` and `npm run conformance:attest`.

## Vendor routes

Each recipe below is the configuration shape from the vendor's own documentation as researched on 2026-10-23 (ADR 0014). Automation here proves our server speaks the protocol using the official MCP and A2A clients; it does **not** prove any vendor's hosted product has been connected. Items marked human-only were not run.

### OpenAI

- **Responses API remote MCP** (bearer works because OpenAI lets you pass the token in `authorization`): see `examples/integrations/openai-responses.json`. Requires a publicly reachable HTTPS deployment and an OpenAI API key. Not run here.
- **Function calling**: use the generated OpenAPI/JSON schemas with your own code calling the SDK. Works with any key.
- **ChatGPT custom MCP / plugin**: ChatGPT supports OAuth, no-auth or mixed, not static bearer. TastePolicy does not yet run a connector-grade authorization server (see "OAuth for hosted connectors"), so this route is **not supported yet**.

### Anthropic

- **Claude Code**: `claude mcp add --transport http tastepolicy https://<host>/api/mcp --header "Authorization: Bearer $TASTEPOLICY_API_KEY"`, or commit `examples/integrations/claude-code.mcp.json`. Human-run.
- **Claude Agent SDK**: `mcpServers: { tastepolicy: { type: "http", url, headers } }` with `allowedTools: ["mcp__tastepolicy__*"]` (`examples/integrations/claude-agent-sdk.ts`).
- **Messages API MCP connector** (beta `mcp-client-2025-11-20`): `examples/integrations/claude-messages-connector.json`.
- **claude.ai custom connector**: supports request headers for static credentials; entered in the UI by a plan owner. Human-only.

### Google

- **Gemini API Interactions** `{"type":"mcp_server","name":"tastepolicy","url":…,"headers":{…}}` (`examples/integrations/gemini-interactions.json`). Google's docs contradict themselves on Gemini 3 support for remote MCP; verify with your own key.
- **Google ADK**: `McpToolset(connection_params=StreamableHTTPConnectionParams(url, headers))` and `RemoteA2aAgent(agent_card=…)` (`examples/integrations/adk.py`).
- **Gemini Enterprise A2A registration** requires A2A 0.3 and end-user OAuth. TastePolicy serves A2A 1.0 with bearer credentials, so this route is **not supported**.

## OAuth for hosted connectors

Hosted consumer connectors (ChatGPT, claude.ai directory entries, Gemini Enterprise) expect an OAuth 2.1 authorization server. The MCP endpoint publishes RFC 9728 Protected Resource Metadata at `/.well-known/oauth-protected-resource/api/mcp` and a `WWW-Authenticate: Bearer resource_metadata=…` challenge, but advertises no authorization server. Until one is accepted, use the bearer routes above.

## Limits and failure semantics

- 30 authenticated requests per account per UTC minute across all doors; 100 evaluations per subject per UTC day; 16 KiB request bodies.
- `RATE_LIMITED`, `NOT_CONFIGURED`, `PROVIDER_UNAVAILABLE` and `INTERNAL_ERROR` are marked `retryable`. Everything else is not. Retrying `evaluate` with the same `idempotencyKey` and payload returns the original result.
- Receipts are recorded evidence; reading one makes no provider request.

## Local stdio MCP (legacy alias)

`npm run mcp:platform` keeps the original local stdio server (MCP 2025-06-18) with its original tool names (`get_taste_passport`, `evaluate_taste_action`, …). It calls the REST API with an operator credential and is unchanged for compatibility. New integrations should use the remote tools above, whose names and schemas come from the shared contract.
