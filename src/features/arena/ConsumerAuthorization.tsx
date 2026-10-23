"use client";

import { useEffect, useRef, useState } from "react";
import type { QlooEntity } from "@/types/domain";
import type { useConsumerAuthorization } from "./useConsumerAuthorization";

type Authorization = ReturnType<typeof useConsumerAuthorization>;
export default function ConsumerAuthorization({
  auth,
  candidate,
  busy,
  run,
  clearBaseline,
}: {
  auth: Authorization;
  candidate: QlooEntity;
  busy: boolean;
  run: (label: string, operation: () => Promise<void>) => Promise<void>;
  clearBaseline: () => void;
}) {
  const [amount, setAmount] = useState("");
  const priceInput = useRef<HTMLInputElement>(null);
  const [rehearsal, setRehearsal] = useState(false);
  const e =
    auth.evaluation?.action.candidate.id === candidate.id
      ? auth.evaluation
      : null;
  const interaction = e ? auth.interaction : null;
  const outcome = interaction?.finalDecision.outcome ?? e?.decision.outcome;
  const plan = e ? auth.plan : null;
  const replacement =
    auth.repair?.status === "REPAIR_AVAILABLE" &&
    auth.repair.verification?.action.candidate.id === candidate.id;
  useEffect(() => {
    if (!busy && plan?.status === "ACTIONABLE") priceInput.current?.focus();
  }, [busy, plan?.planId, plan?.status]);
  return (
    <div
      className="consumerAuthorization"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      {outcome === "ASK" && (
        <section
          className="consumerQuestion"
          aria-label="One question before continuing"
        >
          {plan?.status === "ACTIONABLE" && plan.factor ? (
            <>
              <h4>
                {plan.factor.answerSchema === "MONEY_OR_UNKNOWN"
                  ? "What does this place cost?"
                  : "Would this choice work for you in this situation?"}
              </h4>
              <p>
                Your answer applies only to this choice. It does not change your
                saved preferences.
              </p>
              {plan.factor.answerSchema === "MONEY_OR_UNKNOWN" ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run("Checking your answer…", () =>
                      auth.answer({
                        kind: "PRICE",
                        amount: Number(amount),
                        currency: plan.factor!.currency!,
                      }),
                    );
                  }}
                >
                  <label>
                    Price in {plan.factor.currency}
                    <input
                      ref={priceInput}
                      type="number"
                      required
                      min="0"
                      max="1000000"
                      step="any"
                      value={amount}
                      disabled={busy}
                      onChange={(event) => setAmount(event.target.value)}
                    />
                  </label>
                  <div className="consumerButtons">
                    <button
                      className="primaryAction"
                      disabled={busy || amount === ""}
                      type="submit"
                    >
                      Use this price
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run("Keeping the missing price explicit…", () =>
                          auth.answer({ kind: "UNKNOWN" }),
                        )
                      }
                    >
                      I don’t know
                    </button>
                  </div>
                </form>
              ) : (
                <div className="consumerButtons">
                  {(
                    [
                      ["ACCEPTABLE", "Yes, for this choice"],
                      ["UNACCEPTABLE", "No, not this choice"],
                      ["STILL_UNSURE", "I’m still unsure"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      disabled={busy}
                      onClick={() =>
                        void run("Checking your explicit answer…", () =>
                          auth.answer({ kind: "DISPOSITION", value }),
                        )
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <p>
                {plan?.status === "STALE"
                  ? "Your saved rules changed. Refresh them before checking again."
                  : "Your concierge still needs an explicit answer. No answer has been assumed."}
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  void run("Finding the next question…", () =>
                    auth.question(e!, interaction ?? undefined),
                  )
                }
              >
                Show the question
              </button>
            </>
          )}
        </section>
      )}
      {e?.decision.outcome === "REJECT" && !auth.repair && (
        <button
          className="repairAction"
          disabled={busy}
          onClick={() =>
            void run(
              "Looking for one alternative that keeps your rule…",
              auth.findAlternative,
            )
          }
        >
          Find another that respects this
        </button>
      )}
      {auth.repair && (
        <section className="consumerRepair" aria-label="Bounded alternative">
          <p>
            <strong>
              {auth.repair.status === "REPAIR_AVAILABLE"
                ? "One alternative found"
                : "No verified alternative yet"}
            </strong>
          </p>
          <p>
            Original option:{" "}
            {auth.repair.originalEvaluation.action.candidate.name} — Not this
            one (REJECT).
          </p>
          {replacement ? (
            <p>
              {e
                ? "This alternative has its own new authorization. Its actual result is shown above."
                : "This alternative keeps the same rules. It is not authorized yet: check this alternative before your agent may recommend it."}
            </p>
          ) : auth.repair.status === "NO_VERIFIABLE_REPAIR" ? (
            <p>
              Your rules remain in place. I cannot verify an alternative’s own
              price while a budget applies. No price or replacement was
              invented.
            </p>
          ) : auth.repair.status === "STALE" ? (
            <p>Your saved rules changed. Refresh and check again.</p>
          ) : (
            <p>
              No suitable alternative was verified within this single search.
              Your rule has not been weakened, and no automatic retry will run.
            </p>
          )}
          <p>
            Any saved exclusion and other rules are kept. Finding or checking an
            alternative does not change them.
          </p>
        </section>
      )}
      <details className="consumerBoundaries">
        <summary>Try a boundary</summary>
        <p>
          Save a rule for your five reviewed preferences in this temporary demo
          profile. A different saved profile will never be overwritten.
        </p>
        <div className="consumerButtons">
          <button
            disabled={busy || replacement}
            onClick={() => {
              clearBaseline();
              void run(
                "Saving your $100 budget and checking this choice…",
                () => auth.budget(candidate),
              );
            }}
          >
            I have a $100 budget
          </button>
          <button
            disabled={busy || replacement}
            onClick={() => {
              clearBaseline();
              void run("Saving your explicit exclusion…", () =>
                auth.exclude(candidate),
              );
            }}
          >
            Never choose this place for me
          </button>
          <button
            disabled={busy}
            onClick={() => setRehearsal((value) => !value)}
          >
            What if evidence is missing?
          </button>
        </div>
        {auth.state && (
          <button
            disabled={busy}
            onClick={() => {
              clearBaseline();
              void run("Reading your saved rules…", auth.refresh);
            }}
          >
            Refresh my saved rules
          </button>
        )}
        {rehearsal && (
          <section
            className="humanDecision consumerRehearsal"
            data-decision="UNAVAILABLE"
            aria-label="Demo rehearsal"
            aria-live="polite"
          >
            <p>Demo rehearsal · No live outage is claimed</p>
            <h4>I don’t know enough yet</h4>
            <p>Missing taste evidence is not the same as disliking this.</p>
            <p>No Qloo call · No authorization · No fabricated receipt</p>
            <span className="machineOutcome">Rehearsal only: UNAVAILABLE</span>
          </section>
        )}
      </details>
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
                evaluation: e,
                interaction,
                plan,
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
    </div>
  );
}
