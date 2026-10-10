"use client";
import { useState } from "react";
import { CANONICAL_SIGNALS } from "./profile";
import {
  ENTITY_TYPES,
  type EntityQuery,
  type EntityResolution,
  type ProviderResult,
  type InferenceResult,
  type CulturalReceipt,
  type TargetType,
  type UnavailableReason,
} from "@/types/domain";
const reasons: Record<UnavailableReason, string> = {
  not_configured:
    "Qloo not configured. Add your server-only credential to enable real data.",
  host_not_configured: "Configure the Qloo origin from your credential email.",
  affinity_scale_unverified:
    "Evaluation unavailable: verify and configure the Qloo affinity wire scale first.",
  auth_failed:
    "Qloo denied access. Check your assigned host, credential and entity-type permissions.",
  rate_limited: "Qloo request budget reached. Please wait before retrying.",
  timeout: "Qloo timed out. No policy decision was issued.",
  provider_error: "Qloo is unavailable. No policy decision was issued.",
  invalid_response:
    "Qloo returned an unsupported response. No policy decision was issued.",
  no_evidence:
    "No candidate evidence returned. This is not a cultural rejection.",
  unsupported_entity:
    "The selected entity could not be verified in this target domain.",
  unresolved_profile:
    "Verify five distinct entities from at least two cultural domains.",
};
export default function Demo() {
  const [signals, setSignals] = useState<EntityQuery[]>(
    CANONICAL_SIGNALS.map((s) => ({ ...s })),
  );
  const [resolutions, setResolutions] = useState<
    ProviderResult<EntityResolution>[]
  >([]);
  const [selected, setSelected] = useState<string[]>(Array(5).fill(""));
  const [targetType, setTargetType] = useState<TargetType>("destination");
  const [inference, setInference] = useState<InferenceResult | null>(null);
  const [receipt, setReceipt] = useState<CulturalReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const invalidate = () => {
    setResolutions([]);
    setSelected(Array(5).fill(""));
    setInference(null);
    setReceipt(null);
    setMessage("");
  };
  async function call<T>(operation: string, body: unknown): Promise<T | null> {
    setBusy(true);
    setMessage("");
    setReceipt(null);
    try {
      const response = await fetch(`/api/demo/${operation}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (result.status !== "available") {
        setMessage(
          reasons[result.reason as UnavailableReason] ??
            "Request could not be completed. No decision was issued.",
        );
        return null;
      }
      return result.data as T;
    } catch {
      setMessage("Request could not be completed. No decision was issued.");
      return null;
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 sm:py-20">
      <header className="flex flex-wrap justify-between gap-4 border-b border-current/15 pb-6">
        <span className="font-semibold">TastePolicy /</span>
        <span className="rounded-full border border-current/20 px-4 py-2 text-xs">
          Milestone 1 — Qloo vertical slice
        </span>
      </header>
      <section className="py-14">
        <p className="eyebrow">Signals → cultural evidence → decision</p>
        <h1 className="mt-5 text-5xl font-semibold tracking-tight sm:text-7xl">
          TastePolicy
        </h1>
        <p className="mt-6 max-w-2xl text-2xl">
          Cultural authorization for autonomous agents.
        </p>
        <p className="mt-5 max-w-2xl opacity-70">
          Qloo resolves what you love and supplies cross-domain evidence.
          TastePolicy applies an inspectable experimental policy. No LLM, no
          simulated results, no autonomous execution.
        </p>
      </section>
      <section className="demo-step" aria-labelledby="signals">
        <h2 id="signals">01 / Your taste signals</h2>
        <p className="helper">
          Resolve five concepts, then explicitly choose each identity. For Dune,
          inspect the release year. Ambiguous matches stay visible.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {signals.map((s, i) => (
            <fieldset
              key={i}
              className="rounded-lg border border-current/15 p-4"
            >
              <legend className="px-2 text-xs opacity-60">
                Signal {i + 1}
              </legend>
              <label htmlFor={`signal-${i}`} className="sr-only">
                Signal {i + 1} name
              </label>
              <input
                id={`signal-${i}`}
                maxLength={120}
                value={s.query}
                disabled={busy}
                onChange={(e) => {
                  invalidate();
                  setSignals(
                    signals.map((v, j) =>
                      j === i ? { ...v, query: e.target.value } : v,
                    ),
                  );
                }}
              />
              <label htmlFor={`type-${i}`} className="sr-only">
                Signal {i + 1} domain
              </label>
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
                <p className="helper mt-3">{reasons[resolutions[i].reason]}</p>
              ) : resolutions[i]?.status === "available" ? (
                <>
                  <p className="helper mt-3">
                    {resolutions[i].data.state} ·{" "}
                    {resolutions[i].data.matches.length} Qloo matches
                  </p>
                  <label htmlFor={`match-${i}`} className="sr-only">
                    Signal {i + 1} resolved identity
                  </label>
                  <select
                    id={`match-${i}`}
                    value={selected[i]}
                    disabled={busy}
                    onChange={(e) => {
                      setSelected(
                        selected.map((v, j) => (j === i ? e.target.value : v)),
                      );
                      setInference(null);
                      setReceipt(null);
                      setMessage("");
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
          className="primary mt-6"
          disabled={busy}
          onClick={async () => {
            setInference(null);
            setResolutions([]);
            setSelected(Array(5).fill(""));
            const r = await call<ProviderResult<EntityResolution>[]>(
              "resolve",
              { signals },
            );
            if (r) setResolutions(r);
          }}
        >
          Resolve with Qloo
        </button>
      </section>
      <section className="demo-step" aria-labelledby="discovery">
        <h2 id="discovery">02 / Cross-domain evidence</h2>
        <p className="helper">
          The server re-verifies entity IDs. Rank is Qloo’s returned order; it
          does not authorize an action.
        </p>
        <label htmlFor="target" className="mt-5 block text-sm">
          Target domain
        </label>
        <select
          id="target"
          value={targetType}
          disabled={busy}
          onChange={(e) => {
            setTargetType(e.target.value as TargetType);
            setInference(null);
            setReceipt(null);
          }}
        >
          {["destination", "place", "brand"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <button
          className="primary mt-4"
          disabled={busy || selected.some((s) => !s)}
          onClick={async () => {
            setInference(null);
            const r = await call<InferenceResult>("discover", {
              signalIds: selected,
              targetType,
            });
            if (r) setInference(r);
          }}
        >
          Discover with Qloo
        </button>
        {inference ? (
          <ol className="mt-6 divide-y divide-current/15">
            {inference.candidates.map((c) => (
              <li
                key={c.entity.id}
                className="flex flex-wrap items-center justify-between gap-4 py-5"
              >
                <div>
                  <span className="text-xs opacity-60">
                    #{c.rank} · {c.entity.type}
                  </span>
                  <h3 className="font-semibold">{c.entity.name}</h3>
                  <p className="helper">
                    Discovery alignment {c.alignmentScore.toFixed(3)} · not a
                    decision
                  </p>
                </div>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={async () => {
                    const r = await call<CulturalReceipt>("evaluate", {
                      signalIds: selected,
                      candidateId: c.entity.id,
                      context: "Canonical cultural selection demo",
                    });
                    if (r) setReceipt(r);
                  }}
                >
                  Propose SELECT_ENTITY
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="helper mt-6">
            No candidates yet. Real Qloo evidence is required.
          </p>
        )}
      </section>
      <section className="demo-step" aria-labelledby="decision">
        <h2 id="decision">03 / Proposed action → policy decision</h2>
        <p className="helper">
          Selecting a candidate triggers a separate candidate-specific Qloo
          query. Missing evidence never becomes REJECT.
        </p>
        {receipt ? (
          <div className="mt-6 rounded-lg border border-current/20 p-6">
            <p className="eyebrow">SELECT_ENTITY / {receipt.candidate.name}</p>
            <p className="my-4 text-4xl font-semibold" data-testid="decision">
              {receipt.decision.outcome}
            </p>
            <p>
              Alignment {receipt.alignmentScore.toFixed(3)} ·{" "}
              {receipt.decision.reasonCode}
            </p>
            <p className="helper mt-4">
              Experimental policy: ALLOW above 0.80 · ASK 0.50–0.80 · REJECT
              below 0.50. Provisional; not live-calibrated.
            </p>
          </div>
        ) : (
          <p className="helper mt-6">No decision issued.</p>
        )}
      </section>
      <section className="demo-step" aria-labelledby="receipt">
        <h2 id="receipt">04 / Cultural Receipt</h2>
        {receipt ? (
          <>
            <p className="helper mt-3">
              Qloo · {receipt.qlooEvidence.provenance.endpoint} ·{" "}
              {receipt.policyVersion}
            </p>
            <h3 className="mt-6 font-semibold">Input contributions</h3>
            {receipt.explainability.status === "available" ? (
              <ul className="mt-3 space-y-2">
                {receipt.explainability.contributions.map((c) => (
                  <li key={c.signalId}>
                    {receipt.inputSignals.find((s) => s.id === c.signalId)
                      ?.name ?? c.signalId}
                    : {c.score.toFixed(3)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="helper mt-3">
                Explainability unavailable: {receipt.explainability.reason}. No
                contributions invented.
              </p>
            )}
            <p className="helper mt-3">
              Contribution scores are not probabilities, additive percentages or
              causal proof. Low-impact inputs may be omitted by Qloo.
            </p>
            <details className="mt-6">
              <summary className="cursor-pointer font-semibold">
                Machine-readable receipt
              </summary>
              <pre className="mt-4 max-h-96 overflow-auto rounded-lg border border-current/15 p-4 text-xs">
                {JSON.stringify(receipt, null, 2)}
              </pre>
            </details>
          </>
        ) : (
          <p className="helper mt-3">
            A receipt appears only after successful provider evidence
            evaluation.
          </p>
        )}
      </section>
      <div role="status" aria-live="polite" className="mt-6">
        {busy ? "Requesting real Qloo evidence…" : message}
      </div>
      <footer className="mt-12 text-xs opacity-65">
        Apache 2.0 · No persistence, learning, demographic taste assumptions or
        action execution.
      </footer>
    </main>
  );
}
