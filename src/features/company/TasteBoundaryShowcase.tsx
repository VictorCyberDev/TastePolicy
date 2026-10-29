"use client";

import { useState } from "react";

const scenarios = {
  ALLOW: {
    score: 92,
    image: "/taste/taste-3.svg",
    title: "It fits — and it stays within your boundary.",
    kicker: "Weekend stay · shortlist only",
    rule: "Action ceiling: SHORTLIST",
    reason:
      "Qloo finds a strong cultural fit and the requested action stays inside the saved authority ceiling.",
    marker: "↗",
  },
  ASK: {
    score: 96,
    image: "/taste/taste-1.svg",
    title: "It fits. One fact is still missing.",
    kicker: "Design hotel · price unknown",
    rule: "Budget rule: max $50",
    reason:
      "The cultural fit is strong, but the price is missing. TastePolicy pauses instead of inventing permission.",
    marker: "?",
  },
  REJECT: {
    score: 99,
    image: "/taste/taste-5.svg",
    title: "99% taste match. Still no.",
    kicker: "Cultural stay · explicitly excluded",
    rule: "Saved rule: NEVER THIS CANDIDATE",
    reason:
      "A hard user boundary outranks affinity. Qloo can say this fits your taste; it cannot erase what you said never to choose.",
    marker: "×",
  },
  UNAVAILABLE: {
    score: null,
    image: "/taste/taste-7.svg",
    title: "No evidence means no decision.",
    kicker: "Provider evidence unavailable",
    rule: "Required evidence: Qloo cultural signal",
    reason:
      "If required cultural evidence cannot be obtained, TastePolicy reports UNAVAILABLE instead of guessing dislike or silently continuing.",
    marker: "…",
  },
} as const;

type Scenario = keyof typeof scenarios;

export default function TasteBoundaryShowcase() {
  const [scenario, setScenario] = useState<Scenario>("REJECT");
  const active = scenarios[scenario];

  return (
    <section
      className="submission-showcase"
      aria-label="Interactive TastePolicy boundary example"
    >
      <div className="submission-showcase-topline">
        <span>LIVE PRODUCT IDEA</span>
        <span>QLOO TASTE → USER RULES → AUTHORITY</span>
      </div>

      <div className="submission-showcase-visual" data-decision={scenario}>
        <div className="submission-taste-side">
          <img
            src={active.image}
            alt="Authored TastePolicy cultural illustration"
          />
          <div className="submission-image-scrim" />
          <div className="submission-taste-copy">
            <span className="submission-chip">Qloo cultural evidence</span>
            <p>{active.kicker}</p>
            <strong>
              {active.score === null
                ? "Evidence unavailable"
                : `${active.score}% cultural fit`}
            </strong>
          </div>
        </div>

        <div className="submission-boundary-rail" aria-hidden="true">
          <span>TASTE</span>
          <i />
          <span>PERMISSION</span>
        </div>

        <div className="submission-authority-side">
          <div className="submission-decision-mark" aria-hidden="true">
            {active.marker}
          </div>
          <div>
            <span className="submission-decision-label">{scenario}</span>
            <h2>{active.title}</h2>
            <p className="submission-rule">{active.rule}</p>
            <p>{active.reason}</p>
          </div>
        </div>
      </div>

      <div
        className="submission-scenario-tabs"
        aria-label="Try another decision state"
      >
        {(Object.keys(scenarios) as Scenario[]).map((item) => (
          <button
            key={item}
            type="button"
            aria-label={item}
            aria-pressed={scenario === item}
            data-decision={item}
            onClick={() => setScenario(item)}
          >
            <span>{item}</span>
            <small>
              {item === "ALLOW"
                ? "Fits + permitted"
                : item === "ASK"
                  ? "Fits + missing fact"
                  : item === "REJECT"
                    ? "99% fit + hard boundary"
                    : "No evidence, no guess"}
            </small>
          </button>
        ))}
      </div>

      <p className="submission-showcase-note">
        The cultural fit is illustrative on this marketing card. The public
        Consumer Arena uses real Qloo requests and exposes the captured
        evidence.
      </p>
    </section>
  );
}
