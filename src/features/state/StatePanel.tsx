"use client";
import { useState } from "react";
import SubjectsPanel from "@/features/subjects/SubjectsPanel";
import TrajectoryPanel from "@/features/trajectory/TrajectoryPanel";
import InteractivePanel from "@/features/interactive/InteractivePanel";
import type { CulturalReceipt, TargetType } from "@/types/domain";
import {
  FEEDBACK_CATEGORIES,
  SCOPES,
  PERSISTENCE,
  type StateVersion,
  type StateEvaluation,
  type FeedbackInput,
} from "@/lib/state/types";
import type { GraphNode, GraphEdge } from "@/server/state/graph";
type Snapshot = {
  state: StateVersion;
  previous: StateVersion | null;
  feedback: unknown[];
  evaluations: StateEvaluation[];
  tasteGraph?: { nodes: GraphNode[]; edges: GraphEdge[]; semanticHash: string };
  graph: { nodes: GraphNode[]; edges: GraphEdge[]; semanticHash: string };
  diff: {
    added: unknown[];
    removed: unknown[];
    changedConstraints: unknown[];
    feedbackEventIds: string[];
  };
};
const errors: Record<string, string> = {
  persistence_not_configured:
    "Persistent Taste State is not configured in this environment. No in-memory substitute is used.",
  SESSION_EXPIRED: "Demo session expired. Start a new temporary profile.",
  STATE_VERSION_CONFLICT:
    "Taste State changed. Refresh and explicitly reconcile before resubmitting.",
  IDEMPOTENCY_KEY_CONFLICT:
    "This retry key was already used with different input.",
  INVALID_INPUT: "Review the structured fields and scope compatibility.",
  RATE_LIMITED: "Demo operation limit reached. Try a new session later.",
  INTERNAL_ERROR:
    "Persistence operation unavailable. No authorization was fabricated.",
};
export default function StatePanel({
  receipt,
}: {
  receipt: CulturalReceipt | null;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [started, setStarted] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [agent, setAgent] = useState("Agent-A"),
    [contextKey, setContextKey] = useState("demo"),
    [price, setPrice] = useState(""),
    [currency, setCurrency] = useState("USD"),
    [maxPrice, setMaxPrice] = useState(""),
    [category, setCategory] =
      useState<FeedbackInput["category"]>("SPECIFIC_DISLIKE"),
    [scope, setScope] = useState<FeedbackInput["scope"]>("CANDIDATE_ONLY"),
    [persistence, setPersistence] =
      useState<FeedbackInput["persistence"]>("DURABLE"),
    [comment, setComment] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [mode, setMode] = useState("Taste Map"),
    [evaluation, setEvaluation] = useState<StateEvaluation | null>(null);
  async function call(op: string, payload: unknown) {
    const r = await fetch("/api/state/" + op, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok || data.status !== "available")
      throw Error(
        errors[data.code ?? data.reason] ??
          "Operation unavailable. Refresh state before trying again.",
      );
    return data.data;
  }
  async function refresh() {
    const data = await call("read", {});
    setSnapshot(data as Snapshot);
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setNotice("Working with versioned Taste State");
    try {
      await fn();
      setNotice("Operation completed. Inspect state and provenance below.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Operation unavailable");
    } finally {
      setBusy(false);
    }
  }
  const mutation = (payload: unknown) => ({
    expectedStateVersion: snapshot!.state.stateVersion,
    idempotencyKey: crypto.randomUUID(),
    payload,
  });
  return (
    <section className="panel state-panel" aria-labelledby="state-heading">
      <div className="section-heading">
        <span className="step-number">05</span>
        <h2 id="state-heading">Versioned Taste State</h2>
      </div>
      <p className="helper">
        Temporary pseudonymous profile · 24-hour expiry. Explicit feedback
        belongs to the subject; agent labels do not create separate profiles. No
        learning or confidence claim.
      </p>
      <p aria-label="Taste State operation" aria-live="polite">
        {notice}
      </p>
      <div className="state-controls">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await call("session", {});
              setStarted(true);
              await refresh();
            })
          }
        >
          Start / resume demo profile
        </button>
        {started && (
          <button type="button" disabled={busy} onClick={() => run(refresh)}>
            Refresh Taste State
          </button>
        )}
      </div>
      {snapshot && (
        <>
          <p className="badge">
            Taste State version {snapshot.state.stateVersion}
          </p>
          <p className="mono">Hash: {snapshot.state.stateHash}</p>
          <p className="helper">
            Old versions remain immutable. Conflicts require an explicit
            refresh.
          </p>
          {snapshot.state.entries.length === 0 && (
            <button
              type="button"
              disabled={busy || !receipt}
              onClick={() =>
                run(async () => {
                  await call(
                    "mutate",
                    mutation({
                      kind: "INITIALIZE",
                      signals: receipt!.inputSignals,
                    }),
                  );
                  await refresh();
                })
              }
            >
              Save these five reviewed signals
            </button>
          )}
          {!receipt && (
            <p className="helper">
              First resolve, review and evaluate five distinct signals in the
              demo above. Saving is an explicit preference action, not automatic
              Qloo learning.
            </p>
          )}
          <ul className="signal-evidence">
            {snapshot.state.entries.map((e) => (
              <li key={e.signalId}>
                <span>
                  {e.entity?.name ??
                    e.exploration?.target.name ??
                    e.constraint?.kind ??
                    e.category}{" "}
                  · {e.scope} · {e.persistence}
                  <small className="mono">
                    {e.source} · {e.sourceEventId}
                  </small>
                </span>
                {e.kind !== "EXPLICIT_LIKE" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await call(
                          "mutate",
                          mutation({ kind: "REMOVE", signalId: e.signalId }),
                        );
                        await refresh();
                      })
                    }
                  >
                    Remove constraint / correction
                  </button>
                )}
              </li>
            ))}
          </ul>
          {receipt && snapshot.state.entries.length > 0 && (
            <>
              <h3>Agent uses this subject state</h3>
              <div className="state-form">
                <label>
                  Logical agent
                  <select
                    value={agent}
                    onChange={(e) => setAgent(e.target.value)}
                  >
                    <option>Agent-A</option>
                    <option>Agent-B</option>
                  </select>
                </label>
                <label>
                  Context key
                  <input
                    maxLength={64}
                    value={contextKey}
                    onChange={(e) => setContextKey(e.target.value)}
                  />
                </label>
                <label>
                  Candidate price (optional)
                  <input
                    type="number"
                    min="0"
                    max="1000000"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </label>
                <label>
                  Currency
                  <input
                    maxLength={3}
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  />
                </label>
              </div>
              <p>SELECT_ENTITY · {receipt.candidate.name}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const e = await call("evaluate", {
                      agentId: agent,
                      expectedStateVersion: snapshot.state.stateVersion,
                      candidate: receipt.candidate,
                      context: {
                        key: contextKey,
                        domain: receipt.candidate.type,
                        ...(price !== ""
                          ? { price: { amount: Number(price), currency } }
                          : {}),
                      },
                    });
                    setEvaluation(e as StateEvaluation);
                    await refresh();
                  })
                }
              >
                Evaluate using current state
              </button>
              <h3>Scoped structured feedback</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    const f: FeedbackInput = {
                      category,
                      scope,
                      persistence,
                      ...(scope === "CANDIDATE_ONLY"
                        ? { candidateId: receipt.candidate.id }
                        : {}),
                      ...(scope === "CONTEXT" ? { contextKey } : {}),
                      ...(scope === "DOMAIN"
                        ? { domain: receipt.candidate.type as TargetType }
                        : {}),
                      ...(category === "TOO_EXPENSIVE" && maxPrice !== ""
                        ? { maxPrice: { amount: Number(maxPrice), currency } }
                        : {}),
                      ...(comment ? { comment } : {}),
                      confirmGlobal: confirmed,
                    };
                    await call(
                      "mutate",
                      mutation({ kind: "FEEDBACK", feedback: f }),
                    );
                    await refresh();
                  });
                }}
              >
                <div className="state-form">
                  <label>
                    Correction
                    <select
                      value={category}
                      onChange={(e) =>
                        setCategory(e.target.value as FeedbackInput["category"])
                      }
                    >
                      {FEEDBACK_CATEGORIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Applicability scope
                    <select
                      value={scope}
                      onChange={(e) =>
                        setScope(e.target.value as FeedbackInput["scope"])
                      }
                    >
                      {SCOPES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Persistence class
                    <select
                      value={persistence}
                      onChange={(e) =>
                        setPersistence(
                          e.target.value as FeedbackInput["persistence"],
                        )
                      }
                    >
                      {PERSISTENCE.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                  {category === "TOO_EXPENSIVE" && (
                    <label>
                      Explicit maximum price
                      <input
                        type="number"
                        min="0"
                        max="1000000"
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(e.target.value)}
                      />
                    </label>
                  )}
                  <label>
                    Comment (provenance only)
                    <input
                      maxLength={300}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                  </label>
                </div>
                <p className="helper">
                  {scope} applies only to its explicit target. EPHEMERAL expires
                  after 30 minutes and creates no durable state. CONTEXT_SCOPED
                  requires CONTEXT; DOMAIN_SCOPED requires DOMAIN. Specific
                  dislike requires CANDIDATE_ONLY. Comments never execute
                  policy.
                </p>
                {scope === "GLOBAL_PREFERENCE" && persistence === "DURABLE" && (
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />{" "}
                    I explicitly confirm this correction applies globally until
                    removed or expired.
                  </label>
                )}
                <button disabled={busy} type="submit">
                  Record scoped feedback
                </button>
              </form>
            </>
          )}
          {evaluation && (
            <section aria-label="State-linked decision">
              <h3>Cultural policy: {evaluation.decision.outcome}</h3>
              <p>
                {evaluation.decision.basis} · Agent {evaluation.agentId} · State
                version {evaluation.stateVersion}
              </p>
              <p className="helper">
                {evaluation.source === "recorded"
                  ? "RECORDED EVIDENCE REPLAY"
                  : "Current evaluation"}{" "}
                · No spending, purchase, booking, legal, account or execution
                authority.
              </p>
              <p>{evaluation.decision.rules.join(" · ")}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    setEvaluation(
                      await call("replay", {
                        evaluationId: evaluation.evaluationId,
                      }),
                    );
                  })
                }
              >
                Replay captured evaluation (no Qloo call)
              </button>
              <InteractivePanel
                key={evaluation.evaluationId}
                evaluation={evaluation}
                onEvaluateRepair={async (verified) => {
                  const next = await call("evaluate", {
                    agentId: verified.agentId,
                    expectedStateVersion: verified.stateVersion,
                    candidate: verified.action.candidate,
                    context: verified.context,
                  });
                  setEvaluation(next as StateEvaluation);
                  await refresh();
                }}
              />
              <details>
                <summary>State-linked receipt envelope</summary>
                <pre>{JSON.stringify(evaluation, null, 2)}</pre>
              </details>
            </section>
          )}
          {snapshot.state.entries.filter((e) => e.kind === "EXPLICIT_LIKE")
            .length === 5 && (
            <TrajectoryPanel state={snapshot.state} onRefresh={refresh} />
          )}
          {snapshot.state.entries.filter((e) => e.kind === "EXPLICIT_LIKE")
            .length === 5 && (
            <SubjectsPanel
              state={snapshot.state}
              evaluations={snapshot.evaluations}
              receipt={receipt}
            />
          )}
          <details>
            <summary>ContextGraph · deterministic provenance</summary>
            <label>
              Projection
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                {[
                  "Taste Map",
                  "Decision Focus",
                  "State Diff",
                  "Evidence / Provenance Inspector",
                ].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            {mode === "State Diff" ? (
              <>
                <p>
                  Added {snapshot.diff.added.length} · removed{" "}
                  {snapshot.diff.removed.length} · changed constraints{" "}
                  {snapshot.diff.changedConstraints.length}
                </p>
                <pre>{JSON.stringify(snapshot.diff, null, 2)}</pre>
              </>
            ) : (
              <>
                <p className="mono">
                  Graph hash: {snapshot.graph.semanticHash}
                </p>
                <ul className="signal-evidence">
                  {(mode === "Taste Map"
                    ? (snapshot.tasteGraph ?? snapshot.graph)
                    : snapshot.graph
                  ).nodes
                    .filter(
                      (n) =>
                        mode !== "Taste Map" ||
                        [
                          "PROFILE",
                          "EXPLICIT_PREFERENCE",
                          "CONSTRAINT",
                          "FEEDBACK",
                        ].includes(n.kind),
                    )
                    .filter(
                      (n) =>
                        mode !== "Decision Focus" ||
                        !["FEEDBACK"].includes(n.kind),
                    )
                    .map((n) => (
                      <li key={n.id}>
                        <span>
                          {n.kind} · {n.label}
                          <small className="mono">
                            Source: {n.source.kind} / {n.source.id} / v
                            {n.source.version}
                          </small>
                        </span>
                      </li>
                    ))}
                </ul>
                {mode === "Evidence / Provenance Inspector" && (
                  <pre>{JSON.stringify(snapshot.graph, null, 2)}</pre>
                )}
                <details>
                  <summary>Semantic relationships</summary>
                  <ul>
                    {snapshot.graph.edges.map((e) => (
                      <li key={e.id}>
                        {e.kind} · {e.from} → {e.to}
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            )}
          </details>
        </>
      )}
    </section>
  );
}
