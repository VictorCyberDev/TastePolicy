import type { CulturalReceipt } from "@/types/domain";
import {
  checkDecisionStability,
  explainTasteDecision,
  SOURCE_LABELS,
  type EvidenceSource,
} from "@/lib/proof/receipt";
export default function ProofView({
  receipt,
  source,
}: {
  receipt: CulturalReceipt;
  source: EvidenceSource;
}) {
  const explained = explainTasteDecision(receipt),
    stability = checkDecisionStability(receipt);
  if (explained.status !== "available" || stability.status !== "available")
    return (
      <p className="helper">
        Proof unavailable for this captured receipt. No replacement decision is
        generated.
      </p>
    );
  const s = stability.data;
  return (
    <details className="proof-disclosure">
      <summary>Why does TastePolicy matter?</summary>
      <p className="badge" data-evidence-source={source}>
        {SOURCE_LABELS[source]}
      </p>
      <section aria-labelledby="comparison-heading">
        <h3 id="comparison-heading">Capability Comparison</h3>
        <p className="helper">
          One proposal, one candidate. Architectural capabilities, not a
          benchmark or preference-accuracy comparison.
        </p>
        <div className="comparison-grid">
          <article aria-label="Agent proposal only">
            <h4>A / Agent proposal only</h4>
            <p>{receipt.candidate.name}</p>
            <p className="mono">{receipt.candidate.id}</p>
            <p>{receipt.action.kind}</p>
            <p>
              An agent can propose this action, but proposal alone does not
              establish cultural authorization.
            </p>
            <p className="helper">
              No cultural evidence, provenance, policy outcome or receipt in
              this layer.
            </p>
          </article>
          <article aria-label="Qloo cultural evidence">
            <h4>B / Qloo cultural evidence</h4>
            <p>{receipt.candidate.name}</p>
            <p className="mono">{receipt.candidate.id}</p>
            <p>{receipt.action.kind}</p>
            <p>
              Cultural affinity {receipt.alignmentScore.toFixed(4)} ·{" "}
              {receipt.qlooEvidence.scale}
            </p>
            <p>Explainability {receipt.explainability.status.toUpperCase()}</p>
            <p className="mono">
              {receipt.qlooEvidence.provenance.endpoint} ·{" "}
              {receipt.qlooEvidence.provenance.fetchedAt}
            </p>
            <p>
              Qloo provides cultural evidence. Evidence is not itself the
              authorization policy.
            </p>
          </article>
          <article aria-label="TastePolicy authorization">
            <h4>C / TastePolicy</h4>
            <p>{receipt.candidate.name}</p>
            <p className="mono">{receipt.candidate.id}</p>
            <p>{receipt.action.kind}</p>
            <p>Cultural policy: {receipt.decision.outcome}</p>
            <p className="mono">{receipt.decision.reasonCode}</p>
            <p>
              Same candidate-specific evidence, deterministic experimental
              policy and Cultural Authorization Receipt.
            </p>
            <p className="helper">
              Required missing evidence produces UNAVAILABLE, not a fabricated
              decision.
            </p>
          </article>
        </div>
      </section>
      <section className="stability-panel" aria-labelledby="stability-heading">
        <h3 id="stability-heading">Stability-lite</h3>
        <p>
          Deterministic replay {s.replay.stable ? "STABLE" : "NOT STABLE"} ·{" "}
          {s.replay.identical}/{s.replay.runs} identical decisions and reason
          codes.
        </p>
        <p className="helper">
          Same captured normalized input and current policy; no new Qloo
          request.
        </p>
        <dl className="receipt-facts">
          {s.boundary.transitions.map((t) => (
            <div key={t.to}>
              <dt>Distance toward {t.to}</dt>
              <dd>
                {t.margin.toFixed(4)} {t.direction} · boundary {t.boundary}.{" "}
                {t.touchChangesOutcome
                  ? "Touching the boundary changes outcome."
                  : "Must move strictly beyond the boundary; touching it remains ASK."}
              </dd>
            </div>
          ))}
        </dl>
        <p className="helper">{s.note}</p>
        <details>
          <summary>Structured stability output</summary>
          <pre tabIndex={0} aria-label="Structured stability output">
            {JSON.stringify(s, null, 2)}
          </pre>
        </details>
      </section>
    </details>
  );
}
