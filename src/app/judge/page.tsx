import Link from "next/link";
import HumanShell from "@/components/layout/HumanShell";
import Tasteprint from "@/components/brand/Tasteprint";
import {
  CultureTiles,
  DecisionSeal,
  NeedChip,
} from "@/components/brand/primitives";
import { MARGARET } from "@/features/experience/personas";
import "@/features/home/home.css";

export const metadata = {
  title: "Judge walkthrough · TastePolicy",
  description:
    "Meet Margaret, watch Qloo understand what fits her, then watch TastePolicy decide how far the AI may go.",
};

function TechnicalEvidence() {
  return (
    <div className="tp-evidence">
      <section>
        <h2>Qloo is the cultural evidence layer</h2>
        <p>
          TastePolicy resolves cultural anchors through Qloo, verifies the
          identities being used, discovers cross-domain candidates and requests
          candidate-specific affinity and explainability. It does not recreate
          Qloo&apos;s graph or substitute generic LLM guesses for cultural evidence.
        </p>
        <p>
          <Link href="/demo/margaret">Open the Assisted Choice experience</Link>
          {" · "}
          <Link href="/arena/consumer">Inspect the engineering route</Link>
        </p>
      </section>

      <section>
        <h2>One deterministic authority contract</h2>
        <p>
          Known hard violation → <b>REJECT</b>. Critical fact missing →{" "}
          <b>ASK</b>. Required evidence unavailable → <b>UNAVAILABLE</b>.
          Requirements satisfied and the requested action within the person&apos;s
          ceiling → <b>ALLOW</b>.
        </p>
        <p>
          Qloo evidence, place facts, requirements, rules and the final decision
          remain separately attributable in Cultural Receipts.
        </p>
      </section>

      <section>
        <h2>Developer and trust surfaces</h2>
        <p>
          The same authority contract is exposed through REST, the TypeScript
          SDK, remote MCP, A2A and OAuth. Deeper controls include versioned
          policies, bounded leases, drift checks and portable proofs.
        </p>
        <p>
          <Link href="/developers">Developer platform</Link>
          {" · "}
          <Link href="/demo">Engineering demo</Link>
          {" · "}
          <Link href="/verify">Proof verifier</Link>
          {" · "}
          <Link href="/trust">Trust boundary</Link>
          {" · "}
          <Link href="/status">Live readiness</Link>
        </p>
      </section>

      <section>
        <h2>Evidence, not adjectives</h2>
        <p>
          Hosted, live, controlled, synthetic and blocked evidence are labelled
          separately. The public repository includes release, acceptance,
          benchmark and human-pilot records rather than turning unproved
          integrations or test fixtures into product claims.
        </p>
        <p>
          <a href="https://github.com/VictorCyberDev/TastePolicy/tree/main/docs/evaluation">
            Open the public evidence ledger ↗
          </a>
        </p>
      </section>

      <section>
        <h2>The execution boundary stays intact</h2>
        <p>
          ALLOW grants preference-choice authority only. It never grants payment,
          booking, messaging, account changes, private-data disclosure or legal
          authority. Recommendation is not authorization, and verifying a proof
          does not make a separate execution permissible.
        </p>
      </section>
    </div>
  );
}

