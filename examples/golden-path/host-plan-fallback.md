# Host-plan fallback: REST, SDK and A2A

TastePolicy does not require a specific assistant plan to remain usable. If a hosted assistant account cannot add or enable a custom MCP connector, use one of the already commissioned server-to-server surfaces instead of weakening authentication or exposing private state publicly.

## Public discovery/read surfaces

These endpoints are safe to fetch without an owner credential and are useful for capability discovery:

- Product documentation: `https://tastepolicy.vercel.app/docs`
- OpenAPI: `https://tastepolicy.vercel.app/api/v1/openapi`
- A2A agent card: `https://tastepolicy.vercel.app/.well-known/agent-card.json`
- OAuth protected-resource metadata: `https://tastepolicy.vercel.app/.well-known/oauth-protected-resource`
- OAuth authorization-server metadata: `https://tastepolicy.vercel.app/.well-known/oauth-authorization-server`

They describe the service; they do not expose an owner's Passport, receipts or authority.

## Authenticated fallback

For private owner data or a real decision, use a server-side TastePolicy credential through:

1. the TypeScript SDK;
2. the versioned REST API; or
3. the A2A endpoint.

The existing `rest.mjs`, `authority-tool.mjs` and A2A examples demonstrate these boundaries. Keep credentials server-side, preserve the same owner/Passport/agent binding, and branch on ALLOW, ASK, REJECT and UNAVAILABLE exactly as an MCP host would.

A host-plan limitation is never a reason to copy a private Passport into a prompt, publish a credential, bypass OAuth, or reinterpret ALLOW as transaction authority.

## Evidence boundary

REST, SDK and A2A have independent production acceptance evidence. This fallback therefore preserves a genuinely commissioned interface when a particular assistant plan cannot host the connector. It does not claim that the restricted host itself executed the operation.
