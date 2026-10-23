"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { CANONICAL_SIGNALS } from "@/features/demo/profile";
import ReceiptView from "@/features/demo/ReceiptView";
import InteractivePanel from "@/features/interactive/InteractivePanel";
import type {
  CulturalReceipt,
  QlooEntity,
  EntityResolution,
  ProviderResult,
  InferenceResult,
} from "@/types/domain";
import type { StateEvaluation, StateVersion } from "@/lib/state/types";
import Outcome from "./Outcome";
import type { InteractiveAuthorization } from "@/lib/interactive/types";
import "./arena.css";
export default function Arena() {
  const [resolutions, setResolutions] = useState<
      ProviderResult<EntityResolution>[]
    >([]),
    [selected, setSelected] = useState<string[]>(Array(5).fill("")),
    [reviewed, setReviewed] = useState(false),
    [candidates, setCandidates] = useState<InferenceResult | null>(null),
    [candidate, setCandidate] = useState<QlooEntity | null>(null),
    [receipt, setReceipt] = useState<CulturalReceipt | null>(null),
    [evaluation, setEvaluation] = useState<StateEvaluation | null>(null),
    [state, setState] = useState<StateVersion | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [fault, setFault] = useState(false),
    [price, setPrice] = useState(""),
    [unavailable, setUnavailable] = useState(false);
  const [interaction, setInteraction] =
    useState<InteractiveAuthorization | null>(null);
  const last = useRef(0);
  async function call(path: string, body: unknown) {
    const delay = 1100 - (Date.now() - last.current);
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      const r = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok || data.status !== "available") {
        const code = data.reason ?? data.code;
        throw Error(
          code === "not_configured"
            ? "Live Qloo is not configured. No synthetic fallback is used."
            : code === "persistence_not_configured"
              ? "Hosted persistence is not configured. No in-memory substitute is used."
              : code === "STATE_VERSION_CONFLICT"
                ? "State changed. Refresh explicitly before evaluating again."
                : "Required operation unavailable. No preference was inferred and no automatic retry was made.",
        );
      }
      return data.data;
    } finally {
      last.current = Date.now();
    }
  }
  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    setNotice(label);
    try {
      await fn();
      setNotice("Captured result ready. Inspect the source label and receipt.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Operation unavailable.");
    } finally {
      setBusy(false);
    }
  }
  async function evaluateState() {
    setInteraction(null);
    const e = await call("/api/state/evaluate", {
      agentId: "Arena-Concierge",
      expectedStateVersion: state!.stateVersion,
      candidate,
      context: {
        key: "arena_dinner",
        domain: candidate!.type,
        ...(price !== ""
          ? { price: { amount: Number(price), currency: "USD" } }
          : {}),
      },
    });
    setEvaluation(e);
    setUnavailable(false);
  }
  async function mutate(payload: unknown) {
    const next = await call("/api/state/mutate", {
      expectedStateVersion: state!.stateVersion,
      idempotencyKey: crypto.randomUUID(),
      payload,
    });
    setState(next.state);
    setEvaluation(null);
    setInteraction(null);
  }
  const cultural =
    evaluation?.cultural.status === "available"
      ? evaluation.cultural.data
      : evaluation
        ? null
        : receipt;
  const decision =
    interaction?.finalDecision.outcome ??
    evaluation?.decision.outcome ??
    (unavailable
      ? "UNAVAILABLE"
      : state
        ? undefined
        : receipt?.decision.outcome);
  return (
    <main className="arena">
      <header className="arenaTop">
        <Link href="/">TastePolicy · full engineering demo</Link>
        <span>DECISION ARENA</span>
      </header>
      <section className="arenaHero">
        <p className="eyebrow">Preference authority for autonomous agents</p>
        <h1>
          An AI agent wants to make a taste-sensitive choice for you. Should it?
        </h1>
        <p>
          Qloo gives agents taste. TastePolicy gives that taste authority
          boundaries.
        </p>
        <p className="arenaChain">
          Proposal → cultural evidence → preference authorization → bounded next
          action
        </p>
      </section>
      <div className="arenaGrid">
        <section className="arenaCard">
          <p className="eyebrow">Agent proposal</p>
          <h2>
            {candidate ? candidate.name : "Choose a place for a dinner or stay"}
          </h2>
          <p>
            A concierge may recommend a place or add it to a draft. It may not
            book or pay.
          </p>
          <h3>Whose taste?</h3>
          <p>
            Your five explicitly reviewed preferences. No demographic
            assumptions.
          </p>
          <ul className="arenaSeeds">
            {CANONICAL_SIGNALS.map((s) => (
              <li key={s.query}>
                {s.query} <small>{s.expectedType}</small>
              </li>
            ))}
          </ul>
          <button
            disabled={busy || !!state}
            onClick={() =>
              run("Resolving five cultural identities", async () => {
                setResolutions([]);
                setSelected(Array(5).fill(""));
                setReviewed(false);
                setCandidates(null);
                setCandidate(null);
                setReceipt(null);
                setEvaluation(null);
                setInteraction(null);
                setUnavailable(false);
                setResolutions(
                  await call("/api/demo/resolve", {
                    signals: CANONICAL_SIGNALS,
                  }),
                );
              })
            }
          >
            Resolve live identities
          </button>
          {resolutions.map((r, i) => (
            <label key={i}>
              {CANONICAL_SIGNALS[i].query}
              <select
                aria-label={`Identity for ${CANONICAL_SIGNALS[i].query}`}
                value={selected[i]}
                disabled={busy || !!state}
                onChange={(e) => {
                  setSelected(
                    selected.map((v, j) => (j === i ? e.target.value : v)),
                  );
                  setReviewed(false);
                  setCandidates(null);
                  setCandidate(null);
                  setReceipt(null);
                  setEvaluation(null);
                  setInteraction(null);
                  setUnavailable(false);
                }}
              >
                <option value="">Review and select identity</option>
                {r.status === "available"
                  ? r.data.matches.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} · {m.type}
                        {m.releaseYear ? ` · ${m.releaseYear}` : ""}
                      </option>
                    ))
                  : null}
              </select>
              {r.status === "unavailable" && (
                <small>Identity unavailable; no match assumed.</small>
              )}
            </label>
          ))}
          {resolutions.length > 0 && (
            <label className="arenaCheck">
              <input
                type="checkbox"
                checked={reviewed}
                disabled={!!state}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              I reviewed all five distinct identities; these are my explicit
              signals.
            </label>
          )}
          <button
            disabled={busy || !reviewed || selected.some((s) => !s)}
            onClick={() =>
              run("Requesting cross-domain place evidence", async () => {
                setReceipt(null);
                setEvaluation(null);
                setInteraction(null);
                setCandidate(null);
                setUnavailable(false);
                setCandidates(
                  await call("/api/demo/discover", {
                    signalIds: selected,
                    targetType: "place",
                  }),
                );
              })
            }
          >
            Discover real Qloo places
          </button>
          {candidates && (
            <label>
              Agent&apos;s proposed place
              <select
                value={candidate?.id ?? ""}
                disabled={busy}
                onChange={(e) => {
                  setCandidate(
                    candidates.candidates.find(
                      (c) => c.entity.id === e.target.value,
                    )?.entity ?? null,
                  );
                  setReceipt(null);
                  setEvaluation(null);
                  setInteraction(null);
                  setUnavailable(false);
                }}
              >
                <option value="">Choose a real candidate</option>
                {candidates.candidates.map((c) => (
                  <option key={c.entity.id} value={c.entity.id}>
                    {c.entity.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <h3>Current context</h3>
          <p>Dinner / stay · recommendation only. No transaction requested.</p>
          <button
            disabled={busy || !candidate}
            onClick={() =>
              run("Evaluating this specific candidate", async () => {
                setReceipt(null);
                setEvaluation(null);
                setInteraction(null);
                setUnavailable(false);
                try {
                  setReceipt(
                    await call("/api/demo/evaluate", {
                      signalIds: selected,
                      candidateId: candidate!.id,
                      context:
                        "Dinner or stay recommendation; no booking or payment authority.",
                    }),
                  );
                } catch (e) {
                  setUnavailable(true);
                  throw e;
                }
              })
            }
          >
            Evaluate candidate with Qloo
          </button>
        </section>
        <div className="arenaDecisionColumn">
          <p role="status" aria-live="polite">
            {notice ||
              "No provider request has been made. Resolve, review, then evaluate explicitly."}
          </p>
          {decision ? (
            <Outcome
              decision={decision}
              label={
                interaction
                  ? "CAPTURED CLARIFICATION — EXPLICIT USER ANSWER"
                  : evaluation
                    ? "CURRENT STATE-LINKED AUTHORIZATION"
                    : unavailable
                      ? "CULTURAL EVALUATION UNAVAILABLE"
                      : "CURRENT QLOO-BACKED EVALUATION"
              }
              reason={
                interaction
                  ? `${interaction.finalDecision.basis}: explicit answer applies to this interaction only.`
                  : evaluation
                    ? `${evaluation.decision.basis}: ${evaluation.decision.rules.join(" · ")}`
                    : unavailable
                      ? "Required cultural evidence could not be established."
                      : receipt!.decision.reasonCode
              }
            />
          ) : (
            <section className="arenaOutcome">
              <h2>Awaiting evidence</h2>
              <p>No decision or provider ID is selected automatically.</p>
            </section>
          )}
          <section className="arenaCard">
            <h2>Why the result can change</h2>
            <p>
              Keep the same proposal. Change an explicit rule or supply missing
              context; do not change the cultural score.
            </p>
            <button
              disabled={busy || !receipt || !!state}
              onClick={() =>
                run("Saving an explicit temporary profile", async () => {
                  await call("/api/state/session", {});
                  const current = await call("/api/state/read", {});
                  if (current.state.entries.length) {
                    const stored = current.state.entries
                      .filter(
                        (e: { kind: string }) => e.kind === "EXPLICIT_LIKE",
                      )
                      .map((e: { entity: { id: string } }) => e.entity.id)
                      .sort();
                    const reviewed = receipt!.inputSignals
                      .map((e) => e.id)
                      .sort();
                    if (JSON.stringify(stored) !== JSON.stringify(reviewed))
                      throw Error(
                        "Existing profile uses different anchors. It was not adopted or overwritten. Use a fresh demo session in the engineering view.",
                      );
                    setState(current.state);
                    return;
                  }
                  const next = await call("/api/state/mutate", {
                    expectedStateVersion: current.state.stateVersion,
                    idempotencyKey: crypto.randomUUID(),
                    payload: {
                      kind: "INITIALIZE",
                      signals: receipt!.inputSignals,
                    },
                  });
                  setState(next.state);
                })
              }
            >
              Save these signals to temporary SELF state
            </button>
            {state && (
              <>
                <p>
                  SELF · state version {state.stateVersion}. Explicit state
                  only.
                </p>
                <button
                  disabled={busy}
                  onClick={() =>
                    run("Reading current state", async () => {
                      setState((await call("/api/state/read", {})).state);
                      setEvaluation(null);
                      setInteraction(null);
                    })
                  }
                >
                  Refresh state
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    run("Recording your explicit dinner budget", () =>
                      mutate({
                        kind: "FEEDBACK",
                        feedback: {
                          category: "TOO_EXPENSIVE",
                          scope: "CONTEXT",
                          persistence: "CONTEXT_SCOPED",
                          contextKey: "arena_dinner",
                          maxPrice: { amount: 100, currency: "USD" },
                        },
                      }),
                    )
                  }
                >
                  Set dinner budget: USD 100
                </button>
                <label>
                  Candidate price in USD (leave blank if unknown)
                  <input
                    type="number"
                    min="0"
                    max="1000000"
                    value={price}
                    onChange={(e) => {
                      setPrice(e.target.value);
                      setEvaluation(null);
                      setInteraction(null);
                    }}
                  />
                </label>
                <button
                  disabled={busy || !candidate}
                  onClick={() =>
                    run("Evaluating current state and context", evaluateState)
                  }
                >
                  Evaluate under current state
                </button>
                <button
                  disabled={busy || !candidate}
                  onClick={() =>
                    run("Recording an explicit candidate exclusion", () =>
                      mutate({
                        kind: "FEEDBACK",
                        feedback: {
                          category: "SPECIFIC_DISLIKE",
                          scope: "CANDIDATE_ONLY",
                          persistence: "DURABLE",
                          candidateId: candidate!.id,
                        },
                      }),
                    )
                  }
                >
                  Do not select this candidate for me
                </button>
                {state.entries
                  .filter((e) => e.kind !== "EXPLICIT_LIKE")
                  .map((e) => (
                    <p key={e.signalId}>
                      {e.constraint?.kind ?? e.category} · {e.scope}{" "}
                      <button
                        disabled={busy}
                        onClick={() =>
                          run("Explicitly removing this rule", () =>
                            mutate({ kind: "REMOVE", signalId: e.signalId }),
                          )
                        }
                      >
                        Remove this rule
                      </button>
                    </p>
                  ))}
                {evaluation && (
                  <InteractivePanel
                    key={evaluation.evaluationId}
                    evaluation={evaluation}
                    onClarified={setInteraction}
                    onEvaluateRepair={async (verified) => {
                      await run(
                        "New authorization for the separately selected repair",
                        async () => {
                          const e = await call("/api/state/evaluate", {
                            agentId: verified.agentId,
                            expectedStateVersion: verified.stateVersion,
                            candidate: verified.action.candidate,
                            context: verified.context,
                          });
                          setCandidate(verified.action.candidate);
                          setEvaluation(e);
                        },
                      );
                    }}
                  />
                )}
              </>
            )}
            <p>
              ASK is not guaranteed by pressing a button: the accepted evaluator
              must find a genuine unresolved factor. REJECT repair requires a
              valid separately verified replacement.
            </p>
          </section>
        </div>
      </div>
      <section className="arenaEvidence">
        <article>
          <h2>Qloo contributed</h2>
          <p>
            Cultural relationships, resolved identity and candidate-specific
            evidence.
          </p>
          {cultural ? (
            <>
              <p>
                <strong data-evidence-source="live">
                  LIVE QLOO — response captured in this session
                </strong>
              </p>
              <p>
                {cultural.candidate.name} · {cultural.candidate.type}
              </p>
              <p>
                Affinity {cultural.alignmentScore} (raw{" "}
                {cultural.qlooEvidence.rawAffinity}, scale{" "}
                {cultural.qlooEvidence.scale}). Not confidence or individual
                preference probability.
              </p>
              <p>Explainability: {cultural.explainability.status}</p>
              {cultural.explainability.status !== "unavailable" && (
                <ul>
                  {cultural.explainability.contributions.map((c) => (
                    <li key={c.signalId}>
                      {cultural.inputSignals.find((s) => s.id === c.signalId)
                        ?.name ?? c.signalId}
                      : {c.score}
                    </li>
                  ))}
                </ul>
              )}
              <p>
                {cultural.qlooEvidence.provenance.host} ·{" "}
                {cultural.qlooEvidence.provenance.endpoint} ·{" "}
                {cultural.qlooEvidence.provenance.fetchedAt}
              </p>
            </>
          ) : (
            <p>
              No candidate-specific cultural evidence available for the
              displayed state evaluation.
            </p>
          )}
        </article>
        <article>
          <h2>TastePolicy contributed</h2>
          <p>
            Whose state · context · explicit constraints · deterministic
            decision · continuation boundary · auditable receipt.
          </p>
          <p>
            Qloo does not own the user&apos;s durable rules. A high affinity
            cannot override an explicit exclusion.
          </p>
          <p>
            Experimental policy; not human-calibrated. No LLM decides the
            outcome.
          </p>
        </article>
      </section>
      <details className="arenaCard">
        <summary>
          Failure handling rehearsal — explicit demo fault injection
        </summary>
        <p>
          No Qloo outage is claimed. This separate rehearsal neither changes a
          real result nor overrides a known hard block.
        </p>
        <button onClick={() => setFault(!fault)}>
          {fault
            ? "Close fault rehearsal"
            : "Inject unavailable evidence rehearsal"}
        </button>
        {fault && (
          <Outcome
            decision="UNAVAILABLE"
            label="DEMO FAULT INJECTION — CULTURAL EVIDENCE UNAVAILABLE"
            reason="Presentation rehearsal only. No Qloo call, no authorization and no fabricated receipt."
          />
        )}
      </details>
      <details className="arenaCard">
        <summary>
          Recorded live acceptance — historical, not a live fallback
        </summary>
        <p>
          RECORDED LIVE ACCEPTANCE · 2026-10-13T15:41:38.396Z. HOUSE OF FINN
          JUHL HAKUBA / place: affinity 0.9233086745343598, ALLOW, complete
          explainability. Source: committed M1 live acceptance report. This
          observation is not a current receipt, provider response, or current
          authorization.
        </p>
        <a href="https://github.com/VictorCyberDev/TastePolicy/blob/35ceed937ef0bebb88b200af6f21bcc362210cb8/docs/evaluation/milestone-1-live-acceptance-2026-10-13.md">
          Inspect historical acceptance provenance
        </a>
      </details>
      {cultural && <ReceiptView receipt={cultural} source="live" />}
      {interaction && (
        <details className="arenaCard">
          <summary>Captured clarification receipt</summary>
          <pre>{JSON.stringify(interaction, null, 2)}</pre>
        </details>
      )}
      {evaluation && (
        <details className="arenaCard">
          <summary>State-linked receipt</summary>
          <pre>{JSON.stringify(evaluation, null, 2)}</pre>
        </details>
      )}
      <footer className="arenaCard">
        <h2>
          Knowing someone is not permission to act on everything you know about
          them.
        </h2>
        <p>
          External obedience proof: run the separate examples/win-gate/agent.mjs
          process through the existing M1.6 local interface. Browser policy
          presentation is not a separate-agent execution claim.
        </p>
        <Link href="/">Open the complete engineering demo</Link>
      </footer>
    </main>
  );
}
