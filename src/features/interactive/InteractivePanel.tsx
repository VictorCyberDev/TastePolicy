"use client";
import { useRef, useState } from "react";
import "./InteractivePanel.css";
import type { StateEvaluation } from "@/lib/state/types";
import type {
  Answer,
  ClarificationPlan,
  InteractiveAuthorization,
  RepairResult,
} from "@/lib/interactive/types";
const messages: Record<string, string> = {
  STATE_VERSION_CONFLICT:
    "State changed. Refresh and explicitly evaluate again; this interaction cannot be rebased automatically.",
  SESSION_EXPIRED: "Demo session expired. Start a new temporary profile.",
  IDEMPOTENCY_KEY_CONFLICT:
    "Retry input changed. Review the interaction before resubmitting.",
  INVALID_INPUT: "Review the answer and required currency.",
  persistence_not_configured:
    "Interactive authorization requires configured PostgreSQL persistence.",
  RATE_LIMITED: "Demo operation limit reached.",
};
export default function InteractivePanel({
  evaluation,
  onEvaluateRepair,
  onClarified,
}: {
  evaluation: StateEvaluation;
  onClarified?: (value: InteractiveAuthorization) => void;
  onEvaluateRepair: (v: StateEvaluation) => Promise<void>;
}) {
  const [plan, setPlan] = useState<ClarificationPlan | null>(null),
    [answer, setAnswer] = useState<InteractiveAuthorization | null>(null),
    [repair, setRepair] = useState<RepairResult | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [amount, setAmount] = useState(""),
    [replayed, setReplayed] = useState(false);
  const keys = useRef(new Map<string, string>());
  async function call<T>(
    operation: string,
    payload: Record<string, unknown>,
    idempotent = false,
  ): Promise<T> {
    const fingerprint = operation + JSON.stringify(payload);
    if (idempotent && !keys.current.has(fingerprint))
      keys.current.set(fingerprint, crypto.randomUUID());
    const response = await fetch("/api/state/interactive/" + operation, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        ...(idempotent
          ? { idempotencyKey: keys.current.get(fingerprint) }
          : {}),
      }),
    });
    const data = await response.json();
    if (!response.ok || data.status !== "available")
      throw Error(
        messages[data.code ?? data.reason] ??
          "Interaction unavailable. No cultural authorization was fabricated.",
      );
    return data.data;
  }
  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    setNotice(label);
    try {
      await fn();
      setNotice("Captured result ready. Taste State remains unchanged.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Interaction unavailable.");
    } finally {
      setBusy(false);
    }
  }
  async function requestPlan() {
    const next = await call<ClarificationPlan>("plan", {
      evaluationId: evaluation.evaluationId,
      ...(answer ? { parentClarificationId: answer.interactionId } : {}),
    });
    setPlan(next);
    setAmount("");
  }
  async function submit(value: Answer) {
    await run("Applying explicit answer to captured evidence", async () => {
      const result = await call<InteractiveAuthorization>(
        "answer",
        {
          evaluationId: evaluation.evaluationId,
          expectedStateVersion: evaluation.stateVersion,
          planId: plan!.planId,
          ...(answer ? { parentClarificationId: answer.interactionId } : {}),
          answer: value,
        },
        true,
      );
      setAnswer(result);
      onClarified?.(result);
      setPlan(null);
      setReplayed(false);
    });
  }
  return (
    <section className="interactiveRoot" aria-labelledby="interactive-heading">
      <h3 id="interactive-heading">Interactive authorization</h3>
      <p className="helper">
        One explicit question or one bounded candidate substitution. Answers
        apply only to this interaction; they do not become durable preference or
        execution permission.
      </p>
      <p aria-label="Interactive operation" aria-live="polite">
        {notice}
      </p>
      {(answer?.finalDecision.outcome ?? evaluation.decision.outcome) ===
        "ASK" && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(
              "Planning from captured evidence — no Qloo request",
              requestPlan,
            )
          }
        >
          Ask one clarification
        </button>
      )}
      {plan && (
        <section aria-label="Clarification plan">
          <p>{plan.status}</p>
          {plan.factor && (
            <>
              <h4>{plan.factor.question}</h4>
              <p>{plan.factor.policyEffect}</p>
              <p className="mono">
                Factor: {plan.factor.kind} · State version {plan.stateVersion}
              </p>
              {plan.factor.answerSchema === "MONEY_OR_UNKNOWN" ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit({
                      kind: "PRICE",
                      amount: Number(amount),
                      currency: plan.factor!.currency!,
                    });
                  }}
                >
                  <label>
                    Candidate price in {plan.factor.currency}
                    <input
                      required
                      type="number"
                      min="0"
                      max="1000000"
                      step="any"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <button disabled={busy || amount === ""} type="submit">
                    Apply price to this interaction
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => submit({ kind: "UNKNOWN" })}
                  >
                    Price UNKNOWN
                  </button>
                </form>
              ) : (
                <div className="state-controls">
                  {(
                    ["ACCEPTABLE", "UNACCEPTABLE", "STILL_UNSURE"] as const
                  ).map((value) => (
                    <button
                      type="button"
                      key={value}
                      disabled={busy}
                      onClick={() => submit({ kind: "DISPOSITION", value })}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {plan.status === "STALE" && (
            <p>
              Captured state is stale. Refresh and explicitly evaluate a new
              proposal.
            </p>
          )}
        </section>
      )}
      {answer && (
        <section aria-label="Interactive result">
          <h4>Interaction cultural policy: {answer.finalDecision.outcome}</h4>
          <p>
            Original M2 decision: {answer.originalEvaluation.decision.outcome} ·{" "}
            {answer.finalDecision.basis}
          </p>
          <p className="helper">
            CAPTURED EVIDENCE{replayed ? " REPLAY" : ""} · explicit interaction
            answer. Original Cultural Receipt v1 is unchanged.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run("Replaying captured answer — no Qloo request", async () => {
                setAnswer(
                  await call("replay-clarification", {
                    id: answer.interactionId,
                  }),
                );
                setReplayed(true);
              })
            }
          >
            Replay captured clarification
          </button>
          <details>
            <summary>Interactive authorization envelope</summary>
            <pre>{JSON.stringify(answer, null, 2)}</pre>
          </details>
        </section>
      )}
      {evaluation.decision.outcome === "REJECT" && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(
              "Discovering and verifying one alternative — bounded Qloo requests",
              async () => {
                setRepair(
                  await call(
                    "repair",
                    {
                      evaluationId: evaluation.evaluationId,
                      expectedStateVersion: evaluation.stateVersion,
                    },
                    true,
                  ),
                );
                setReplayed(false);
              },
            )
          }
        >
          Request minimal candidate repair
        </button>
      )}
      {repair && (
        <section aria-label="Repair result">
          <h4>{repair.status.replaceAll("_", " ")}</h4>
          <p>{repair.reason}</p>
          {repair.condition && <p>{repair.condition}</p>}
          <p>
            Original decision remains{" "}
            {repair.originalEvaluation.decision.outcome}. Preserved constraints:{" "}
            {repair.preservedConstraints.length}. Structural change limit: one
            candidate. Not a globally optimal repair.
          </p>
          <p className="helper">
            CAPTURED REPAIR{replayed ? " REPLAY" : ""} ·{" "}
            {repair.method.providerCalls}/{repair.method.maxProviderCalls}{" "}
            provider calls · at most {repair.method.maxCandidates} candidate
            verified. Affinity is not probability.
          </p>
          {repair.verification && (
            <>
              <p>
                Verified proposal: {repair.verification.action.candidate.name} ·
                Cultural policy: {repair.verification.decision.outcome}
              </p>
              <p className="mono">{repair.verification.action.candidate.id}</p>
              {repair.status === "REPAIR_AVAILABLE" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(
                      "Explicitly evaluating repaired proposal as a new M2 evaluation",
                      () => onEvaluateRepair(repair.verification!),
                    )
                  }
                >
                  Evaluate repaired proposal
                </button>
              )}
            </>
          )}
          {repair.status !== "STALE" && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run("Replaying captured repair — no Qloo request", async () => {
                  setRepair(
                    await call("replay-repair", { id: repair.repairId }),
                  );
                  setReplayed(true);
                })
              }
            >
              Replay captured repair
            </button>
          )}
          <details>
            <summary>Repair provenance and change set</summary>
            <pre>{JSON.stringify(repair, null, 2)}</pre>
          </details>
        </section>
      )}
    </section>
  );
}
