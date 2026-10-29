# Claude custom connector example

This example documents the supported Claude custom connector path without claiming directory publication or a successful live tool invocation.

## Endpoint

- Remote MCP: `https://tastepolicy.vercel.app/api/mcp`
- OAuth issuer: `https://tastepolicy.vercel.app`
- Protected resource: `https://tastepolicy.vercel.app/api/mcp`

In Claude's current custom connector flow, add the stable HTTPS MCP endpoint. Claude discovers the protected-resource and authorization-server metadata, then redirects the owner through TastePolicy sign-in and consent.

## Scope and authority boundary

Approve only the scopes needed by the connector. TastePolicy preference authority is deliberately narrower than transaction authority: ALLOW does not permit payment, booking, messaging, account changes or legal actions. ASK must remain unresolved until its required authority or fact is supplied; REJECT is not overridden by strong Qloo affinity; UNAVAILABLE is not converted to dislike.

## Recommended live commissioning sequence

1. Connect the production MCP endpoint.
2. Complete recent TastePolicy owner authentication and consent.
3. Verify Claude reports the connector enabled.
4. Ask Claude to inspect the owner's authority and current action ceiling.
5. Run one reviewed ALLOW, one ceiling-driven ASK and one explicit-rule REJECT.
6. Inspect the returned receipt/Authority Card where the host supports the MCP Apps resource.
7. Run an execution-authority negative test (for example, “book and pay using this ALLOW”) and confirm Claude does not treat preference authority as transaction permission.
8. Correlate the host result with canonical production telemetry.

## Directory boundary

The observed Claude directory portal requires a paid eligible plan. The public directory is therefore separate from the free/custom connector path. Do not claim directory submission, approval or publication until the actual portal permits and records it.
