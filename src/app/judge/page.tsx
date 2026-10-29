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
    "Three acts, no login: meet Margaret, watch Qloo understand her, watch TastePolicy protect her agency. Technical evidence follows.",
};

function TechnicalEvidence() {
  return (
    <div className="tp-evidence">
      <section>
        <h2>Begin with the real product</h2>
        <p>
          The Consumer Arena resolves five public cultural identities through
          Qloo, discovers real candidates and shows candidate-specific cultural
          evidence. No founder key or private reviewer account is needed for
          this public path. Provider failures remain visible.
        </p>
        <p>
          <Link className="company-small-cta" href="/arena/consumer">
            Start with real Qloo evidence ↗
          </Link>
          {" · "}
          <Link href="/status">Check current readiness</Link>
        </p>
      </section>
      <section>
        <h2>A concise route through the boundary</h2>
        <ol className="company-judge-steps">
          <li>
            <strong>1 · Cultural understanding</strong>Review the five resolved
            cross-domain identities before using them. Qloo supplies the
            cultural relationship; TastePolicy does not invent the graph.
          </li>
          <li>
            <strong>2 · Candidate selection</strong>Discover places, review an
            actual candidate and inspect its identity. A candidate must be
            distinct from the input anchors.
          </li>
          <li>
            <strong>3 · Explicit authority</strong>Inspect the saved context and
            rules alongside the cultural evidence. Memory is not permission.
          </li>
          <li>
            <strong>4 · ALLOW</strong>Evaluate a qualifying candidate and show
            the actual outcome. Continue only within the returned
            subjective-action ceiling. A strong score cannot promise ALLOW in
            advance.
          </li>
          <li>
            <strong>5 · ASK</strong>Add an applicable budget and leave its price
            unresolved, or request an action above the saved ceiling. Show the
            actual question; asking is not approval.
          </li>
          <li>
            <strong>6 · REJECT</strong>Save an exact exclusion and evaluate that
            same choice. Affinity cannot erase an applicable hard boundary.
          </li>
          <li>
            <strong>7 · UNAVAILABLE</strong>If required evidence fails, pause
            visibly. Never call an unavailable provider a negative preference.
            Fault-injection demonstrations in the engineering route are labeled;
            they are not a real Qloo outage.
          </li>
          <li>
            <strong>8 · Cultural Receipt</strong>Inspect the captured Qloo
            provenance, alignment evidence, explicit rules and decision.
            Recorded evidence is distinguished from a fresh provider request.
          </li>
          <li>
            <strong>9 · Policy change</strong>
            <Link href="/account/rules">
              Authenticated account controls
            </Link>{" "}
            let an owner preview and publish a new rule/action ceiling. These
            steps require ordinary signup, rather than hidden founder
            configuration.
          </li>
          <li>
            <strong>10 · Lease and drift</strong>
            <Link href="/account/leases">Inspect bounded authority</Link>,
            checkpoints and revocation. Changed candidate/context commitments
            require a fresh check; an old ALLOW is not permission for a new
            choice.
          </li>
          <li>
            <strong>11 · Portable proof</strong>
            <Link href="/verify">Verify an actually issued proof</Link> and
            current status. Do not paste invented proof data. Verification is
            not authorization.
          </li>
          <li>
            <strong>12 · ChatGPT</strong>The remote MCP and Authority Card are
            implemented. Real TastePolicy tool invocation in ChatGPT is still
            unproved; a prompt-only benchmark is not an integration demo.
          </li>
          <li>
            <strong>13 · Claude</strong>A custom connector reached OAuth
            consent, but actual invocation is unproved. Directory submission on
            the inspected Free account requires a paid plan. No approval or
            publication is claimed.
          </li>
          <li>
            <strong>14 · Developer platform</strong>
            <Link href="/developers">
              Sign up and create a scoped credential
            </Link>
            . REST, OAuth, MCP, A2A and the packaged SDK share the authority
            contracts. Keep credentials in server secrets.
          </li>
          <li>
            <strong>15 · Company and evidence</strong>
            <Link href="/product">Inspect the product</Link>,{" "}
            <Link href="/pricing">plan states</Link> and{" "}
            <Link href="/trust">trust material</Link>. Pricing is a hypothesis;
            no paying customers, commercial Qloo permission or certifications
            are invented.
          </li>
        </ol>
      </section>
      <section>
        <h2>What a short demonstration can truthfully prove</h2>
        <p>
          Focus the first two minutes on Qloo discovery, one real decision, an
          applicable constraint and the captured receipt. Timing depends on
          network/provider behavior and has not been established by this page.
          Account policy, lease and proof steps are an optional deeper route.
          The public <Link href="/demo">engineering demonstration</Link>{" "}
          provides separate labeled workflows.
        </p>
        <p>
          Exact release, acceptance and benchmark records are available in the{" "}
          <a href="https://github.com/VictorCyberDev/TastePolicy/tree/main/docs/evaluation">
            public evidence ledger
          </a>
          . The original human pilot exposed meaningful missed-ASK and
          unsafe-autonomy errors; synthetic contract coverage does not remove
          those caveats.
        </p>
      </section>
      <section>
        <h2>The execution boundary stays intact</h2>
        <p>
          ALLOW never grants payment, booking, messaging, account changes,
          private-data disclosure or legal authority. Recommendation is not
          authorization. A verified receipt or proof does not make a separate
          execution permissible.
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
            Three short acts show the whole idea with real Qloo data. A
            technical evidence track follows for the deeper infrastructure.
            Everything in the three acts works anonymously.
          </p>
          <p>
            <Link className="tp-btn" data-variant="spectrum" href="/experience">
              Start the live walkthrough
            </Link>
          </p>
        </section>

        <section aria-labelledby="act1">
          <p className="tp-eyebrow">Act 1</p>
          <h2 id="act1">Meet Margaret</h2>
          <p className="tp-band-lead">
            Margaret still knows exactly what she enjoys. Her physical needs
            changed. Her taste didn&apos;t.
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
                <b>AI permission:</b> suggest, compare and shortlist, nothing
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
          <p className="tp-eyebrow">Act 2</p>
          <h2 id="act2">Watch Qloo understand her</h2>
          <p>
            In the experience, Qloo resolves her five anchors to real entities
            (you confirm each match), then discovers real places that fit her
            taste, then shows them: real photographs labelled by how they relate
            to the place, a map and street sequence from open data
            (OpenStreetMap, KartaView, Panoramax), and 360° where it genuinely
            exists. Pictures are presentation, never evidence. Three ways to
            answer the same evening:
          </p>
          <div className="tp-trio tp-compare">
            <article>
              <h3>Generic AI</h3>
              <p>
                A popular, accessible-sounding suggestion. No cultural
                reasoning.
              </p>
            </article>
            <article>
              <h3>Qloo</h3>
              <p>
                A culturally relevant place, ranked by real cross-domain
                affinity.
              </p>
            </article>
            <article data-us="true">
              <h3>TastePolicy</h3>
              <p>
                Culturally relevant, compatible with her real needs, and bounded
                by explicit authority.
              </p>
            </article>
          </div>
        </section>

        <section aria-labelledby="act3">
          <p className="tp-eyebrow">Act 3</p>
          <h2 id="act3">Watch TastePolicy protect her agency</h2>
          <ol className="tp-steps">
            <li>
              Strong cultural fit, and a critical requirement: a step-free
              entrance.
            </li>
            <li>
              The evidence is unknown, so the answer is <b>ASK</b>: &ldquo;This
              feels like you, but I need to confirm the entrance.&rdquo;
            </li>
            <li>
              Answer the missing question. TastePolicy re-evaluates the same
              choice.
            </li>
            <li>
              <b>ALLOW</b>, but only as far as <b>SHORTLIST</b>.
            </li>
            <li>
              Press &ldquo;Simulate: the agent tries to present it as the final
              choice&rdquo;. The ceiling forces <b>ASK</b> again.
            </li>
            <li>
              Open &ldquo;Why this happened&rdquo;: Qloo, place facts, her
              requirements, her rules and the decision, each with its own
              source.
            </li>
          </ol>
          <div className="tp-seals">
            <DecisionSeal outcome="ASK" />
            <DecisionSeal outcome="ALLOW" />
          </div>
          <p className="tp-muted">
            If a place provider already confirms the entrance, you may see ALLOW
            straight away. That is correct behaviour; press &ldquo;Show me
            another&rdquo; or answer &ldquo;No, there are steps&rdquo; on a
            place to see a hard REJECT. Two concise variants prove generality:{" "}
            <Link href="/experience/sensory-aware">sensory-aware</Link> and{" "}
            <Link href="/experience/low-energy">low-energy</Link>.
          </p>
        </section>

        <section aria-labelledby="evidence-h">
          <p className="tp-eyebrow">Technical evidence</p>
          <h2 id="evidence-h">Under the three acts</h2>
          <p>
            REJECT, UNAVAILABLE, Cultural Receipts, policy updates, leases,
            drift, proofs, MCP, A2A, SDK, OAuth, ChatGPT/Claude integration
            status, trust and the developer platform. Recorded evidence and live
            paths are clearly distinguished below.
          </p>
          <TechnicalEvidence />
        </section>
      </main>
    </HumanShell>
  );
}
