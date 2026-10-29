import type { Metadata } from "next";
import Link from "next/link";
import HumanShell from "@/components/layout/HumanShell";
import BoundaryRibbon from "@/components/brand/BoundaryRibbon";
import Product from "@/features/policy/Product";
import "@/features/home/home.css";

export const metadata: Metadata = {
  title: "Product · TastePolicy",
  description:
    "Every recommendation is a decision about a person. Understand, respect, ask, limit and prove, then the architecture underneath.",
};
const VERBS: [string, string, string][] = [
  [
    "Understand",
    "Qloo helps identify what culturally fits.",
    "Cultural evidence, only about taste.",
  ],
  [
    "Respect",
    "Context and requirements determine what genuinely works in this person's current life.",
    "Needs as rules like walking_minutes <= 10. Never diagnoses.",
  ],
  [
    "Ask",
    "Unknown facts remain unknown. TastePolicy asks instead of inventing.",
    "Missing critical fact: ASK.",
  ],
  [
    "Limit",
    "The agent can only go as far as the user permitted.",
    "Above the ceiling: ASK, even for a good choice.",
  ],
  [
    "Prove",
    "Receipts show why the decision happened, source by source.",
    "Qloo, place provider, you, your rules, the evaluator.",
  ],
];
export default function Page() {
  return (
    <HumanShell active="/product">
      <section className="tp-landing tp-product-open" aria-labelledby="prod-h">
        <div className="tp-section">
          <p className="tp-eyebrow">Product</p>
          <h1 id="prod-h">
            Every recommendation is a decision about a person.
          </h1>
          <p className="tp-band-lead">
            TastePolicy is personal agency infrastructure for AI. It keeps
            preference, evidence, requirements, permission and action apart, so
            an assistant can help without replacing the person.
          </p>
          <BoundaryRibbon
            state="discover"
            caption="Taste, context, boundary, decision"
          />
          <ol className="tp-verbs">
            {VERBS.map(([v, line, tech]) => (
              <li key={v}>
                <h2>{v}</h2>
                <p>{line}</p>
                <p className="tp-muted">{tech}</p>
              </li>
            ))}
          </ol>
          <p>
            <Link className="tp-btn" data-variant="spectrum" href="/experience">
              See it with Margaret
            </Link>
          </p>
          <h2 className="tp-under">Under the hood</h2>
          <p className="tp-muted">
            The deterministic architecture, unchanged for developers and
            auditors.
          </p>
        </div>
      </section>
      <Product />
    </HumanShell>
  );
}
