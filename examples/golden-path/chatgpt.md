# ChatGPT custom connector example

This example documents the supported ChatGPT connection path without claiming that a successful live host invocation has already occurred.

## Endpoint

- Remote MCP: `https://tastepolicy.vercel.app/api/mcp`
- OAuth issuer: `https://tastepolicy.vercel.app`
- Protected resource: `https://tastepolicy.vercel.app/api/mcp`

## Account-linking boundary

TastePolicy uses authorization code + PKCE S256. The owner must be signed in to TastePolicy and explicitly consent to the requested scopes. Refresh access is revocable; refresh-token reuse invalidates the token family. A ChatGPT connection grants only the scopes approved by the owner and never grants booking, payment, messaging, account-change or legal execution authority.

The production server supports OpenAI client metadata/CIMD negotiation including a bounded plural authentication-method set containing `none`. Confidential assertions and client secrets remain rejected for this public-client path.

## Recommended host test

After connecting, use a review Passport you own and execute this sequence:

1. **Inspect** — “Show my TastePolicy authority, action ceiling and available capabilities.”
2. **ALLOW** — evaluate a reviewed candidate whose Qloo evidence and rules fit the saved ceiling.
3. **ASK** — request `PRESENT_AS_SELECTED` when the saved ceiling is `SHORTLIST`.
4. **REJECT** — evaluate a candidate with an explicit saved exclusion.
5. **UNAVAILABLE** — only when required provider evidence is genuinely unavailable; never simulate a score or relabel absence as dislike.
6. **Continuation** — inspect the captured receipt; request/verify a bounded lease; issue/verify a proof against the same candidate/context commitments.
7. **Negative execution test** — ask the host to book/pay using an ALLOW. The correct response is that TastePolicy does not supply transaction authority.

## Evidence rule

A successful connection screen or tool scan is not enough. Live commissioning is complete only after an authenticated ChatGPT conversation invokes the production MCP server and the resulting TastePolicy operation is evidenced in both the host and production telemetry. Until then, describe the integration as compatible/registered, not commissioned.