export default function JudgePage() {
  return (
    <HumanShell>
      <main className="tp-landing tp-judge">
        <section aria-labelledby="judge-h">
          <p className="tp-eyebrow">Judge walkthrough · no login</p>
          <h1 id="judge-h">
            Margaret&apos;s mobility changed. Her taste didn&apos;t.
          </h1>
          <p className="tp-band-lead">
            Qloo understands what feels like Margaret. TastePolicy decides
            whether her AI may act on that understanding. Three short acts show
            the difference with real Qloo data.
          </p>
          <div className="tp-actions">
            <Link className="tp-btn" data-variant="spectrum" href="/demo/margaret">
              Start the live walkthrough
            </Link>
            <a
              className="tp-btn"
              data-variant="ghost"
              href="#technical-evidence"
            >
              Technical proof
            </a>
          </div>
        </section>

        <section aria-labelledby="act1">
          <p className="tp-eyebrow">Act 1 · The person</p>
          <h2 id="act1">Meet Margaret</h2>
          <p className="tp-band-lead">
            She still knows exactly what she enjoys. Her circumstances changed;
            her taste did not.
          </p>
          <div className="tp-split">
            <div>
              <CultureTiles
                items={MARGARET.anchors.map((a) => ({
                  name: a.query,
                  kind: a.caption,
                }))}
              />
              <ul className="tp-need-row" aria-label="Current constraints">
                {MARGARET.requirements.map((r) => (
                  <li key={r.key}>
                    <NeedChip
                      label={r.label ?? r.key}
                      status="pending"
                      detail={
                        r.importance === "hard" ? "required" : "preferred"
                      }
                    />
                  </li>
                ))}
              </ul>
              <p>
                <b>Request:</b> &ldquo;{MARGARET.quote}&rdquo;{" "}
                <b>AI permission:</b> suggest, compare and shortlist — nothing
                more.
              </p>
            </div>
            <div className="tp-center">
              <Tasteprint
                anchors={MARGARET.anchors.map((a) => a.query)}
                size={150}
              />
            </div>
          </div>
        </section>

        <section aria-labelledby="act2">
          <p className="tp-eyebrow">Act 2 · Cultural intelligence</p>
          <h2 id="act2">Watch Qloo understand what fits her</h2>
          <p>
            Qloo resolves Margaret&apos;s five cultural anchors to real entities,
            discovers cross-domain places from those signals and provides
            candidate-specific cultural evidence. TastePolicy keeps that evidence
            separate from accessibility, walking time, noise, price and every
            other real-world requirement.
          </p>
          <div className="tp-trio tp-compare">
            <article>
              <h3>Generic AI</h3>
              <p>
                A plausible suggestion. It can sound personal without grounded
                cultural evidence.
              </p>
            </article>
            <article>
              <h3>Qloo</h3>
              <p>
                The same choice becomes culturally grounded: this candidate fits
                Margaret&apos;s cross-domain taste, with evidence for why.
              </p>
            </article>
            <article data-us="true">
              <h3>TastePolicy</h3>
              <p>
                Now ask the question recommendation alone cannot answer: does it
                work for her real needs, and may the AI go this far with it?
              </p>
            </article>
          </div>
          <p className="tp-muted">
            Place photos, maps, street sequences and 360° media are presentation.
            They never become factual evidence merely because they look relevant.
          </p>
        </section>

        <section aria-labelledby="act3">
          <p className="tp-eyebrow">Act 3 · Agency</p>
          <h2 id="act3">Watch TastePolicy know when to stop</h2>
          <ol className="tp-steps">
            <li>
              Qloo finds a strong cultural match. Margaret still requires a
              step-free entrance.
            </li>
            <li>
              If that critical fact is unknown, TastePolicy returns <b>ASK</b>
              instead of guessing: &ldquo;This feels like you, but I need to confirm
              the entrance.&rdquo;
            </li>
            <li>
              Answer the missing fact. The same evaluator checks the same
              candidate again.
            </li>
            <li>
              If the requirements are satisfied, the result can become{" "}
              <b>ALLOW</b> — but only as far as Margaret&apos;s saved ceiling:{" "}
              <b>SHORTLIST</b>.
            </li>
            <li>
              If the agent tries to present that option as the final choice, the
              authority ceiling forces <b>ASK</b> again.
            </li>
            <li>
              &ldquo;Why this happened&rdquo; separates Qloo evidence, place facts,
              Margaret&apos;s requirements, her rules and the final decision.
            </li>
          </ol>
          <div className="tp-seals">
            <DecisionSeal outcome="ASK" />
            <DecisionSeal outcome="ALLOW" />
          </div>
          <p className="tp-muted">
            A known hard violation becomes REJECT. If required evidence cannot be
            obtained, the result is UNAVAILABLE. Two concise variants show the
            same contract beyond Margaret:{" "}
            <Link href="/experience/sensory-aware">sensory-aware</Link> and{" "}
            <Link href="/experience/low-energy">low-energy</Link>.
          </p>
        </section>

        <section aria-labelledby="thesis-h">
          <p className="tp-eyebrow">The thesis</p>
          <h2 id="thesis-h">Taste intelligence is not permission.</h2>
          <p className="tp-band-lead">
            Qloo answers <b>what fits this person?</b> TastePolicy answers{" "}
            <b>may this agent go this far with that fit, for this person, now?</b>
          </p>
          <p>
            <Link className="tp-btn" data-variant="spectrum" href="/demo/margaret">
              Try the live experience
            </Link>
          </p>
        </section>

        <section id="technical-evidence" aria-labelledby="evidence-h">
          <p className="tp-eyebrow">Optional deeper track</p>
          <h2 id="evidence-h">Inspect the technical proof</h2>
          <p>
            The product idea is complete above. Open this section only if you
            want the underlying authority contracts, developer surfaces and
            evidence trail.
          </p>
          <details>
            <summary>Show technical evidence</summary>
            <TechnicalEvidence />
          </details>
        </section>
      </main>
    </HumanShell>
  );
}
