"use client";
import { useRef, useState } from "react";
import type { StateVersion, StateEvaluation } from "@/lib/state/types";
import type { QlooEntity, TargetType, EntityResolution } from "@/types/domain";
import {
  BREADTHS,
  TOLERANCES,
  TRAJECTORY_FEEDBACK,
  type Breadth,
  type Tolerance,
  type TrajectoryView,
  type TrajectoryIntent,
} from "@/lib/trajectory/types";
import type {
  ClarificationPlan,
  InteractiveAuthorization,
  Answer,
} from "@/lib/interactive/types";
import "./TrajectoryPanel.css";
const permittedBreadths: Record<Tolerance, number> = {
  CONSERVATIVE: 0,
  BALANCED: 1,
  OPEN: 2,
};
const messages: Record<string, string> = {
  persistence_not_configured:
    "TasteTrajectory requires configured PostgreSQL persistence. No substitute evidence is used.",
  TRAJECTORY_UNAVAILABLE:
    "Required cultural evidence could not be established. No partial five-view bridge is presented.",
  STALE:
    "Taste State changed. Refresh trajectory explicitly; old evidence will not be rebased.",
  STATE_VERSION_CONFLICT:
    "Taste State changed. Inspect the new state and explicitly refresh.",
  TOLERANCE_EXCEEDED:
    "This breadth exceeds your declared exploration tolerance.",
  SESSION_EXPIRED: "Resume a temporary Taste State profile first.",
  INTEGRITY_ERROR:
    "Captured trajectory failed its integrity check. No result is authorized.",
  STOPPED:
    "This trajectory is stopped. Create a new explicit intent to explore again.",
  COMPLETE:
    "The target was explicitly selected under the current cultural policy.",
  INVALID_INPUT: "Review the identity, context and required structured fields.",
  IDEMPOTENCY_KEY_CONFLICT: "This retry key was used with different input.",
  RATE_LIMITED: "Demo operation limit reached.",
  NOT_FOUND:
    "This trajectory or captured record is unavailable in your profile.",
};
export default function TrajectoryPanel({
  state,
  onRefresh,
}: {
  state: StateVersion;
  onRefresh: () => Promise<void>;
}) {
  const [query, setQuery] = useState(""),
    [domain, setDomain] = useState<TargetType>("destination"),
    [matches, setMatches] = useState<QlooEntity[]>([]),
    [selected, setSelected] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [tolerance, setTolerance] = useState<Tolerance>("BALANCED"),
    [context, setContext] = useState("trip"),
    [view, setView] = useState<TrajectoryView | null>(null),
    [trajectoryId, setTrajectoryId] = useState(""),
    [breadth, setBreadth] = useState<Breadth>("STRICT"),
    [notice, setNotice] = useState(
      "No automatic Qloo requests. Choose and review a target first.",
    ),
    [busy, setBusy] = useState(false),
    [evaluation, setEvaluation] = useState<StateEvaluation | null>(null),
    [clarification, setClarification] = useState<ClarificationPlan | null>(
      null,
    ),
    [answer, setAnswer] = useState<InteractiveAuthorization | null>(null),
    [amount, setAmount] = useState("");
  const keys = useRef(new Map<string, string>());
  async function call<T>(
    op: string,
    payload: Record<string, unknown>,
    mutating = false,
    interactive = false,
  ): Promise<T> {
    const fingerprint = op + JSON.stringify(payload);
    if (mutating && !keys.current.has(fingerprint))
      keys.current.set(fingerprint, crypto.randomUUID());
    const response = await fetch(
      "/api/state/" + (interactive ? "interactive/" : "trajectory/") + op,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          ...(mutating
            ? { idempotencyKey: keys.current.get(fingerprint) }
            : {}),
        }),
      },
    );
    const r = await response.json();
    if (!response.ok || r.status !== "available")
      throw Error(
        messages[r.code ?? r.reason] ??
          "Operation unavailable. No authorization was fabricated.",
      );
    if (mutating) keys.current.delete(fingerprint);
    return r.data;
  }
  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    setNotice(label);
    try {
      await fn();
      setNotice(
        "Captured result ready. Cultural authorization grants no execution authority.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Operation unavailable.");
    } finally {
      setBusy(false);
    }
  }
  async function sync(tid = trajectoryId) {
    const next = await call<TrajectoryView>("read", { trajectoryId: tid });
    setView(next);
    setBreadth(next.breadth);
    await onRefresh();
    return next;
  }
  async function generate(refresh = false) {
    const current = await sync();
    const g = await call<{ status: string }>(
      "plan",
      {
        trajectoryId,
        expectedStateVersion: current.stateVersion,
        breadth,
        refresh,
      },
      true,
    );
    await sync();
    if (g.status === "DIRECT_TARGET_AVAILABLE")
      setNotice(
        "DIRECT_TARGET_AVAILABLE — select the authorized target explicitly.",
      );
  }
  async function evaluate(candidate: QlooEntity) {
    const next = await call<StateEvaluation>("evaluate", {
      trajectoryId,
      candidateId: candidate.id,
      expectedStateVersion: view!.stateVersion,
      ...(candidate.id !== view!.intent.target.id
        ? { generationId: view!.generation!.generationId }
        : {}),
    });
    setEvaluation(next);
    setAnswer(null);
    setClarification(null);
    await sync();
  }
  async function submitAnswer(value: Answer) {
    const next = await call<InteractiveAuthorization>(
      "answer",
      {
        evaluationId: evaluation!.evaluationId,
        expectedStateVersion: evaluation!.stateVersion,
        planId: clarification!.planId,
        ...(answer ? { parentClarificationId: answer.interactionId } : {}),
        answer: value,
      },
      true,
      true,
    );
    setAnswer(next);
    setClarification(null);
  }
  const anchors = state.entries.filter((e) => e.kind === "EXPLICIT_LIKE"),
    stale =
      view &&
      (view.status === "STALE" || view.stateVersion !== state.stateVersion),
    terminal =
      view && (view.status === "STOPPED" || view.status === "COMPLETE");
  const targetEvaluation = view?.evaluations
    .filter((e) => e.action.candidate.id === view.intent.target.id)
    .at(-1);
  return (
    <section className="trajectoryRoot" aria-labelledby="trajectory-heading">
      <h3 id="trajectory-heading">TasteTrajectory · intentional exploration</h3>
      <p>
        Choose a direction. Inspect bridge evidence. Authorize each step
        separately.
      </p>
      <p className="helper">
        Target intent is not existing preference. No cultural coordinates,
        automatic widening or execution. Affinity is not confidence or
        individual preference probability.
      </p>
      <p role="status" aria-label="Trajectory operation">
        {notice}
      </p>
      <p>
        Current position: immutable Taste State {state.stateVersion} ·{" "}
        {anchors.length} explicit anchors
      </p>
      <ul>
        {anchors.map((e) => (
          <li key={e.signalId}>{e.entity?.name}</li>
        ))}
      </ul>
      <details open={!view}>
        <summary>Choose a new exploration target</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run("Resolving target identity", async () => {
              const r = await call<{ status: string; data?: EntityResolution }>(
                "resolve",
                { query, type: domain },
              );
              if (r.status !== "available" || !r.data)
                throw Error(
                  "Target resolution unavailable. No identity was selected.",
                );
              setMatches(r.data.matches);
              setSelected("");
              setReviewed(false);
            });
          }}
        >
          <div className="state-form">
            <label>
              Target name
              <input
                required
                maxLength={120}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setMatches([]);
                  setSelected("");
                  setReviewed(false);
                }}
              />
            </label>
            <label>
              Target domain
              <select
                value={domain}
                onChange={(e) => {
                  setDomain(e.target.value as TargetType);
                  setMatches([]);
                  setSelected("");
                  setReviewed(false);
                }}
              >
                {["brand", "destination", "place"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" disabled={busy || anchors.length !== 5}>
            Resolve target identities
          </button>
        </form>
        <fieldset disabled={busy}>
          <legend>Review target identity</legend>
          {matches.length === 0 ? (
            <p>
              No target selected. Resolve and inspect the identity, including
              ambiguous matches.
            </p>
          ) : (
            matches.map((m) => (
              <label className="trajectoryIdentity" key={m.id}>
                <input
                  type="radio"
                  name="trajectory-target"
                  value={m.id}
                  checked={selected === m.id}
                  onChange={() => {
                    setSelected(m.id);
                    setReviewed(false);
                  }}
                />
                <span>
                  {m.name} · {m.type}
                  <small className="mono">
                    {m.id}
                    {m.releaseYear ? " · " + m.releaseYear : ""}
                    {m.address ? " · " + m.address : ""}
                  </small>
                </span>
              </label>
            ))
          )}
        </fieldset>
        <label>
          <input
            type="checkbox"
            checked={reviewed}
            disabled={!selected || busy}
            onChange={(e) => setReviewed(e.target.checked)}
          />{" "}
          I reviewed this exact target identity.
        </label>
        <div className="state-form">
          <label>
            Exploration tolerance
            <select
              value={tolerance}
              onChange={(e) => setTolerance(e.target.value as Tolerance)}
            >
              {TOLERANCES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Trajectory context key
            <input
              required
              pattern="[a-zA-Z0-9_-]{1,64}"
              maxLength={64}
              value={context}
              onChange={(e) => setContext(e.target.value)}
            />
          </label>
        </div>
        <p className="helper">
          Tolerance limits discovery breadth only. Policy thresholds and
          explicit constraints remain unchanged.
        </p>
        <button
          disabled={busy || !selected || !reviewed || anchors.length !== 5}
          onClick={() =>
            run(
              "Saving explicit exploration intent as an immutable state version",
              async () => {
                const t = await call<TrajectoryIntent>(
                  "create",
                  {
                    expectedStateVersion: state.stateVersion,
                    targetId: selected,
                    targetType: domain,
                    reviewed,
                    contextKey: context,
                    tolerance,
                  },
                  true,
                );
                setTrajectoryId(t.trajectoryId);
                setEvaluation(null);
                setAnswer(null);
                await sync(t.trajectoryId);
              },
            )
          }
        >
          Save exploration intent
        </button>
      </details>
      <details>
        <summary>Resume an owned trajectory</summary>
        <label>
          Trajectory ID
          <input
            maxLength={36}
            value={trajectoryId}
            onChange={(e) => {
              setTrajectoryId(e.target.value);
              setView(null);
              setEvaluation(null);
              setAnswer(null);
            }}
          />
        </label>
        <button
          disabled={busy || !trajectoryId}
          onClick={() =>
            run("Inspecting captured trajectory", async () => {
              await sync();
            })
          }
        >
          Inspect trajectory
        </button>
      </details>
      {view && (
        <>
          <h4>Explicit target: {view.intent.target.name}</h4>
          <p>
            {view.intent.target.type} · {view.intent.tolerance} · context{" "}
            {view.intent.context.key}
          </p>
          <p className="mono">
            {view.intent.target.id} · Trajectory {view.intent.trajectoryId}
          </p>
          <p>Target is EXPLORATION_INTENT, not EXPLICIT_LIKE.</p>
          <p>
            Trajectory status: {view.status} · Current breadth: {view.breadth}
          </p>
          {stale && (
            <p role="alert">
              STALE — Taste State advanced. Old evidence remains captured;
              refresh explicitly before planning or adopting steps.
            </p>
          )}
          <div className="state-controls">
            <label>
              Requested bridge breadth
              <select
                value={breadth}
                disabled={busy || !!terminal}
                onChange={(e) => setBreadth(e.target.value as Breadth)}
              >
                {BREADTHS.map((b, i) => (
                  <option
                    key={b}
                    disabled={i > permittedBreadths[view.intent.tolerance]}
                  >
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={busy || !!terminal || !!stale}
              onClick={() =>
                run(
                  "Requesting five target-anchored discovery views — no candidate authorization",
                  () => generate(),
                )
              }
            >
              Generate bridge plan
            </button>
            <button
              disabled={busy || !!terminal}
              onClick={() =>
                run(
                  "Refreshing against the explicitly current immutable state",
                  () => generate(true),
                )
              }
            >
              Refresh trajectory
            </button>
            <button
              disabled={busy || !!terminal || !!stale}
              onClick={() =>
                run(
                  "Evaluating the target through ordinary cultural policy",
                  () => evaluate(view.intent.target),
                )
              }
            >
              Evaluate target
            </button>
          </div>
          {targetEvaluation && (
            <p>
              Target policy: {targetEvaluation.decision.outcome} ·{" "}
              {targetEvaluation.decision.outcome === "ALLOW"
                ? "DIRECT_TARGET_AVAILABLE"
                : targetEvaluation.decision.outcome === "ASK"
                  ? "TARGET_REQUIRES_CLARIFICATION"
                  : targetEvaluation.decision.outcome === "REJECT"
                    ? "TARGET_CURRENTLY_REJECTED"
                    : "TARGET_EVIDENCE_UNAVAILABLE"}
            </p>
          )}
          {view.generation && (
            <section aria-label="Trajectory bridge evidence">
              <h4>{view.generation.status}</h4>
              <p>
                CAPTURED QLOO DISCOVERY · state {view.generation.stateVersion} ·{" "}
                {view.generation.breadth}
              </p>
              {view.generation.reason && (
                <p>
                  Required discovery evidence unavailable:{" "}
                  {view.generation.reason}. No partial support is presented.
                </p>
              )}
              {view.generation.status === "NO_BRIDGE_AT_CURRENT_BREADTH" && (
                <p>
                  No bridge at this breadth. Choose a wider permitted level
                  explicitly; the system will not widen for you.
                </p>
              )}
              <ul className="trajectoryCandidates">
                {view.generation.candidates.map((c) => {
                  const e = view.evaluations
                      .filter((e) => e.action.candidate.id === c.entity.id)
                      .at(-1),
                    authorized = view.events.some(
                      (e) =>
                        e.candidateId === c.entity.id &&
                        e.generationId === view.generation!.generationId &&
                        e.kind === "STEP_AUTHORIZED",
                    );
                  return (
                    <li key={c.entity.id}>
                      <h5>{c.entity.name}</h5>
                      <p>
                        Bridge support: {c.supportCount}/5 discovery views ·{" "}
                        {authorized
                          ? "POLICY-AUTHORIZED EXPLORATION STEP"
                          : e
                            ? "Cultural policy: " + e.decision.outcome
                            : "UNVERIFIED — discovery is not authorization"}
                      </p>
                      <p className="mono">{c.entity.id}</p>
                      <details>
                        <summary>Query membership and provider ranks</summary>
                        <ul>
                          {c.memberships.map((m) => (
                            <li key={m.queryId}>
                              {m.queryId} · provider rank {m.rank}
                            </li>
                          ))}
                        </ul>
                      </details>
                      <button
                        disabled={busy || !!stale || !!terminal}
                        onClick={() =>
                          run(
                            "Evaluating bridge with all five original taste anchors",
                            () => evaluate(c.entity),
                          )
                        }
                      >
                        Evaluate bridge: {c.entity.name}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <details>
                <summary>Five discovery views · captured provenance</summary>
                <pre>{JSON.stringify(view.generation.queries, null, 2)}</pre>
              </details>
              <button
                disabled={busy}
                onClick={() =>
                  run(
                    "Replaying captured bridge evidence — zero Qloo calls",
                    async () => {
                      await call("replay", {
                        generationId: view.generation!.generationId,
                      });
                      await sync();
                    },
                  )
                }
              >
                Replay captured trajectory
              </button>
            </section>
          )}
          {evaluation && (
            <section aria-label="Trajectory cultural decision">
              <h4>
                Cultural policy:{" "}
                {answer?.finalDecision.outcome ?? evaluation.decision.outcome}
              </h4>
              <p>
                {evaluation.action.candidate.name} · SELECT_ENTITY · state{" "}
                {evaluation.stateVersion}
              </p>
              <p>
                {evaluation.decision.outcome === "ASK"
                  ? "STRETCH — CLARIFICATION REQUIRED"
                  : evaluation.decision.outcome === "REJECT"
                    ? "Rejected candidates are not trajectory steps."
                    : evaluation.decision.outcome === "UNAVAILABLE"
                      ? "Required evidence unavailable; candidate is not verified."
                      : "Available evidence satisfies the current cultural policy."}
              </p>
              <p>
                No spending, purchase, booking, legal, account, private-data or
                execution authority.
              </p>
              {(answer?.finalDecision.outcome ??
                evaluation.decision.outcome) === "ASK" && (
                <button
                  disabled={busy || !!stale}
                  onClick={() =>
                    run(
                      "Planning a clarification from captured evidence",
                      async () => {
                        setClarification(
                          await call(
                            "plan",
                            {
                              evaluationId: evaluation.evaluationId,
                              ...(answer
                                ? {
                                    parentClarificationId: answer.interactionId,
                                  }
                                : {}),
                            },
                            false,
                            true,
                          ),
                        );
                      },
                    )
                  }
                >
                  Clarify trajectory proposal
                </button>
              )}
              {clarification && (
                <div>
                  <p>{clarification.status}</p>
                  <p>{clarification.factor?.question}</p>
                  {clarification.factor?.answerSchema === "DISPOSITION" ? (
                    <>
                      <button
                        disabled={busy}
                        onClick={() =>
                          run(
                            "Applying explicit interaction-scoped answer",
                            () =>
                              submitAnswer({
                                kind: "DISPOSITION",
                                value: "ACCEPTABLE",
                              }),
                          )
                        }
                      >
                        ACCEPTABLE
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          run(
                            "Applying explicit interaction-scoped answer",
                            () =>
                              submitAnswer({
                                kind: "DISPOSITION",
                                value: "UNACCEPTABLE",
                              }),
                          )
                        }
                      >
                        UNACCEPTABLE
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          run(
                            "Preserving unresolved cultural disposition",
                            () =>
                              submitAnswer({
                                kind: "DISPOSITION",
                                value: "STILL_UNSURE",
                              }),
                          )
                        }
                      >
                        STILL_UNSURE
                      </button>
                    </>
                  ) : (
                    clarification.factor && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run(
                            "Applying the candidate-specific price answer",
                            () =>
                              submitAnswer({
                                kind: "PRICE",
                                amount: Number(amount),
                                currency: clarification.factor!.currency!,
                              }),
                          );
                        }}
                      >
                        <label>
                          Candidate price in {clarification.factor.currency}
                          <input
                            required
                            type="number"
                            min="0"
                            max="1000000"
                            step="any"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                          />
                        </label>
                        <button disabled={busy}>Answer price</button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            run("Preserving unresolved price", () =>
                              submitAnswer({ kind: "UNKNOWN" }),
                            )
                          }
                        >
                          UNKNOWN
                        </button>
                      </form>
                    )
                  )}
                </div>
              )}
              {(answer?.finalDecision.outcome ??
                evaluation.decision.outcome) === "ALLOW" && (
                <button
                  disabled={busy || !!stale || !!terminal}
                  onClick={() =>
                    run(
                      "Recording explicit selection under the current cultural policy",
                      async () => {
                        await call(
                          "event",
                          {
                            trajectoryId,
                            expectedStateVersion: evaluation.stateVersion,
                            evaluationId: evaluation.evaluationId,
                            ...(evaluation.action.candidate.id !==
                            view.intent.target.id
                              ? { generationId: view.generation!.generationId }
                              : {}),
                            ...(answer
                              ? { clarificationId: answer.interactionId }
                              : {}),
                          },
                          true,
                        );
                        await sync();
                      },
                    )
                  }
                >
                  {evaluation.action.candidate.id === view.intent.target.id
                    ? "Select authorized target — complete trajectory"
                    : "Select policy-authorized exploration step"}
                </button>
              )}
              <details>
                <summary>
                  Trajectory Cultural Receipt and authorization provenance
                </summary>
                <pre>
                  {JSON.stringify(
                    { evaluation, clarification: answer },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </section>
          )}
          <fieldset disabled={busy || !!terminal}>
            <legend>Trajectory-local feedback</legend>
            <p>
              These choices affect only exploration breadth. Persistent
              corrections require the separate scoped Taste State feedback
              controls.
            </p>
            {TRAJECTORY_FEEDBACK.map((f) => (
              <button
                key={f}
                disabled={!!stale && f !== "STOP_EXPLORING"}
                onClick={() =>
                  run("Recording trajectory-local feedback", async () => {
                    await call(
                      "event",
                      {
                        trajectoryId,
                        expectedStateVersion: view.stateVersion,
                        feedback: f,
                      },
                      true,
                    );
                    await sync();
                  })
                }
              >
                {f.replaceAll("_", " ")}
              </button>
            ))}
          </fieldset>
          <details>
            <summary>Trajectory timeline · immutable events</summary>
            <ol>
              {view.events.map((e) => (
                <li key={e.eventId}>
                  {e.kind} · {e.feedback ?? e.candidateId} · {e.breadth ?? ""} ·
                  state {e.stateVersion}
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
    </section>
  );
}
