import type { CulturalReceipt } from "@/types/domain";
import {
  AUTHORITY_BOUNDARY,
  SOURCE_LABELS,
  type EvidenceSource,
} from "@/lib/proof/receipt";
export default function SignatureReceipt({
  receipt,
  source,
}: {
  receipt: CulturalReceipt;
  source: EvidenceSource;
}) {
  return (
    <article
      className="signature-receipt"
      aria-label="Signature Cultural Authorization Receipt"
    >
      <div className="receipt-header">
        <p className="eyebrow">TASTEPOLICY / Cultural Authorization Receipt</p>
        <span className="badge" data-evidence-source={source}>
          {SOURCE_LABELS[source]}
        </span>
      </div>
      <p className="signature-outcome">{receipt.decision.outcome}</p>
      <h3>{receipt.candidate.name}</h3>
      <dl className="receipt-facts">
        <div>
          <dt>Action</dt>
          <dd>
            {receipt.action.kind} · {receipt.candidate.type}
          </dd>
        </div>
        <div>
          <dt>Cultural affinity</dt>
          <dd>
            {receipt.alignmentScore.toFixed(4)} · Qloo ·{" "}
            {receipt.qlooEvidence.scale}
          </dd>
        </div>
        <div>
          <dt>Contribution explainability</dt>
          <dd>{receipt.explainability.status.toUpperCase()}</dd>
        </div>
        <div>
          <dt>Experimental policy</dt>
          <dd className="mono">{receipt.policyVersion}</dd>
        </div>
        <div>
          <dt>Receipt</dt>
          <dd className="mono">{receipt.receiptId}</dd>
        </div>
      </dl>
      <p className="boundary-note">{AUTHORITY_BOUNDARY}</p>
    </article>
  );
}
