# Custom domain migration

Canonical temporary production origin: `https://tastepolicy.vercel.app`.
Owner: TastePolicy operator. A custom domain is optional; do not block release on it.

1. Record current main SHA, deployment ID, Vercel aliases, environment scopes, OAuth client inventory and issuer JWKS. Take a Neon recovery snapshot and verify restore access before changing identity.
2. Add the domain in Vercel, apply the DNS records Vercel actually returns, verify ownership/TLS, and keep the Vercel hostname serving during transition. Never guess DNS targets.
3. Set `TASTEPOLICY_PUBLIC_ORIGIN` to the new HTTPS origin. Keep `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` equal to it. Deploy the verified main commit using production variables. Preview variables stay scoped to staging.
4. Check Better Auth trusted origins, request-origin checks, CORS and MCP allowed hostnames. Add only exact required origins; no wildcard credentialed CORS. Test old and new origins, forwarded Host poisoning and failed CSRF requests.
5. Update OAuth issuer, authorization-server/protected-resource metadata and resource audience. Review assistant redirect URIs against the providers' current published callback addresses. Re-register clients or reauthorize where issuer/audience changes require it. Do not silently broaden old client redirects.
6. Update MCP endpoint, OAuth discovery links, REST/OpenAPI servers, A2A card/endpoint and SDK configuration. Examples should receive an explicit base URL; retain compatibility only when it does not violate resource audience checks.
7. Treat the attestation issuer change as an identity migration. Preserve old issuer metadata, public keys and status lists for outstanding proof lifetimes. Never relabel old proofs or automatically trust a new issuer. Publish the new issuer and explicitly configure verifier trust; rehearse old/new proof verification and permanent revocation.
8. Obtain the exact new OpenAI domain-verification token from the publisher workflow and set `OPENAI_APPS_CHALLENGE`. Verify the exact response at `/.well-known/openai-apps-challenge`. Update OpenAI listing website, MCP, support, privacy and terms URLs; re-scan and submit any required review.
9. Update Claude connector/directory URLs and OAuth setup, then execute a fresh real tool invocation. Update MCP registry and A2A/vendor metadata; retain submitted versus approved versus published states.
10. Update docs, judge/Devpost URLs, webhooks and callback allowlists, email links, social/OpenGraph/canonical/search metadata, sitemap, package README and SDK defaults. Re-sign outbound webhook URLs only through the normal secret lifecycle.
11. Run hosted acceptance from outside Vercel, clean signup/signin, OAuth rotation/reuse/revocation, REST/MCP/A2A, proof issuer/status, and real Qloo. Repeat fresh ChatGPT/Claude commissioning and verify no branch/deployment-specific origin appears in public metadata.
12. Record exact SHA, deployment, DNS/TLS evidence and integration states in the company ledger. If identity checks fail, restore former production configuration/alias and redeploy the previous compatible release. Preserve new and old issuer history; rollback never revives revoked authority.
