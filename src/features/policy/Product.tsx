import Link from "next/link";
import RuleBoundary from "./RuleBoundary";
import "./policy.css";

const STEPS: [string, string][] = [
  ["An agent proposes a choice", "A hotel, a record, a brand. It asks first."],
  [
    "Qloo supplies taste",
    "Cultural evidence about the choice and about you, from your reviewed anchors.",
  ],
  [
    "The Boundary sits between taste and permission",
    "Taste can suggest. Only your rules can permit.",
  ],
  [
    "TastePolicy decides",
    "Allow, ask, reject, or “can’t tell”. Missing evidence is never a no.",
  ],
  [
    "The agent gets a result it can prove",
    "A short permission for one choice, which ends the moment anything it relied on changes.",
  ],
  [
    "Execution is a separate question",
    "Preference authority complete. Execution authority required separately.",
  ],
];
export default function Product() {
  return (
    <main className="policyPlane">
      <p className="help">TastePolicy</p>
      <h1>Your taste. Your rules. Any agent.</h1>
      <p>
        Qloo gives agents taste. TastePolicy gives that taste authority
        boundaries. It answers one question for any agent: is this subjective
        choice sufficiently justified for this person, in this context, right
        now?
      </p>
      <RuleBoundary level="CONFIRM_ABOVE_LIMIT" />
      <p className="help">
        It does not buy, book or pay, and it is not an access-control system. It
        decides whether a taste-based choice is justified.
      </p>
      <section aria-labelledby="how">
        <h2 id="how">How a choice is decided</h2>
        <ol>
          {STEPS.map(([t, d]) => (
            <li key={t}>
              <strong>{t}.</strong> {d}
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="you">
        <h2 id="you">What you control</h2>
        <ul>
          <li>
            <Link href="/account/rules">Your rules</Link>: when agents may act,
            when they must ask, how fresh your taste information must be.
          </li>
          <li>
            <Link href="/account/leases">What agents may do now</Link>: the
            permissions in force, and one button to stop them all.
          </li>
          <li>
            <Link href="/account">Connected assistants</Link>: disconnect any of
            them at any time.
          </li>
          <li>
            <Link href="/verify">Check a proof</Link>: anyone can verify what an
            agent shows them, without an account.
          </li>
        </ul>
      </section>
      <p>
        <Link href="/developers">For developers →</Link>
      </p>
    </main>
  );
}
