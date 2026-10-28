import Link from "next/link";
import CompanyDocument from "./CompanyDocument";
export function PricingPage() {
  return (
    <CompanyDocument
      eyebrow="PLANS & ACCESS"
      title="Start with a clear boundary."
      lead="Use the evaluation service to build and test. Commercial Qloo-backed plans require provider clearance and a separate agreement before paid activation."
    >
      <div className="company-plan-grid">
        <article className="company-plan">
          <h2>Developer</h2>
          <strong>Free evaluation</strong>
          <ul>
            <li>Personal account and Passport</li>
            <li>Scoped developer credentials</li>
            <li>REST, MCP and A2A contracts</li>
            <li>Versioned rules, receipts and lease inspection</li>
            <li>Bounded service quotas; no availability SLA</li>
          </ul>
          <Link href="/signup" className="company-primary">
            Start building ↗
          </Link>
        </article>
        <article className="company-plan">
          <h2>Pro pilot</h2>
          <strong>Scope a pilot</strong>
          <ul>
            <li>For teams building personal agents</li>
            <li>Define decision and agent quotas together</li>
            <li>Review Qloo usage and retention needs</li>
            <li>Agree support and data boundaries</li>
            <li>Paid checkout is not active</li>
          </ul>
          <Link href="/support" className="company-primary">
            Discuss a pilot ↗
          </Link>
        </article>
        <article className="company-plan">
          <h2>Enterprise</h2>
          <strong>Custom scope</strong>
          <ul>
            <li>Architecture and threat-model review</li>
            <li>Vendor and subprocessor diligence</li>
            <li>Deployment and recovery planning</li>
            <li>Contracted limits and support expectations</li>
            <li>No certification or SLA implied</li>
          </ul>
          <Link href="/trust" className="company-primary">
            Review trust material ↗
          </Link>
        </article>
      </div>
      <section>
        <h2>What usage means</h2>
        <p>
          A decision is a new evaluation of one candidate in one context under a
          captured policy. Receipt reads, proof verification and authorization
          are different operations. Replaying an idempotent request must not
          become a second paid evaluation. Billable quotas and overage prices
          will be explicit before any paid activation.
        </p>
        <p>
          There are currently no charges, automatic paid upgrades or production
          billing claims. Qloo commercial pricing and data permissions are
          pending written confirmation.
        </p>
      </section>
    </CompanyDocument>
  );
}
export function SecurityPage() {
  return (
    <CompanyDocument
      eyebrow="SECURITY"
      title="Authority should fail closed."
      lead="TastePolicy separates cultural evidence, user policy, credentials and execution authority. These are implemented controls with explicit limits."
    >
      <section>
        <h2>Account and credential controls</h2>
        <p>
          Better Auth stores server-side sessions in PostgreSQL. Hosted sessions
          use Secure, HttpOnly, SameSite cookies. Sensitive account actions
          require recent authentication. Developer credentials are hashed,
          scoped, expiring and revocable; a credential is shown only at
          issuance.
        </p>
        <p>
          OAuth uses authorization code with PKCE S256, explicit consent,
          resource binding, rotating refresh tokens and reuse detection. OAuth
          credentials are MCP-audience bound; they do not grant general REST
          access.
        </p>
      </section>
      <section>
        <h2>Choice and proof integrity</h2>
        <p>
          Leases bind candidate and context commitments. Partial commitments
          fail with an integrity error; legacy leases cannot mint modern
          portable proofs. Authority epochs end permanently when revoked.
          Verification separates signature validity, issuer trust and current
          status.
        </p>
      </section>
      <section>
        <h2>Isolation and transport</h2>
        <p>
          Account ownership and grant checks are applied in service and
          repository paths. Database schema privileges are restricted and tenant
          scoping is tested. Hosting provides HTTPS. Application database
          connections use TLS. We do not claim application-level end-to-end
          encryption of cultural preference records.
        </p>
      </section>
      <section>
        <h2>Report a vulnerability</h2>
        <p>
          Email{" "}
          <a href="mailto:victornnajiofor1@gmail.com?subject=TastePolicy%20security%20report">
            victornnajiofor1@gmail.com
          </a>{" "}
          with reproduction steps and the affected surface. Do not send live
          credentials or another person’s preference data. Please allow
          investigation before public disclosure.
        </p>
        <p>
          Independent penetration testing, SOC 2 and ISO 27001 certification
          have not been obtained. See the{" "}
          <Link href="/trust">Trust Center</Link> for evidence and open
          diligence items.
        </p>
      </section>
    </CompanyDocument>
  );
}
export function TrustPage() {
  return (
    <CompanyDocument
      eyebrow="TRUST CENTER"
      title="Inspect the boundary."
      lead="A technical buyer should be able to distinguish an implemented control, a test result, a vendor dependency and an unproven claim."
    >
      <section>
        <h2>Architecture and evidence</h2>
        <p>
          A Next.js service fronts PostgreSQL state, a deterministic policy
          engine and server-only Qloo calls. REST, MCP and A2A reuse the same
          authority services. Provider calls run outside database locks, then
          captured state is revalidated.
        </p>
        <ul>
          <li>
            <a href="https://github.com/VictorCyberDev/TastePolicy/blob/main/docs/architecture/m6-m9-architecture-report.md">
              Architecture and data boundaries
            </a>
          </li>
          <li>
            <a href="https://github.com/VictorCyberDev/TastePolicy/blob/main/docs/security/threat-model.md">
              Threat model and residual risks
            </a>
          </li>
          <li>
            <a href="https://github.com/VictorCyberDev/TastePolicy/blob/main/docs/security/supply-chain.md">
              Dependency audit and SBOM
            </a>
          </li>
          <li>
            <a href="https://github.com/VictorCyberDev/TastePolicy/blob/main/docs/evaluation/company-build-m10-m26.md">
              Current execution evidence
            </a>
          </li>
        </ul>
      </section>
      <section>
        <h2>Vendors and data</h2>
        <p>
          Vercel hosts the service; Neon stores application data; Qloo provides
          cultural evidence; optional Wikimedia media is presentation-only.
          OpenAI and Anthropic receive scoped tool data only when a user
          connects an assistant. Commercial Qloo rights, vendor-specific
          retention and signed data-processing agreements remain diligence
          items.
        </p>
        <p>
          Deleting application records does not establish deletion from vendor
          backups or erase Qloo’s learned aggregate associations. No fixed
          recovery time, recovery point, uptime percentage or data-residency
          guarantee is claimed.
        </p>
      </section>
      <section>
        <h2>Buyer readiness</h2>
        <p>
          Ask for the architecture, authentication design, credential lifecycle,
          tenant-isolation tests, audit timeline, threat model and
          migration/recovery plan. Support is founder-operated. Enterprise
          contracting requires a defined operator identity, processing scope,
          retention schedule, liability terms and negotiated service
          expectations.
        </p>
        <p>
          No SOC 2, ISO 27001, HIPAA approval, GDPR certification or legal
          compliance audit is represented.{" "}
          <Link href="/support">Start diligence →</Link>
        </p>
      </section>
    </CompanyDocument>
  );
}
export function PrivacyPage() {
  return (
    <CompanyDocument
      eyebrow="PRIVACY · VERSION 2026-10-28"
      title="Your preferences deserve boundaries."
      lead="This notice describes the current evaluation service operated by Victor Nnamdi under the TastePolicy project name."
    >
      <section>
        <h2>Data the service handles</h2>
        <p>
          Account details include name, email, password authentication records
          and sessions. Product records include cultural anchors, policies,
          candidate/context data, decisions, receipts, grants, credentials,
          leases, proofs and authority events. Runtime hosting may retain
          request metadata and error logs.
        </p>
        <p>
          Do not enter health records, financial account details, government
          identifiers or third-party private information. Enter public cultural
          entities rather than personal information in Qloo search fields.
        </p>
      </section>
      <section>
        <h2>Why and where processing happens</h2>
        <p>
          Data supports account access, the decisions you request, replay and
          security. Vercel and Neon process hosting and persistence data. Qloo
          receives cultural queries/entity arrays and requested categories to
          return cultural evidence. Qloo states its API does not accept PII and
          may learn entity associations; we do not promise that every free-text
          cultural input is automatically anonymized.
        </p>
        <p>
          Optional Commons imagery involves public media searches and browser
          requests. If you connect an assistant, its operator receives scoped
          tool inputs/results under its own terms. Data can be processed outside
          your country; no regional hosting guarantee is offered.
        </p>
      </section>
      <section>
        <h2>Retention and control</h2>
        <p>
          Passport or credential expiry limits authority; it does not itself
          delete an account. Demo state expires and is purged opportunistically.
          You can export and delete owned application data in{" "}
          <Link href="/account">account settings</Link>; deletion requires
          recent authentication and revokes linked access. Vendor backups and
          Qloo aggregate learning are separate and may persist.
        </p>
        <p>
          A fixed automated production retention schedule and verified backup
          deletion deadline have not yet been established. Contact the operator
          before using the evaluation service for data that requires contractual
          retention or residency guarantees.
        </p>
      </section>
      <section>
        <h2>Requests and changes</h2>
        <p>
          Contact{" "}
          <a href="mailto:victornnajiofor1@gmail.com?subject=TastePolicy%20privacy%20request">
            victornnajiofor1@gmail.com
          </a>{" "}
          for access, correction, deletion or processing questions. We may need
          to verify account ownership. This notice is versioned; material
          changes will be stated here before applying to new processing.
        </p>
        <p>
          No sale of account records or advertising service is implemented. This
          notice is not a claim of a legal compliance audit or a signed
          enterprise DPA.
        </p>
      </section>
    </CompanyDocument>
  );
}
export function TermsPage() {
  return (
    <CompanyDocument
      eyebrow="SERVICE TERMS · VERSION 2026-10-28"
      title="A precise scope of authority."
      lead="TastePolicy is currently an evaluation service operated by Victor Nnamdi. The project name does not imply a registered corporation."
    >
      <section>
        <h2>Permitted use</h2>
        <p>
          Use the service to evaluate cultural preference choices that you are
          entitled to submit. Keep credentials private, use scoped permissions
          and respect service quotas. Do not use the service to bypass user
          consent, access another account’s data, interfere with availability or
          submit unlawful or third-party confidential content.
        </p>
        <p>
          You remain responsible for your agent and any external action it
          takes. An ALLOW decision concerns the requested subjective action
          only. Payment, purchase, booking, messaging, account access, legal and
          high-impact decisions need separate authorization and safeguards.
        </p>
      </section>
      <section>
        <h2>Evidence and limits</h2>
        <p>
          Qloo supplies cultural evidence, not user permission. Recommendations
          can be incomplete or inaccurate. ASK requires the appropriate
          confirmation or missing facts; REJECT blocks the subjective choice;
          UNAVAILABLE means the required evidence could not be obtained. A
          verified proof is not execution authority.
        </p>
        <p>
          The service is offered for evaluation without a contracted SLA, uptime
          guarantee or warranty of suitability. Do not rely on it for emergency,
          medical, legal or financial determinations. Free evaluation can be
          limited or suspended for abuse or provider availability.
        </p>
      </section>
      <section>
        <h2>Payments, vendors and source</h2>
        <p>
          Paid checkout is not active. No charge or subscription is created by
          signup. Any future paid service requires clear pricing, scope,
          applicable provider permission and separate acceptance. Third-party
          services have their own terms; use of Qloo trademarks does not imply
          partnership.
        </p>
        <p>
          The public repository is Apache-2.0 licensed; third-party assets
          retain their own licenses. A repository license does not license Qloo
          data or trademarks. No assignment of your personal preference records
          is requested by these service terms.
        </p>
      </section>
      <section>
        <h2>Contact and account closure</h2>
        <p>
          Export or delete owned data through account settings. Contact{" "}
          <a href="mailto:victornnajiofor1@gmail.com?subject=TastePolicy%20terms">
            victornnajiofor1@gmail.com
          </a>{" "}
          about disputes, service changes or enterprise terms. Data-processing
          and procurement agreements must be negotiated before representing
          enterprise contractual coverage.
        </p>
      </section>
    </CompanyDocument>
  );
}
export function SupportPage() {
  return (
    <CompanyDocument
      eyebrow="SUPPORT & CONTACT"
      title="Talk to the builder."
      lead="TastePolicy support is handled by founder Victor Nnamdi. There is no staffed enterprise help desk or guaranteed response time."
    >
      <section>
        <h2>Technical support</h2>
        <p>
          Email{" "}
          <a href="mailto:victornnajiofor1@gmail.com?subject=TastePolicy%20support">
            victornnajiofor1@gmail.com
          </a>{" "}
          with the endpoint, approximate time, request ID and a minimal
          reproduction. Share redacted error codes; never paste passwords,
          developer keys, private signing keys or another user’s preferences.
        </p>
        <p>
          For public, non-sensitive bugs,{" "}
          <a href="https://github.com/VictorCyberDev/TastePolicy/issues">
            open a GitHub issue
          </a>
          . Check <Link href="/status">current service probes</Link> and{" "}
          <Link href="/docs">documentation</Link> first.
        </p>
      </section>
      <section>
        <h2>Pilots and procurement</h2>
        <p>
          Describe the agent workflow, number of developers, expected decision
          volume, cultural categories, retention requirements and preferred
          deployment model. We will scope a pilot and clarify Qloo commercial
          dependencies before promising a paid rollout.
        </p>
      </section>
      <section>
        <h2>Security and privacy</h2>
        <p>
          Send vulnerabilities privately using the same mailbox with
          “TastePolicy security” in the subject. For data requests, use
          “TastePolicy privacy” and the account email. We verify ownership
          before discussing account records.
        </p>
      </section>
    </CompanyDocument>
  );
}
export function IntegrationsPage() {
  return (
    <CompanyDocument
      eyebrow="INTEGRATIONS"
      title="One authority contract. Your agent."
      lead="Protocol implementations are available. A successful endpoint response is separate from installation, real assistant usage and public directory approval."
    >
      <section>
        <h2>Remote MCP</h2>
        <p>
          Connect to <code>https://tastepolicy.vercel.app/api/mcp</code> using
          OAuth discovery and explicit account consent. Tools expose policy,
          evaluation, lease and proof operations according to the granted
          scopes.
        </p>
        <p>
          ChatGPT and Claude have not yet been commissioned in the current
          signed-out browser. No installed connector, directory submission or
          platform endorsement is claimed.{" "}
          <Link href="/docs/mcp">MCP integration guide →</Link>
        </p>
      </section>
      <section>
        <h2>REST and TypeScript</h2>
        <p>
          Use a server-side developer credential with <code>/api/v1</code>. Read
          the{" "}
          <Link href="/api/v1/openapi" prefetch={false} target="_blank">
            OpenAPI schema
          </Link>
          . The TypeScript SDK is available in source; package publication is a
          separate release state.
        </p>
        <Link href="/docs/rest">Make a first request →</Link>
      </section>
      <section>
        <h2>A2A and portable proofs</h2>
        <p>
          The public <a href="/.well-known/agent-card.json">A2A agent card</a>{" "}
          describes the JSON-RPC endpoint and authority-lifecycle extension. It
          does not represent Google marketplace acceptance. Portable proof
          verification checks signature, trust, status, candidate and context
          without conferring execution authority.
        </p>
        <Link href="/verify">Inspect a proof →</Link>
      </section>
      <section>
        <h2>Qloo cultural evidence</h2>
        <p>
          Qloo is the live cultural evidence provider. The current credential is
          hackathon access; commercial permission is pending. The service does
          not replace Qloo with invented model output during an outage.
        </p>
      </section>
    </CompanyDocument>
  );
}
