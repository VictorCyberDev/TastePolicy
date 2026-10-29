import Link from "next/link";
import CompanyShell from "@/features/company/CompanyShell";
import TasteBoundaryShowcase from "@/features/company/TasteBoundaryShowcase";
import "@/features/company/submission.css";

export const metadata = {
  title: "Judge route · TastePolicy",
  description:
    "A two-minute route through Qloo cultural evidence, explicit user boundaries and explainable agent authority.",
};

export default function JudgePage() {
  return (
    <CompanyShell>
      <main className="submission-home">
        <section className="company-hero">
          <div className="company-hero-copy">
            <p className="company-eyebrow">
              <span className="company-live-dot" /> JUDGE ROUTE · START HERE
            </p>
            <h1>
              Taste tells the agent
              <br />
              what fits.
              <br />
              <em>Your rules tell it where to stop.</em>
            </h1>
            <p className="company-lead">
              The fastest way to understand TastePolicy is to watch one
              culturally grounded choice move from Qloo evidence to an explicit
              authority decision.
            </p>
            <div className="company-actions">
              <Link href="/arena/consumer" className="company-primary">
                Run the live Qloo journey <span aria-hidden="true">↗</span>
              </Link>
              <Link href="/demo" className="company-text-link">
                Engineering evidence <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
          <TasteBoundaryShowcase />
        </section>

        <section
          className="submission-proof-strip"
          aria-label="Two-minute judging route"
        >
          <div className="submission-proof-strip-inner">
            <article>
              <span className="submission-number">01</span>
              <h3>See real Qloo cultural evidence.</h3>
              <p>
                Start in the public Consumer Arena. Review the five resolved
                cross-domain signals, discover a real candidate and inspect its
                cultural evidence.
              </p>
            </article>
            <article>
              <span className="submission-number">02</span>
              <h3>Trigger a boundary.</h3>
              <p>
                A qualifying choice can ALLOW. A missing required fact can ASK.
                An exact exclusion can REJECT even when cultural affinity is
                high.
              </p>
            </article>
            <article>
              <span className="submission-number">03</span>
              <h3>Open the Cultural Receipt.</h3>
              <p>
                Inspect the captured Qloo provenance, the applicable user rule
                and the decision together. Evidence and permission stay
                separate.
              </p>
            </article>
          </div>
        </section>

        <section className="company-section company-boundary-story">
          <div>
            <p className="company-eyebrow">WHAT THIS PROVES</p>
            <h2>
              Qloo is not decoration.
              <br />
              <em>It is the cultural evidence layer.</em>
            </h2>
          </div>
          <div className="company-story-grid">
            <article>
              <span>WITHOUT QLOO</span>
              <h3>The agent can reason but may still guess taste.</h3>
              <p>
                TastePolicy does not claim that language-model confidence is a
                substitute for cultural evidence.
              </p>
            </article>
            <article>
              <span>WITH QLOO</span>
              <h3>The agent gets grounded cultural fit.</h3>
              <p>
                Qloo supplies identities, relationships and candidate-specific
                signals across cultural domains.
              </p>
            </article>
            <article>
              <span>WITH TASTEPOLICY</span>
              <h3>Grounded fit becomes bounded authority.</h3>
              <p>
                Rules, context and action ceilings determine whether the agent
                may continue, must ask, must reject, or must pause because
                evidence is unavailable.
              </p>
            </article>
          </div>
        </section>

        <section className="company-section company-protocol">
          <div
            aria-hidden="true"
            style={{
              fontFamily: "Boundary Serif, Georgia, serif",
              fontSize: "clamp(80px, 12vw, 180px)",
              lineHeight: 0.8,
              textAlign: "center",
            }}
          >
            99%
          </div>
          <div>
            <p className="company-eyebrow">THE SIGNATURE TEST</p>
            <h2>A perfect taste match can still be a hard no.</h2>
            <p>
              Save an exact exclusion, evaluate the same candidate and watch
              the boundary hold. This is the difference between knowing
              someone&apos;s taste and being authorized to choose for them.
            </p>
            <div className="company-protocol-tags">
              <span>Qloo evidence</span>
              <span>Explicit rules</span>
              <span>ALLOW / ASK / REJECT</span>
              <span>Cultural Receipt</span>
            </div>
            <Link className="company-text-link" href="/arena/consumer">
              Run the live route →
            </Link>
          </div>
        </section>

        <section className="company-section company-final-cta">
          <p className="company-eyebrow">OPTIONAL DEEPER REVIEW</p>
          <h2>After the idea is clear, inspect the infrastructure.</h2>
          <p className="company-lead" style={{ margin: "0 auto 28px" }}>
            REST, OAuth, remote MCP, A2A, scoped credentials, leases, portable
            proofs, conformance tests and release evidence are available for a
            deeper technical review. They are not required to understand the
            core product.
          </p>
          <Link className="company-primary" href="/developers">
            Developer platform ↗
          </Link>
          <Link className="company-text-link" href="/trust">
            Trust and evidence →
          </Link>
        </section>
      </main>
    </CompanyShell>
  );
}
