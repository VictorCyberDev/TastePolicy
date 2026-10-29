import Link from "next/link";
import CompanyShell, { BoundaryMark } from "@/features/company/CompanyShell";
import TasteBoundaryShowcase from "@/features/company/TasteBoundaryShowcase";
import "@/features/company/submission.css";

const tasteSignals = [
  ["/taste/taste-0.svg", "Music · Nils Frahm"],
  ["/taste/taste-1.svg", "Film · Perfect Days"],
  ["/taste/taste-2.svg", "Design · Muji"],
  ["/taste/taste-3.svg", "Books · Piranesi"],
  ["/taste/taste-4.svg", "TV · Severance"],
  ["/taste/taste-6.svg", "Places · cultural discovery"],
];

export default function Home() {
  return (
    <CompanyShell>
      <main className="submission-home">
        <section className="company-hero">
          <div className="company-hero-copy">
            <p className="company-eyebrow">
              <span className="company-live-dot" /> QLOO-POWERED SUBJECTIVE
              AUTHORITY
            </p>
            <h1>
              Your AI knows
              <br />
              your taste.
              <br />
              <em>Who said it could choose?</em>
            </h1>
            <p className="company-lead">
              Qloo finds what fits. TastePolicy decides how far your agent may
              go — using the rules, context and limits you actually set.
            </p>
            <div className="company-actions">
              <Link href="/arena/consumer" className="company-primary">
                Try the live Qloo journey <span aria-hidden="true">↗</span>
              </Link>
              <Link href="/judge" className="company-text-link">
                Judge walkthrough <span aria-hidden="true">→</span>
              </Link>
            </div>
            <p className="company-caption">
              A great cultural match is evidence, not permission. TastePolicy
              turns grounded taste into bounded agent authority.
            </p>
          </div>
          <TasteBoundaryShowcase />
        </section>

        <section
          className="submission-proof-strip"
          aria-label="Three boundary outcomes"
        >
          <div className="submission-proof-strip-inner">
            <article>
              <span className="submission-number">92%</span>
              <h3>Great fit. Allowed.</h3>
              <p>
                The candidate fits the cultural signal and the requested action
                stays within the saved authority ceiling.
              </p>
            </article>
            <article>
              <span className="submission-number">96%</span>
              <h3>Great fit. Ask first.</h3>
              <p>
                Taste can be strong while a required fact is still missing.
                TastePolicy pauses instead of inventing consent.
              </p>
            </article>
            <article>
              <span className="submission-number">99%</span>
              <h3>Perfect fit. Still no.</h3>
              <p>
                An explicit exclusion outranks affinity. Your boundary does not
                disappear because an algorithm is confident.
              </p>
            </article>
          </div>
        </section>

        <section className="submission-taste-field">
          <header>
            <div>
              <p className="company-eyebrow">THE TASTE LAYER</p>
              <h2>Culture is messy. That is the point.</h2>
            </div>
            <p>
              People are not a single genre or category. TastePolicy starts from
              cross-domain cultural signals resolved through Qloo — music, film,
              books, brands, places and more — then keeps that evidence separate
              from permission.
            </p>
          </header>
          <div
            className="submission-mosaic"
            aria-label="Authored TastePolicy cultural illustrations"
          >
            {tasteSignals.map(([src, label]) => (
              <figure key={src}>
                <img src={src} alt="" aria-hidden="true" />
                <figcaption>{label}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section
          className="submission-comparison"
          aria-label="Why Qloo plus TastePolicy"
        >
          <div className="submission-comparison-grid">
            <article>
              <p className="company-eyebrow">GENERIC LLM</p>
              <h3>Can reason. Can still guess.</h3>
              <p>
                A language model can sound convincing without grounded cultural
                evidence about what a person actually likes.
              </p>
            </article>
            <article>
              <p className="company-eyebrow">QLOO</p>
              <h3>Knows what fits.</h3>
              <p>
                Qloo supplies real cultural intelligence and candidate-specific
                evidence across domains. That makes the recommendation
                materially better.
              </p>
            </article>
            <article>
              <p className="company-eyebrow">QLOO + TASTEPOLICY</p>
              <h3>Knows what fits — and where to stop.</h3>
              <p>
                TastePolicy evaluates the requested action against explicit user
                rules, context and ceilings, returning ALLOW, ASK, REJECT or
                UNAVAILABLE with a cultural receipt.
              </p>
            </article>
          </div>
        </section>

        <section
          className="company-principles"
          aria-label="Authority principles"
        >
          <p>
            Taste <span>is not permission.</span>
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
            <p className="company-eyebrow">ONE HUMAN IDEA</p>
            <h2>
              Let the agent know
              <br />
              <em>where to stop.</em>
            </h2>
          </div>
          <div className="company-story-grid">
            <article>
              <span>01 / UNDERSTAND</span>
              <h3>Ground the choice in Qloo.</h3>
              <p>
                Resolve cultural signals and inspect candidate-specific
                evidence. TastePolicy does not recreate Qloo&apos;s graph.
              </p>
            </article>
            <article>
              <span>02 / BOUND</span>
              <h3>Apply the person&apos;s actual rules.</h3>
              <p>
                Keep exclusions absolute, respect action ceilings, ask when a
                required fact is missing and never turn uncertainty into
                consent.
              </p>
            </article>
            <article>
              <span>03 / PROVE</span>
              <h3>Show why the agent stopped or continued.</h3>
              <p>
                Cultural receipts keep Qloo evidence, user rules, decision state
                and later authority lifecycle checks inspectable.
              </p>
            </article>
          </div>
        </section>

        <section className="company-section company-protocol">
          <BoundaryMark />
          <div>
            <p className="company-eyebrow">
              THE PRODUCT IS SIMPLE. THE INFRASTRUCTURE IS REAL.
            </p>
            <h2>One boundary. Multiple agent doors.</h2>
            <p>
              The same authority contract is exposed through the live consumer
              experience, REST, OAuth, remote MCP, A2A and the TypeScript client.
            </p>
            <div className="company-protocol-tags">
              <span>Qloo</span>
              <span>REST</span>
              <span>MCP</span>
              <span>OAuth</span>
              <span>A2A</span>
              <span>Portable proofs</span>
            </div>
            <Link className="company-text-link" href="/developers">
              Inspect the developer platform →
            </Link>
            <p className="company-caption">
              Protocol support and public directory approval are kept distinct.
              The live Qloo Consumer Arena is available without a founder-only
              key.
            </p>
          </div>
        </section>

        <section className="company-section company-final-cta">
          <p className="company-eyebrow">THE MEMORABLE TEST</p>
          <h2>
            If it is a 99% match
            <br />
            and you said never,
            <br />
            the answer is still no.
          </h2>
          <Link className="company-primary" href="/arena/consumer">
            Try TastePolicy with real Qloo evidence ↗
          </Link>
          <Link className="company-text-link" href="/trust">
            Inspect the trust boundary →
          </Link>
        </section>
      </main>
    </CompanyShell>
  );
}
