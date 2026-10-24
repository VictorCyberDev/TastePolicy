import Link from "next/link";
import "./policy.css";

const STAGES: [string, string, string][] = [
  [
    "Connect",
    "REST, SDK, remote MCP and A2A over one contract. OAuth account linking for hosted assistants; developer keys for your own code.",
    "docs/developer/integrations.md",
  ],
  [
    "Control",
    "Owner rules: freshness, autonomy ceilings, temporary permissions. Every answer carries the rule that decided it.",
    "docs/product/m7-subjective-policy-control-plane.md",
  ],
  [
    "Enforce",
    "Short leases for one choice. ASK is typed: an authority confirmation can wait for the owner, a missing fact needs a new evaluation.",
    "docs/product/m8-preference-authority-leases.md",
  ],
  [
    "Verify",
    "Selective-disclosure proofs any party can check, with epochs that end when authority ends. Run the Compatible v1 suite.",
    "docs/conformance/tastepolicy-compatible.md",
  ],
];
export default function Developers() {
  return (
    <main className="policyPlane">
      <p className="help">TastePolicy for developers</p>
      <h1>Subjective authority for your agents</h1>
      <p>
        Ask before an agent acts on taste. Get a decision, a reason, and a
        permission that ends when the facts change.
      </p>
      <ol>
        {STAGES.map(([t, d, doc]) => (
          <li key={t}>
            <h2>{t}</h2>
            <p>{d}</p>
            <p className="help">Docs: {doc}</p>
          </li>
        ))}
      </ol>
      <section aria-labelledby="start">
        <h2 id="start">Start</h2>
        <ul>
          <li>
            OpenAPI at <code>/api/v1/openapi</code>, MCP at{" "}
            <code>/api/mcp</code>, A2A card at{" "}
            <code>/.well-known/agent-card.json</code>.
          </li>
          <li>
            Offline sandbox in the SDK: all four decisions, no account needed.
          </li>
          <li>
            <Link href="/verify">Verify a proof</Link>; issuer metadata at{" "}
            <code>/.well-known/tastepolicy-issuer</code>.
          </li>
        </ul>
      </section>
      <p>
        Authority is cultural preference only. No purchase, payment, booking or
        execution authority is ever implied.
      </p>
      <p>
        <Link href="/product">← Product</Link>
      </p>
    </main>
  );
}
