"use client";
import { useState } from "react";
const examples = {
  ALLOW: [
    "Within your boundary",
    "Shortlist a culturally aligned stay",
    "SHORTLIST",
    "SHORTLIST",
    "The reviewed cultural match and the requested action fit the example policy. Continue only with a shortlist.",
  ],
  ASK: [
    "Your confirmation matters",
    "Present a stay as selected",
    "PRESENT_AS_SELECTED",
    "SHORTLIST",
    "The agent requested more autonomy than this example policy allows. Ask the owner; do not silently select.",
  ],
  REJECT: [
    "Your rule holds",
    "Shortlist an excluded candidate",
    "SHORTLIST",
    "SHORTLIST",
    "An explicit candidate exclusion blocks this choice. Strong cultural affinity cannot override it.",
  ],
  UNAVAILABLE: [
    "Evidence is missing",
    "Shortlist without fresh Qloo evidence",
    "SHORTLIST",
    "SHORTLIST",
    "The evidence provider is unavailable. Pause the choice. Missing evidence does not mean dislike.",
  ],
} as const;
export default function AuthorityPreview() {
  const [decision, setDecision] = useState<keyof typeof examples>("ALLOW");
  const [title, action, requested, ceiling, reason] = examples[decision];
  return (
    <section
      className="authority-preview"
      aria-label="Illustrative Authority Card"
    >
      <div className="authority-card-top">
        <span className="company-eyebrow">AUTHORITY CARD</span>
        <span className="company-caption">
          Interactive example · no live decision
        </span>
      </div>
      <div className="authority-tabs" aria-label="Example decision">
        {(Object.keys(examples) as (keyof typeof examples)[]).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={decision === d}
            data-decision={d}
            onClick={() => setDecision(d)}
          >
            {d}
          </button>
        ))}
      </div>
      <div aria-live="polite" aria-atomic="true" className="authority-live">
        <div className="authority-decision" data-decision={decision}>
          <span aria-hidden="true">
            {decision === "ALLOW"
              ? "↗"
              : decision === "ASK"
                ? "?"
                : decision === "REJECT"
                  ? "×"
                  : "…"}
          </span>
          <div>
            <p>{decision}</p>
            <h2>{title}</h2>
          </div>
        </div>
        <dl className="authority-details">
          <div>
            <dt>Requested action</dt>
            <dd>{action}</dd>
          </div>
          <div>
            <dt>Agent / subject</dt>
            <dd>Travel assistant / example owner</dd>
          </div>
          <div>
            <dt>Candidate / context</dt>
            <dd>Example cultural stay / weekend discovery</dd>
          </div>
        </dl>
        <div className="authority-evidence">
          <span>Qloo cultural evidence</span>
          <strong>
            {decision === "UNAVAILABLE"
              ? "Unavailable"
              : "Illustrative affinity signal"}
          </strong>
          <span aria-hidden="true" className="authority-evidence-bar">
            <i />
          </span>
          <small>Affinity is not authorization.</small>
        </div>
        <div className="authority-rungs">
          <div>
            <span>Requested</span>
            <code>{requested}</code>
          </div>
          <span aria-hidden="true">│</span>
          <div>
            <span>Your ceiling</span>
            <code>{ceiling}</code>
          </div>
        </div>
        <p className="authority-reason">{reason}</p>
        <p className="company-caption">
          Receipt: illustrative only · Lease: not issued · Proof: not issued
        </p>
      </div>
      <p className="authority-footnote">
        No payment, booking, messaging, account or legal authority. A verified
        proof does not grant permission.
      </p>
    </section>
  );
}
