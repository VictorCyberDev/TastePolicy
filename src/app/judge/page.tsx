import Link from "next/link";
import CompanyDocument from "@/features/company/CompanyDocument";
export const metadata = {
  title: "Judge walkthrough · TastePolicy",
  description:
    "See Qloo cultural evidence, explicit user boundaries and bounded authority. Live paths and recorded engineering evidence remain distinct.",
};
export default function JudgePage() {
  return (
    <CompanyDocument
      eyebrow="JUDGE WALKTHROUGH"
      title="Taste is a signal. Your rules draw the boundary."
      lead="Qloo gives agents taste. TastePolicy gives that taste authority boundaries. Start with a public live path; account controls and recorded evidence are clearly marked."
    >
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
    </CompanyDocument>
  );
}
