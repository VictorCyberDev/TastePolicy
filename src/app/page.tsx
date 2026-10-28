import Link from "next/link";
import CompanyShell, { BoundaryMark } from "@/features/company/CompanyShell";
import AuthorityPreview from "@/features/company/AuthorityPreview";
export default function Home() {
  return (
    <CompanyShell>
      <main>
        <section className="company-hero">
          <div className="company-hero-copy">
            <p className="company-eyebrow">
              <span className="company-live-dot" /> SUBJECTIVE AUTHORITY
              INFRASTRUCTURE
            </p>
            <h1>
              Knowing your taste
              <br />
              isn’t permission.
            </h1>
            <p className="company-lead">
              Give AI agents a clear boundary between what you might like and
              what they’re allowed to choose.
            </p>
            <div className="company-actions">
              <Link href="/account" className="company-primary">
                Build your boundary <span aria-hidden="true">↗</span>
              </Link>
              <Link href="/arena/consumer" className="company-text-link">
                See Qloo in action <span aria-hidden="true">→</span>
              </Link>
            </div>
            <p className="company-caption">
              Qloo gives agents taste.
              <br />
              TastePolicy gives that taste authority boundaries.
            </p>
          </div>
          <AuthorityPreview />
        </section>
        <section
          className="company-principles"
          aria-label="Authority principles"
        >
          <p>
            Memory <span>is not permission.</span>
          </p>
          <p>
            Affinity <span>is not authorization.</span>
          </p>
          <p>
            Verification <span>is not authorization.</span>
          </p>
        </section>
        <section className="company-section company-boundary-story">
          <div>
            <p className="company-eyebrow">THE BOUNDARY</p>
            <h2>
              Your taste.
              <br />
              Your rules.
              <br />
              <em>Any agent.</em>
            </h2>
          </div>
          <div className="company-story-grid">
            <article>
              <span>01 / UNDERSTAND</span>
              <h3>Cultural evidence, from Qloo.</h3>
              <p>
                Reviewed signals across music, film, books, brands and places
                ground a candidate in cultural intelligence.
              </p>
            </article>
            <article>
              <span>02 / DECIDE</span>
              <h3>Authority, from your rules.</h3>
              <p>
                Set the action ceiling. Keep exclusions absolute. Ask for
                missing facts. Never turn an unavailable provider into
                permission.
              </p>
            </article>
            <article>
              <span>03 / PROVE</span>
              <h3>A receipt for the boundary.</h3>
              <p>
                Inspect the evidence and policy behind a decision. Bind short
                leases and portable proofs to the choice, context and authority
                epoch.
              </p>
            </article>
          </div>
        </section>
        <section className="company-section company-protocol">
          <BoundaryMark />
          <div>
            <p className="company-eyebrow">ONE CONTRACT. MULTIPLE DOORS.</p>
            <h2>A boundary your stack can use.</h2>
            <p>
              REST, OAuth, remote MCP, A2A and a TypeScript client share the
              same cultural authority contract.
            </p>
            <div className="company-protocol-tags">
              <span>REST</span>
              <span>MCP</span>
              <span>OAuth</span>
              <span>A2A</span>
              <span>Portable proofs</span>
            </div>
            <Link href="/developers" className="company-text-link">
              Start with the developer guide →
            </Link>
            <p className="company-caption">
              Live ChatGPT and Claude commissioning is pending. Protocol support
              is not platform approval.
            </p>
          </div>
        </section>
        <section className="company-section company-final-cta">
          <p className="company-eyebrow">
            TASTE IS PERSONAL. AUTHORITY SHOULD BE EXPLICIT.
          </p>
          <h2>
            Let your agents know
            <br />
            where to stop.
          </h2>
          <Link href="/account" className="company-primary">
            Open your workspace ↗
          </Link>
          <Link href="/trust" className="company-text-link">
            Inspect the trust boundary →
          </Link>
        </section>
      </main>
    </CompanyShell>
  );
}
