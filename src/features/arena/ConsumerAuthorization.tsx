"use client";

import { useEffect, useRef, useState } from "react";
import type { CulturalReceipt, QlooEntity } from "@/types/domain";
import type { InteractiveAuthorization } from "@/lib/interactive/types";
import type { StateEvaluation } from "@/lib/state/types";
import type { useConsumerAuthorization } from "./useConsumerAuthorization";

type Authorization = ReturnType<typeof useConsumerAuthorization>;
export type Run = (
  label: string,
  operation: () => Promise<void>,
  checking?: string,
) => Promise<void>;

/** The single clarification question, shown on its own ASK screen. */
export function ClarifyPanel({
  auth,
  evaluation,
  interaction,
  busy,
  run,
}: {
  auth: Authorization;
  evaluation: StateEvaluation;
  interaction: InteractiveAuthorization | null;
  busy: boolean;
  run: Run;
}) {
  const [amount, setAmount] = useState("");
  const priceInput = useRef<HTMLInputElement>(null);
  const plan = auth.plan;
  useEffect(() => {
    if (!busy && plan?.status === "ACTIONABLE") priceInput.current?.focus();
  }, [busy, plan?.planId, plan?.status]);

  if (plan?.status !== "ACTIONABLE" || !plan.factor) {
    return (
      <div className="clarifyPanel">
        <p className="stageSupport">
          {plan?.status === "STALE"
            ? "Your saved rules changed. Refresh them before checking again."
            : "Your concierge still needs an explicit answer. Nothing has been assumed."}
        </p>
        <button
          className="primaryAction"
          disabled={busy}
          onClick={() =>
            void run("Finding the next question…", () =>
              auth.question(evaluation, interaction ?? undefined),
            )
          }
        >
          Show the question
        </button>
      </div>
    );
  }
  const factor = plan.factor;
  return (
    <div className="clarifyPanel">
      <h2 className="questionTitle">
        {factor.answerSchema === "MONEY_OR_UNKNOWN"
          ? "What does this place cost?"
          : "Would this choice work for you in this situation?"}
      </h2>
      {factor.answerSchema === "MONEY_OR_UNKNOWN" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              "Checking your answer…",
              () =>
                auth.answer({
                  kind: "PRICE",
                  amount: Number(amount),
                  currency: factor.currency!,
                }),
              "Checking your answer against your rule…",
            );
          }}
        >
          <label>
            Price in {factor.currency}
            <input
              ref={priceInput}
              type="number"
              inputMode="decimal"
              required
              min="0"
              max="1000000"
              step="any"
              value={amount}
              disabled={busy}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <div className="stageActions">
            <button
              className="primaryAction"
              disabled={busy || amount === ""}
              type="submit"
            >
              Use this price
            </button>
            <button
              type="button"
              className="quietAction"
              disabled={busy}
              onClick={() =>
                void run(
                  "Keeping the missing price explicit…",
                  () => auth.answer({ kind: "UNKNOWN" }),
                  "Checking your answer against your rule…",
                )
              }
            >
              I don’t know
            </button>
          </div>
        </form>
      ) : (
        <div className="stageActions stacked">
          {(
            [
              ["ACCEPTABLE", "Yes, for this choice"],
              ["UNACCEPTABLE", "No, not this choice"],
              ["STILL_UNSURE", "I’m still unsure"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={value === "ACCEPTABLE" ? "primaryAction" : undefined}
              disabled={busy}
              onClick={() =>
                void run(
                  "Checking your explicit answer…",
                  () => auth.answer({ kind: "DISPOSITION", value }),
                  "Checking your answer against your rule…",
                )
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <p className="stageFine">
        Your answer applies to this choice only. Saved preferences don’t change.
      </p>
    </div>
  );
}

/** Demo-only rule setup. Collapsed; it never appears on a decision screen. */
export function DemoBoundaries({
  auth,
  candidate,
  busy,
  run,
  runPlain,
  locked,
}: {
  auth: Authorization;
  candidate: QlooEntity;
  busy: boolean;
  run: Run;
  runPlain: Run;
  locked: boolean;
}) {
  const [rehearsal, setRehearsal] = useState(false);
  return (
    <details className="demoBoundaries">
      <summary>Try a boundary</summary>
      <p className="stageFine">
        Saves a rule in this temporary demo profile. A different saved profile
        is never overwritten.
      </p>
      <div className="stageActions stacked">
        <button
          disabled={busy || locked}
          onClick={() => {
            auth.clearEvaluation();
            void run(
              "Saving your $100 budget and checking this choice…",
              () => auth.budget(candidate),
              "Saving your rule, then checking it…",
            );
          }}
        >
          I have a $100 budget
        </button>
        <button
          disabled={busy || locked}
          onClick={() => {
            auth.clearEvaluation();
            void run(
              "Saving your explicit exclusion…",
              () => auth.exclude(candidate),
              "Saving your rule, then checking it…",
            );
          }}
        >
          Never choose this place for me
        </button>
        <button disabled={busy} onClick={() => setRehearsal((value) => !value)}>
          What if evidence is missing?
        </button>
        {auth.state && (
          <button
            disabled={busy}
            onClick={() => {
              auth.clearEvaluation();
              void runPlain("Reading your saved rules…", auth.refresh);
            }}
          >
            Refresh my saved rules
          </button>
        )}
      </div>
      {rehearsal && (
        <section
          className="humanDecision consumerRehearsal"
          data-decision="UNAVAILABLE"
          aria-label="Demo rehearsal"
          aria-live="polite"
        >
          <p>Demo rehearsal · No live outage is claimed</p>
          <h2>I don’t know enough yet</h2>
          <p>Missing taste evidence is not the same as disliking this.</p>
          <p>No Qloo call · No authorization · No fabricated receipt</p>
          <span className="machineOutcome">Rehearsal only: UNAVAILABLE</span>
        </section>
      )}
    </details>
  );
}

/** Technical evidence stays behind progressive disclosure. */
export function EvidencePanel({
  auth,
  evaluation,
  interaction,
  cultural,
}: {
  auth: Authorization;
  evaluation: StateEvaluation | null;
  interaction: InteractiveAuthorization | null;
  cultural: CulturalReceipt | null;
}) {
  return (
    <details className="stageEvidence">
      <summary>Why this?</summary>
      {cultural ? (
        <div className="whyPanel">
          <p>
            <strong>
              {interaction ? "CAPTURED QLOO EVIDENCE" : "LIVE QLOO"}
            </strong>{" "}
            candidate-specific cultural evidence
            {interaction
              ? " — reused with your explicit answer; no new Qloo request."
              : "."}
          </p>
          <p>
            Affinity {cultural.alignmentScore.toFixed(4)} ·{" "}
            {cultural.qlooEvidence.scale}. This is not confidence or preference
            probability.
          </p>
          {cultural.explainability.status !== "unavailable" && (
            <ul>
              {cultural.explainability.contributions.slice(0, 3).map((item) => (
                <li key={item.signalId}>
                  {cultural.inputSignals.find(
                    (signal) => signal.id === item.signalId,
                  )?.name ?? "Reviewed signal"}
                  : {item.score.toFixed(3)}
                </li>
              ))}
            </ul>
          )}
          <p className="technicalNote">
            Provider: Qloo · {cultural.qlooEvidence.provenance.endpoint} ·
            receipt {cultural.receiptId}
          </p>
        </div>
      ) : (
        <p className="stageFine">
          No candidate-specific Qloo evidence is held for this screen.
        </p>
      )}
      {auth.state && (
        <details className="consumerDeveloper">
          <summary>Developer details</summary>
          <p>
            SELF · State version {auth.state.stateVersion}. Experimental policy;
            no transaction authority.
          </p>
          {interaction && (
            <p>
              Original decision:{" "}
              {interaction.originalEvaluation.decision.outcome} · Final
              interaction decision: {interaction.finalDecision.outcome} ·
              Captured explicit answer.
            </p>
          )}
          <pre>
            {JSON.stringify(
              {
                evaluation,
                interaction,
                plan: evaluation ? auth.plan : null,
                repair: auth.repair,
                savedRules: auth.state.entries.filter(
                  (entry) => entry.kind !== "EXPLICIT_LIKE",
                ),
              },
              null,
              2,
            )}
          </pre>
        </details>
      )}
    </details>
  );
}
