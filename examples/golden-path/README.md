# Developer golden path

This is an installable Next.js/server, raw REST, official MCP client and Vercel AI SDK example. It is a source example, not a hosted customer app or proof of ChatGPT/Claude commissioning. No model request, purchase or real charge is executed by its offline exercise.

From the repository root:

```sh
npm ci
npm run sdk:build
npm ci --prefix examples/golden-path
npm run offline --prefix examples/golden-path
npm run build --prefix examples/golden-path
```

The package uses the local built SDK because npm publication has not happened. Keep that build present before installing. For a separate repository, pack packages/sdk and install its exact tarball instead of the file dependency. Node 24 is used in repository CI. AI SDK 7.0.156's installed tool-calling guide was consulted, including inputSchema and generateText's toolApproval API; older needsApproval examples are deprecated.

For production, sign up at https://tastepolicy.vercel.app/signup, review five Qloo identities, create your workspace/Passport and issue the minimum scoped credential. Save TASTEPOLICY_API_KEY and TASTEPOLICY_PASSPORT_REF only in the server environment. Run node rest.mjs or npm run mcp from this directory. The MCP example discovers tools and invokes only public capabilities using your credential; it never logs tokens or preference records. These commands require actual configured credentials and are distinct from the offline exercise.

The Next example's GET /api/passport is a server-to-server gateway. Configure a separate random APP_GATEWAY_TOKEN of at least 32 characters and send it as a Bearer header from a trusted server caller. It is not browser authentication and must not be embedded in a frontend. Replace that gateway with your application's authenticated tenant/session binding before exposing per-user functionality. The page never renders either token.

For AI SDK, import authorityTool and bind the client's Passport, registered agent ID, independently reviewed Qloo candidate/context and application operationId on the server. The model receives an empty input schema and cannot select another owner or replace the reviewed choice. Preserve operationId and identical payload on retry; allocate a new ID for a genuinely new operation. askModel requires an explicit currently enabled model ID and configures tastepolicy:user-approval; the calling app must handle the approval request/response cycle described in the installed AI SDK docs. The offline executor directly exercises the tool without invoking a model or simulating human consent.

For OpenAI Responses API and Claude Messages/Agent SDK configuration, see ../integrations and docs/developer/integrations.md. JSON templates contain no credentials and must be populated in a private server process. ChatGPT and Claude hosted custom connectors use the production OAuth flow; a JSON template or successful SDK request does not prove either hosted product connected.

Always branch on all four outcomes and check continuation.permittedActions. ASK is not ALLOW. UNAVAILABLE is not dislike. No subjective decision permits payment, booking, messaging, account changes or legal action. A verified portable proof still requires a relying party's separate authorization check.
