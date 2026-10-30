import Link from "next/link";
import HumanShell from "@/components/layout/HumanShell";
import Tasteprint from "@/components/brand/Tasteprint";
import BoundaryRibbon from "@/components/brand/BoundaryRibbon";
import {
  AuthorityLadder,
  CultureTiles,
  DecisionSeal,
  NeedChip,
} from "@/components/brand/primitives";
import AuthorityPreview from "@/features/company/AuthorityPreview";
import { LOW_ENERGY, MARGARET, SENSORY } from "@/features/experience/personas";
import "@/features/company/company.css";
import "./home.css";

export default function HomePage() {
  return (
    <HumanShell>
      <main className="tp-landing">
        <section className="tp-hero" aria-labelledby="hero-h">
          <div className="tp-hero-copy">
            <p className="tp-eyebrow">Personal agency infrastructure for AI</p>
            <h1 id="hero-h">AI that helps without replacing you.</h1>
            <p className="tp-hero-lead">
              TastePolicy uses Qloo to understand what feels like you, then
              respects the needs and boundaries that determine what an AI may
              suggest, shortlist or choose.
            </p>
            <div className="tp-actions">
              <Link
                className="tp-btn"
                data-variant="spectrum"
                href="/demo/margaret"
              >
                See Margaret&apos;s choice
              </Link>
              <Link className="tp-btn" data-variant="ghost" href="/developers">
                Build with TastePolicy
              </Link>
            </div>
            <p className="tp-hero-line">
              Qloo understands the cultural fit. TastePolicy decides whether the
              agent may act on it.
            </p>
          </div>
          <div className="tp-hero-art" aria-hidden="true">
            <Tasteprint
              anchors={MARGARET.anchors.map((a) => a.query)}
              size={260}
              label=""
            />
          </div>
        </section>

        <div className="tp-landing-ribbon">
          <BoundaryRibbon
            state="discover"
            caption="Taste, context, boundary, decision"
          />
        </div>

        <section className="tp-band" aria-labelledby="margaret-h">
          <p className="tp-eyebrow">Meet Margaret</p>
          <h2 id="margaret-h">Her mobility changed. Her taste didn&apos;t.</h2>
          <p className="tp-band-lead">
            Margaret is 72. She still loves intimate live jazz, classic cinema
            and Tuscan dinners. Walking far and steep entrances are harder now.
            Her assistant is helping her choose where to go.
          </p>
          <CultureTiles
            items={MARGARET.anchors.map((a) => ({
              name: a.query,
              kind: a.caption,
            }))}
          />
          <ul
            className="tp-need-row"
            aria-label="What matters to Margaret right now"
          >
            {MARGARET.requirements.map((r) => (
              <li key={r.key}>
                <NeedChip
                  label={r.label ?? r.key}
                  status="pending"
                  detail={r.importance === "hard" ? "required" : "preferred"}
                />
              </li>
            ))}
          </ul>
        </section>

        <section className="tp-section" aria-labelledby="problem-h">
          <h2 id="problem-h">
            Every recommendation is a decision about a person.
          </h2>
          <div className="tp-trio">
            <article>
              <h3>A recommender asks</h3>
              <p className="tp-q">&ldquo;Will this person like it?&rdquo;</p>
              <p>It knows taste. It doesn&apos;t know what today requires.</p>
            </article>
            <article>
              <h3>An accessibility tool asks</h3>
              <p className="tp-q">&ldquo;Can this person access it?&rdquo;</p>
              <p>It knows access. It doesn&apos;t know what she&apos;d love.</p>
            </article>
            <article data-us="true">
              <h3>TastePolicy asks</h3>
              <p className="tp-q">
                &ldquo;Will she genuinely like it, can it work for her real
                life, what is known or unknown, and how far may the AI
                go?&rdquo;
              </p>
              <p>
                Preference, evidence, requirements, permission and action stay
                separate.
              </p>
            </article>
          </div>
        </section>

        <section className="tp-section tp-split" aria-labelledby="qloo-h">
          <div>
            <p className="tp-eyebrow">Qloo understands</p>
            <h2 id="qloo-h">Cultural understanding, from Qloo.</h2>
            <p>
              Qloo reads cross-domain cultural relationships: music, film,
              dining, places. It tells us what is close to the things a person
              loves. That is evidence about taste, and only that. It never
              claims a place is accessible, quiet or safe.
            </p>
          </div>
          <div>
            <p className="tp-eyebrow">TastePolicy limits</p>
            <h2>The boundary, from the person.</h2>
            <p>
              Requirements describe what works today, in functional terms, never
              as a diagnosis. Unknown facts stay unknown and become a question.
              And the AI can only go as far as the person allowed.
            </p>
          </div>
        </section>

        <section className="tp-section" aria-labelledby="compare-h">
          <h2 id="compare-h">Three answers for the same evening.</h2>
          <div className="tp-trio tp-compare">
            <article>
              <h3>Generic AI</h3>
              <p>
                A popular, well-reviewed place. Looks helpful. May have steps at
                the door, a crowd, a long walk. No way to know.
              </p>
            </article>
            <article>
              <h3>Qloo</h3>
              <p>
                A place that culturally fits Margaret: the jazz, the cinema, the
                cooking. Right taste. Still no idea whether she can get in.
              </p>
            </article>
            <article data-us="true">
              <h3>TastePolicy</h3>
              <p>
                That place, <b>checked against her real needs</b>, with every
                unknown asked about, and the AI held to the limit she set.
              </p>
            </article>
          </div>
        </section>

        <section className="tp-section" aria-labelledby="flag-h">
          <p className="tp-eyebrow">Flagship · Assisted choice</p>
          <h2 id="flag-h">Four honest answers. Never a guess.</h2>
          <div className="tp-seals">
            <DecisionSeal outcome="ALLOW" />
            <DecisionSeal outcome="ASK" />
            <DecisionSeal outcome="REJECT" />
            <DecisionSeal outcome="UNAVAILABLE" />
          </div>
          <div className="tp-split">
            <div>
              <h3>How far AI may go</h3>
              <p>
                Margaret lets her assistant suggest, compare and shortlist. If
                it tries to present something as the final choice, it has to ask
                her first.
              </p>
              <AuthorityLadder
                ceiling="SHORTLIST"
                requested="PRESENT_AS_SELECTED"
              />
            </div>
            <div className="tp-center">
              <Link
                className="tp-btn"
                data-variant="spectrum"
                href="/demo/margaret"
              >
                Watch it happen with real Qloo data
              </Link>
              <p className="tp-muted">No login needed.</p>
            </div>
          </div>
        </section>

        <section className="tp-section" aria-labelledby="more-h">
          <h2 id="more-h">The same boundary, a different need.</h2>
          <div className="tp-trio">
            {[SENSORY, LOW_ENERGY].map((p) => (
              <article key={p.id}>
                <h3>{p.name}</h3>
                <p className="tp-q">&ldquo;{p.quote}&rdquo;</p>
                <Link href={p.path}>Try this scenario →</Link>
              </article>
            ))}
            <article>
              <h3>Needs, not diagnoses</h3>
              <p>
                We model <code>walking_minutes &lt;= 10</code> or{" "}
                <code>noise_level in [low, moderate]</code>. Never a condition,
                and never inferred from taste.
              </p>
            </article>
          </div>
        </section>

        <section className="tp-section tp-engine" aria-labelledby="engine-h">
          <p className="tp-eyebrow">The authority engine</p>
          <h2 id="engine-h">Underneath: a boundary that can be proven.</h2>
          <p className="tp-band-lead">
            Every decision comes from one deterministic evaluator: known
            violation, REJECT; critical fact missing, ASK; evidence unavailable,
            UNAVAILABLE; requirements met within the ceiling, ALLOW. Try the
            illustrative card.
          </p>
          <div className="company">
            <AuthorityPreview />
          </div>
        </section>

        <section className="tp-section tp-dev" aria-labelledby="dev-h">
          <p className="tp-eyebrow">Developer infrastructure</p>
          <h2 id="dev-h">One contract. Many doors.</h2>
          <p>
            REST, a TypeScript SDK, remote MCP, A2A and OAuth share the same
            authority contract, with receipts, short leases and portable proofs.
          </p>
          <ul className="tp-tags">
            {[
              "REST",
              "TypeScript SDK",
              "MCP",
              "A2A",
              "OAuth",
              "Cultural Receipts",
              "Leases",
              "Portable proofs",
            ].map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p>
            <Link href="/developers">Start with the developer guide →</Link>
          </p>
          <p className="tp-muted">
            Live ChatGPT and Claude commissioning is pending. Protocol support
            is not platform approval.
          </p>
        </section>

        <section className="tp-section" aria-labelledby="trust-h">
          <h2 id="trust-h">Trust is evidence, not adjectives.</h2>
          <p>
            Cultural evidence, place facts, your requirements, your rules and
            the final decision each keep their own source in a receipt. We
            don&apos;t invent customers, certifications, accessibility facts or
            partnerships. Preference authority only: it never books, buys, pays
            or messages.
          </p>
          <p>
            <Link href="/trust">Inspect the trust boundary →</Link> ·{" "}
            <Link href="/judge">Judge walkthrough →</Link>
          </p>
        </section>

        <section className="tp-final" aria-labelledby="final-h">
          <h2 id="final-h">Let your AI help. Keep being you.</h2>
          <div className="tp-actions tp-center">
            <Link
              className="tp-btn"
              data-variant="spectrum"
              href="/demo/margaret"
            >
              See Margaret&apos;s choice
            </Link>
            <Link className="tp-btn" data-variant="ghost" href="/dashboard">
              Open TastePolicy
            </Link>
          </div>
        </section>
      </main>
    </HumanShell>
  );
}
