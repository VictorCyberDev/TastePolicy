"use client";
import { useState } from "react";
import { CANONICAL_SIGNALS } from "./profile";
import DecisionView from "./DecisionView";
import ReceiptView from "./ReceiptView";
import StatePanel from "@/features/state/StatePanel";
import { reasons, requestNotice, type Notice } from "./presentation";
import {
  ENTITY_TYPES,
  type EntityQuery,
  type EntityResolution,
  type ProviderResult,
  type InferenceResult,
  type CulturalReceipt,
  type TargetType,
  type UnavailableReason,
  type QlooEntity,
} from "@/types/domain";
const pipeline = [
  "Human signals",
  "Qloo evidence",
  "Agent candidate",
  "TastePolicy",
  "ALLOW / ASK / REJECT / UNAVAILABLE",
  "Cultural Receipt",
];
const loading = {
  resolve: "Resolving cultural signals",
  discover: "Requesting cross-domain cultural evidence",
  evaluate: "Evaluating candidate and awaiting Cultural Receipt",
};
type Operation = keyof typeof loading;
export default function Demo() {
  const [signals, setSignals] = useState<EntityQuery[]>(() =>
    CANONICAL_SIGNALS.map((s) => ({ ...s })),
  );
  const [resolutions, setResolutions] = useState<
    ProviderResult<EntityResolution>[]
  >([]);
  const [selected, setSelected] = useState<string[]>(Array(5).fill(""));
  const [targetType, setTargetType] = useState<TargetType>("place");
  const [inference, setInference] = useState<InferenceResult | null>(null);
  const [receipt, setReceipt] = useState<CulturalReceipt | null>(null);
  const [candidate, setCandidate] = useState<QlooEntity | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [invalidSignal, setInvalidSignal] = useState<number | null>(null);
  const [judgeMode, setJudgeMode] = useState(false);
  const busy = operation !== null;
  const guidedStep = receipt
    ? 4
    : inference
      ? 3
      : selected.every(Boolean)
        ? 2
        : resolutions.length
          ? 1
          : 0;
  const invalidate = () => {
    setResolutions([]);
    setSelected(Array(5).fill(""));
    setInference(null);
    setReceipt(null);
    setCandidate(null);
    setNotice(null);
    setInvalidSignal(null);
  };
  async function call<T>(op: Operation, body: unknown): Promise<T | null> {
    setOperation(op);
    setNotice(null);
    setReceipt(null);
    try {
      const response = await fetch(`/api/demo/${op}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (result.status !== "available" || !response.ok) {
        setNotice(
          result.status === "unavailable"
            ? (reasons[result.reason as UnavailableReason] ??
                requestNotice(undefined))
            : requestNotice(result.code),
        );
        return null;
      }
      return result.data as T;
    } catch {
      setNotice(requestNotice(undefined));
      return null;
    } finally {
      setOperation(null);
    }
  }
  async function resolve() {
    const empty = signals.findIndex((s) => !s.query.trim());
    if (empty !== -1) {
      setInvalidSignal(empty);
      setNotice({
        kind: "validation",
        title: "A signal name is required",
        detail: `Enter a cultural concept for signal ${empty + 1}.`,
      });
      document.getElementById(`signal-${empty}`)?.focus();
      return;
    }
    setInvalidSignal(null);
    setInference(null);
    setCandidate(null);
    setResolutions([]);
    setSelected(Array(5).fill(""));
    const r = await call<ProviderResult<EntityResolution>[]>("resolve", {
      signals,
    });
    if (r) {
      setResolutions(r);
      const unavailable = r.find((v) => v.status === "unavailable");
      if (unavailable?.status === "unavailable")
        setNotice(reasons[unavailable.reason]);
    }
  }
  return (
    <main className="app-shell">
      <a className="skip-link" href="#workspace">
        Skip to working demo
      </a>
      <header className="topbar">
        <a href="#top" className="wordmark" aria-label="TastePolicy home">
          <span aria-hidden="true" className="brand-mark">
            T/
          </span>
          TastePolicy
        </a>
        <span className="badge">Milestone 2 — Versioned cultural policy</span>
      </header>
      <section className="hero" id="top" aria-labelledby="product-name">
        <div>
          <p className="eyebrow">Cultural authorization for AI agents.</p>
          <h1 id="product-name">TastePolicy</h1>
          <p className="hero-thesis">Permission is not preference.</p>
          <p className="hero-description">
            AI agents are learning how to act for us before they&apos;ve learned
            how to have our taste. TastePolicy checks subjective choices against
            a human&apos;s configured cultural policy before they become
            actions.
          </p>
          <a className="text-link" href="#workspace">
            Inspect the working demo <span aria-hidden="true">↘</span>
          </a>
        </div>
        <dl className="authorization-layers">
          <div>
            <dt>
              <span className="layer-index">01</span>Authentication
            </dt>
            <dd>Who are you?</dd>
          </div>
          <div>
            <dt>
              <span className="layer-index">02</span>Permissions
            </dt>
            <dd>What can the system technically do?</dd>
          </div>
          <div className="taste-layer">
            <dt>
              <span className="layer-index">03</span>TastePolicy
            </dt>
            <dd>
              Is this subjective action culturally justified under the
              configured policy?
            </dd>
          </div>
        </dl>
      </section>
      <nav className="pipeline" aria-label="Authorization pipeline">
        <ol>
          {pipeline.map((label, i) => (
            <li key={label}>
              <span className="pipeline-index">0{i + 1}</span>
              <span>{label}</span>
              {i < pipeline.length - 1 ? (
                <span className="pipeline-arrow" aria-hidden="true">
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </nav>
      <div className="workspace-heading" id="workspace" tabIndex={-1}>
        <div>
          <p className="eyebrow">Working demo / SELECT_ENTITY</p>
          <h2>From signals to an inspectable decision.</h2>
        </div>
        <p className="helper">
          Verified M1 foundation · Experimental policy
          <br />
          Optional versioned state; no LLM or action execution.
        </p>
      </div>
      <section className="judge-guide panel" aria-labelledby="judge-heading">
        <div>
          <p className="eyebrow">Judge Demo</p>
          <h2 id="judge-heading">
            Your AI wants to choose a place for you. Should it?
          </h2>
          <p className="helper" id="judge-help">
            Load five reviewed concepts and the place target. This resets the
            current demo; real resolution and your explicit identity choices
            still come next. No request runs automatically.
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          aria-describedby="judge-help"
          aria-pressed={judgeMode}
          onClick={() => {
            invalidate();
            setSignals(CANONICAL_SIGNALS.map((s) => ({ ...s })));
            setTargetType("place");
            setJudgeMode(true);
          }}
        >
          Load Judge Mode
        </button>
        {judgeMode ? (
          <ol className="guided-steps" aria-label="Judge Mode steps">
            {[
              "Resolve concepts",
              "Review five identities",
              "Discover places",
              "Propose one candidate",
              "Inspect decision & receipt",
            ].map((step, i) => (
              <li
                key={step}
                aria-current={guidedStep === i ? "step" : undefined}
              >
                <span className="mono">0{i + 1}</span> {step}
              </li>
            ))}
          </ol>
        ) : null}
      </section>
      <div
        className="operation-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {operation ? (
          <>
            <span className="status-dot" aria-hidden="true" />
            {loading[operation]}…
          </>
        ) : notice ? (
          `${notice.title}. ${notice.detail}`
        ) : receipt ? (
          "Cultural Receipt ready. Inspect the captured evidence and experimental policy below."
        ) : inference ? (
          `${inference.candidates.length} candidates returned. Propose one specific entity for cultural-policy evaluation.`
        ) : resolutions.length ? (
          "Resolution complete. Review each identity before requesting cross-domain evidence."
        ) : (
          "Enter five cultural signals. No Qloo request runs until you choose an operation."
        )}
      </div>
      {notice ? (
        <section
          className={`notice notice-${notice.kind}`}
          aria-labelledby="notice-heading"
        >
          <div className="notice-symbol" aria-hidden="true">
            {notice.kind === "validation" ? "!" : "∅"}
          </div>
          <div>
            <p className="eyebrow">
              {notice.kind === "validation"
                ? "Validation requires attention"
                : "UNAVAILABLE / no cultural authorization"}
            </p>
            <h2 id="notice-heading">
              {notice.kind === "validation"
                ? notice.title
                : "Cultural evaluation unavailable"}
            </h2>
            {notice.kind !== "validation" ? <h3>{notice.title}</h3> : null}
            <p id="request-error">{notice.detail}</p>
            <p className="helper">
              No decision issued. Missing evidence never becomes REJECT.
            </p>
          </div>
        </section>
      ) : null}
      <div className="workbench">
        <div className="inputs-column">
          <section
            className="panel"
            aria-labelledby="signals-heading"
            aria-busy={operation === "resolve"}
          >
            <div className="section-heading">
              <span className="step-number">01</span>
              <h2 id="signals-heading">Your taste signals</h2>
            </div>
            <p id="signals-help" className="helper">
              Prefilled names are concepts, not identities verified in this
              session. Resolve each, then explicitly choose its identity. Review
              Perfect Days (2023), Piranesi by Susanna Clarke and the TV show
              Severance; ambiguous matches stay visible.
            </p>
            <div className="signals-grid">
              {signals.map((s, i) => (
                <fieldset key={i} className="signal-field">
                  <legend>Signal {i + 1}</legend>
                  <label htmlFor={`signal-${i}`}>Signal {i + 1} name</label>
                  <input
                    id={`signal-${i}`}
                    maxLength={120}
                    value={s.query}
                    disabled={busy}
                    aria-describedby={
                      invalidSignal === i
                        ? "signals-help request-error"
                        : "signals-help"
                    }
                    aria-invalid={invalidSignal === i}
                    onChange={(e) => {
                      invalidate();
                      setSignals(
                        signals.map((v, j) =>
                          j === i ? { ...v, query: e.target.value } : v,
                        ),
                      );
                    }}
                  />
                  <label htmlFor={`type-${i}`}>Signal {i + 1} domain</label>
                  <select
                    id={`type-${i}`}
                    value={s.expectedType}
                    disabled={busy}
                    onChange={(e) => {
                      invalidate();
                      setSignals(
                        signals.map((v, j) =>
                          j === i
                            ? {
                                ...v,
                                expectedType: e.target
                                  .value as EntityQuery["expectedType"],
                              }
                            : v,
                        ),
                      );
                    }}
                  >
                    {ENTITY_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  {resolutions[i]?.status === "unavailable" ? (
                    <p className="helper field-status">Identity unavailable.</p>
                  ) : resolutions[i]?.status === "available" ? (
                    <>
                      <p className="helper field-status">
                        {resolutions[i].data.state} ·{" "}
                        {resolutions[i].data.matches.length} Qloo matches
                      </p>
                      <label htmlFor={`match-${i}`}>
                        Signal {i + 1} resolved identity
                      </label>
                      <select
                        id={`match-${i}`}
                        value={selected[i]}
                        disabled={busy}
                        onChange={(e) => {
                          setSelected(
                            selected.map((v, j) =>
                              j === i ? e.target.value : v,
                            ),
                          );
                          setInference(null);
                          setReceipt(null);
                          setCandidate(null);
                          setNotice(null);
                        }}
                      >
                        <option value="">Choose verified identity</option>
                        {resolutions[i].data.matches.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} · {m.type}
                            {m.releaseYear ? ` · ${m.releaseYear}` : ""}
                            {m.address ? ` · ${m.address}` : ""} ·{" "}
                            {m.id.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : null}
                </fieldset>
              ))}
            </div>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={resolve}
            >
              Resolve with Qloo
            </button>
          </section>
          <section
            className="panel"
            aria-labelledby="discovery-heading"
            aria-busy={operation === "discover"}
          >
            <div className="section-heading">
              <span className="step-number">02</span>
              <h2 id="discovery-heading">Cross-domain evidence</h2>
            </div>
            <p className="helper" id="discovery-help">
              The server re-verifies entity IDs. Rank is Qloo&apos;s returned
              order, not a policy decision.
            </p>
            <label htmlFor="target">Target domain</label>
            <select
              id="target"
              value={targetType}
              disabled={busy}
              aria-describedby="discovery-help"
              onChange={(e) => {
                setTargetType(e.target.value as TargetType);
                setInference(null);
                setReceipt(null);
                setCandidate(null);
                setNotice(null);
              }}
            >
              {["destination", "place", "brand"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <button
              type="button"
              className="primary"
              disabled={busy || selected.some((s) => !s)}
              onClick={async () => {
                setInference(null);
                setCandidate(null);
                const r = await call<InferenceResult>("discover", {
                  signalIds: selected,
                  targetType,
                });
                if (r) setInference(r);
              }}
            >
              Discover with Qloo
            </button>
            <p className="helper">
              {selected.filter(Boolean).length}/5 identities selected. Five
              distinct verified signals are required.
            </p>
            {inference ? (
              <>
                <p className="badge" data-evidence-source="live">
                  LIVE QLOO
                </p>
                <p className="helper">
                  Current server response · Query/context-relative affinity, not
                  preference probability.
                </p>
                <ol className="candidate-list">
                  {inference.candidates.map((c) => (
                    <li key={c.entity.id}>
                      <div>
                        <p className="eyebrow">
                          Candidate #{c.rank} / {c.entity.type}
                        </p>
                        <h3>{c.entity.name}</h3>
                        <p className="helper">
                          Discovery cultural affinity{" "}
                          {c.alignmentScore.toFixed(4)} · not a decision
                        </p>
                      </div>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={async () => {
                          setCandidate(c.entity);
                          const r = await call<CulturalReceipt>("evaluate", {
                            signalIds: selected,
                            candidateId: c.entity.id,
                            context: "Canonical cultural selection demo",
                          });
                          if (r) setReceipt(r);
                          requestAnimationFrame(() => {
                            document
                              .getElementById(
                                r ? "decision-panel" : "notice-heading",
                              )
                              ?.scrollIntoView({ block: "start" });
                          });
                        }}
                      >
                        Propose SELECT_ENTITY
                      </button>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="helper empty-caption">
                No candidates yet. Real Qloo evidence is required.
              </p>
            )}
          </section>
        </div>
        <div
          className={`output-column ${candidate || receipt ? "has-proposal" : ""}`}
        >
          <DecisionView
            receipt={receipt}
            candidate={candidate}
            targetType={targetType}
            busy={operation === "evaluate"}
          />
          <ReceiptView receipt={receipt} />
          <StatePanel receipt={receipt} />
        </div>
      </div>
      <footer>
        <span className="wordmark">TastePolicy /</span>
        <p>
          Qloo supplies cultural evidence. TastePolicy applies cultural policy.
        </p>
        <p className="helper">
          Apache 2.0 · Versioned state; no demographic taste assumptions or
          action execution. Aggregate affinities are not proof of individual
          preferences or future behavior.
        </p>
      </footer>
    </main>
  );
}
