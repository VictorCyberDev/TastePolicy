import Link from "next/link";
import CompanyDocument from "./CompanyDocument";
import { ERROR_CATALOG } from "@/lib/platform/errors";
const topics: Record<
  string,
  { title: string; summary: string; steps: string[]; code?: string }
> = {
  rest: {
    title: "REST quickstart",
    summary:
      "Keep the credential on your server. Begin with a Passport read, then evaluate one candidate under an explicit action ceiling.",
    steps: [
      "Create an account, enroll a private Passport from five reviewed cultural identities and issue a credential in the workspace.",
      "Give the credential only the scopes your application needs: PASSPORT_READ, TASTE_EVALUATE and, when needed, RECEIPT_READ.",
      "Use a new idempotency key for a new request. An identical retry keeps its original input and captured result; reusing a key with different input is an error.",
      "Branch explicitly on ALLOW, ASK, REJECT and UNAVAILABLE. A preference decision never authorizes payment, booking, messaging or account operations.",
    ],
    code: `curl https://tastepolicy.vercel.app/api/v1/passport \\\n  -H "Authorization: Bearer $TASTEPOLICY_API_KEY" \\\n  -H 'Content-Type: application/json' \\\n  -d '{"passportRef":"YOUR_PASSPORT_REF"}'`,
  },
  mcp: {
    title: "Remote MCP",
    summary:
      "Use the stable HTTPS endpoint and OAuth discovery. Account linking is separate from directory approval.",
    steps: [
      "MCP URL: https://tastepolicy.vercel.app/api/mcp. An unauthenticated request returns a 401 challenge with protected-resource metadata.",
      "The client discovers /.well-known/oauth-protected-resource/api/mcp and /.well-known/oauth-authorization-server. Use authorization code with PKCE S256 and the exact resource audience.",
      "The owner signs in and explicitly consents to scopes. Tools are discovered only after successful authorization. Refresh tokens rotate; reuse revokes the token family.",
      "Tools evaluate choices, inspect authority, manage bounded leases and issue or verify proofs. Review each tool’s input, scopes and behavior annotations.",
      "In ChatGPT use its current custom app/plugin workflow; in Claude use Customize → Connectors → Add → Custom → Web. Registration and a tool scan are not proof of actual conversation use. Live commissioning remains pending.",
    ],
    code: `MCP: https://tastepolicy.vercel.app/api/mcp\nOAuth issuer: https://tastepolicy.vercel.app\nResource: https://tastepolicy.vercel.app/api/mcp`,
  },
  a2a: {
    title: "A2A",
    summary:
      "The public card describes a synchronous JSON-RPC binding and an opt-in authority lifecycle extension.",
    steps: [
      "Read /.well-known/agent-card.json. Send POST /api/a2a with a2a-version: 1.0 and a scoped developer credential.",
      "SendMessage accepts one application/json data part containing passportRef, idempotencyKey, requestedAction and proposal. The result is a completed task whose artifact contains the shared authority response.",
      "GetTask reads a captured result scoped to the caller. Streaming, push notifications and Google marketplace acceptance are not implemented claims.",
      "Request the authority lifecycle extension explicitly for leases/proofs. Verify candidate/context commitments, audience, expiry, trust and current status before relying on a proof.",
    ],
    code: `{\n  "jsonrpc": "2.0", "id": 1, "method": "SendMessage",\n  "params": { "message": { "messageId": "unique-message-id",\n    "role": "ROLE_USER", "parts": [{\n      "mediaType": "application/json",\n      "data": { "passportRef": "YOUR_PASSPORT_REF",\n        "idempotencyKey": "unique-request-key",\n        "requestedAction": "SHORTLIST", "proposal": {\n          "agentId": "travel-agent", "expectedStateVersion": 1,\n          "candidate": { "id": "QLOO_ENTITY_ID", "name": "Reviewed candidate", "type": "place" },\n          "context": { "key": "weekend", "domain": "place" }\n        } } }] } }\n}`,
  },
  oauth: {
    title: "OAuth and credential lifecycle",
    summary:
      "User account sessions, developer keys and assistant OAuth grants have distinct lifecycles and audiences.",
    steps: [
      "Public assistant clients use PKCE S256. Register exact HTTPS callback URIs or a supported published client identity; broad redirect patterns are refused.",
      "The consent page shows the requesting client and scopes. A missing authenticated user cannot approve a grant.",
      "Bind tokens to the MCP resource. Developer credentials may call REST; an MCP OAuth token does not silently gain REST authority.",
      "Refresh rotation and reuse detection end compromised token families. Revoking a credential, disconnecting an assistant or deleting an account ends linked access.",
      "Use recent authentication for sensitive account operations. Store credentials in a server-side secret manager and never expose them in NEXT_PUBLIC_ variables or browser bundles.",
    ],
  },
  proofs: {
    title: "Leases and portable proofs",
    summary:
      "A signed assertion is evidence to inspect, not a universal grant of permission.",
    steps: [
      "A lease is bounded by one evaluation, candidate/context commitments, action ceiling, expiry, checkpoint and authority epoch. ASK with missing facts has no approval shortcut.",
      "Only an explicit authority-confirmation ASK can become pending authority. Changing a candidate or context requires a fresh decision or the defined checkpoint/resume flow.",
      "Proof issuance refuses legacy leases without modern commitments. Minimal disclosure is the default; the owner controls optional disclosure.",
      "Verify signature, issuer trust, audience, expiry, status and commitments independently. A valid signature from an untrusted issuer remains untrusted.",
      "Revoked epochs and INVALID status entries never revive. Verification does not authorize payment, booking, messaging, account or legal action.",
    ],
    code: `Issuer metadata: /.well-known/tastepolicy-issuer\nPublic keys: /.well-known/jwks.json\nVerifier: POST /api/attest/verify\nHuman inspection: /verify`,
  },
  sdk: {
    title: "TypeScript SDK",
    summary:
      "The existing thin client shares the REST wire contract and typed errors. Source availability and registry publication are separate states.",
    steps: [
      "The source client is src/sdk/index.ts in the public repository. The deterministic offline sandbox is explicitly synthetic and makes no Qloo call.",
      "Construct TastePolicyClient with an explicit HTTPS origin and server-only developer credential. Never import that credential into client-side React.",
      "Use passport(), evaluate(), receipt(), lease() and the related lifecycle methods. Inspect TastePolicyError.code, status and retryable rather than parsing a human message.",
      "The separate attestation kit verifies proofs without a TastePolicy account credential; configure trusted issuers explicitly. Automatic issuer discovery does not grant trust.",
      "Build the package with npm run sdk:build, pack packages/sdk, and install the resulting tarball. The proposed npm package is not published yet; do not install an unrelated package.",
    ],
    code: `import { TastePolicyClient } from '@victorcyberdev/tastepolicy-sdk';\nconst client = new TastePolicyClient(\n  'https://tastepolicy.vercel.app',\n  process.env.TASTEPOLICY_API_KEY!\n);\nconst passport = await client.passport({ passportRef });\nconst decision = await client.evaluate({\n  passportRef, idempotencyKey: crypto.randomUUID(),\n  requestedAction: 'SHORTLIST', proposal\n});\n// Switch on all four decisions. Never infer execution permission.`,
  },
  events: {
    title: "Events and audit history",
    summary:
      "Authority history is captured for inspection. An outbound webhook delivery service is not currently offered.",
    steps: [
      "Inspect the account authority timeline for captured policy, decision, lease, revocation and proof lifecycle events.",
      "Replay reads captured decisions rather than recomputing history under today’s policy.",
      "No outbound webhook delivery, signing secret, retry queue or delivery SLA is advertised. Integrators should call the status/lease verification endpoints at the defined boundary.",
      "Export owned data through account settings. Export is not a policy import or a grant to another party.",
    ],
  },
};
export const DOC_TOPICS = Object.entries(topics).map(([slug, t]) => ({
  slug,
  title: t.title,
  summary: t.summary,
}));
export default function DeveloperDocs({ slug }: { slug?: string }) {
  const t = slug ? topics[slug] : undefined;
  if (slug === "errors")
    return (
      <CompanyDocument
        eyebrow="DEVELOPER REFERENCE"
        title="Typed failures, explicit stops."
        lead="Use stable error codes and HTTP status. Missing evidence must not become a negative preference."
      >
        <section>
          <h2>Error catalog</h2>
          <ul>
            {Object.entries(ERROR_CATALOG).map(([code, spec]) => (
              <li key={code}>
                <code>{code}</code>
                <pre>{JSON.stringify(spec, null, 2)}</pre>
              </li>
            ))}
          </ul>
        </section>
      </CompanyDocument>
    );
  if (!t)
    return (
      <CompanyDocument
        eyebrow="DEVELOPER DOCUMENTATION"
        title="Your first real boundary."
        lead="Sign up, review five cultural identities, create a private Passport and issue a scoped credential. Then evaluate a candidate through one of the shared protocols."
      >
        <div className="company-actions">
          <Link href="/signup" className="company-primary">
            Create developer account ↗
          </Link>
          <Link
            href="/api/v1/openapi"
            prefetch={false}
            target="_blank"
            className="company-text-link"
          >
            Read OpenAPI →
          </Link>
        </div>
        <div className="company-doc-grid">
          {DOC_TOPICS.map((t) => (
            <Link
              className="company-doc-tile"
              href={`/docs/${t.slug}`}
              key={t.slug}
            >
              <h2>{t.title} ↗</h2>
              <p>{t.summary}</p>
            </Link>
          ))}
          <Link className="company-doc-tile" href="/docs/errors">
            <h2>Error catalog ↗</h2>
            <p>Stable codes, status and retry semantics.</p>
          </Link>
        </div>
        <section>
          <h2>The action ladder</h2>
          <p>
            SUGGEST → RANK → SHORTLIST → ADD_TO_DRAFT → PRESENT_AS_SELECTED. An
            agent requesting a rung above its allowed ceiling gets ASK; strong
            affinity cannot expand that ceiling.
          </p>
          <p>
            <Link href="/account/rules">Inspect and change your rules →</Link>
          </p>
        </section>
      </CompanyDocument>
    );
  return (
    <CompanyDocument eyebrow="DEVELOPER GUIDE" title={t.title} lead={t.summary}>
      <section>
        <h2>Integration steps</h2>
        <ol>
          {t.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {t.code && (
          <pre tabIndex={0} aria-label={`${t.title} example`}>
            <code>{t.code}</code>
          </pre>
        )}
      </section>
      <p>
        <Link href="/docs">All developer guides</Link> ·{" "}
        <Link href="/support">Get support</Link>
      </p>
    </CompanyDocument>
  );
}
