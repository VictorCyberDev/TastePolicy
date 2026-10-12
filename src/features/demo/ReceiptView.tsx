import type { CulturalReceipt } from "@/types/domain";
export default function ReceiptView({
  receipt,
}: {
  receipt: CulturalReceipt | null;
}) {
  return (
    <section className="panel receipt-panel" aria-labelledby="receipt-heading">
      <div className="section-heading">
        <span className="step-number">04</span>
        <h2 id="receipt-heading">Cultural Receipt</h2>
      </div>
      <p className="helper">
        A captured audit snapshot of the evidence and policy used for this
        choice.
      </p>
      {receipt ? (
        <>
          <div className="receipt-header">
            <span className="eyebrow">Evidence record</span>
            <span className="badge">Experimental policy</span>
          </div>
          <dl className="receipt-facts">
            <div>
              <dt>Proposed action</dt>
              <dd>
                {receipt.action.kind} · {receipt.candidate.name}
              </dd>
            </div>
            <div>
              <dt>Final cultural decision</dt>
              <dd>{receipt.decision.outcome}</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>Qloo · {receipt.qlooEvidence.provenance.endpoint}</dd>
            </div>
            <div>
              <dt>Raw affinity / configured scale</dt>
              <dd>
                {receipt.qlooEvidence.rawAffinity} /{" "}
                {receipt.qlooEvidence.scale}
              </dd>
            </div>
            <div>
              <dt>Normalized alignment</dt>
              <dd>{receipt.alignmentScore.toFixed(3)}</dd>
            </div>
            <div>
              <dt>Explainability</dt>
              <dd>{receipt.explainability.status}</dd>
            </div>
            <div>
              <dt>Policy version</dt>
              <dd className="mono">{receipt.policyVersion}</dd>
            </div>
          </dl>
          <div className="policy-note">
            <h3>Experimental policy</h3>
            <p>
              ALLOW above {receipt.policy.allowAbove} · ASK{" "}
              {receipt.policy.rejectBelow}–{receipt.policy.allowAbove} inclusive
              · REJECT below {receipt.policy.rejectBelow}.
            </p>
            <p className="helper">
              {receipt.policy.calibration === "provisional_not_live_calibrated"
                ? "Provisional; not live-calibrated or scientifically validated."
                : ""}
            </p>
          </div>
          <details open>
            <summary>
              Signals considered · {receipt.inputSignals.length}
            </summary>
            <ul className="signal-evidence">
              {receipt.inputSignals.map((s) => (
                <li key={s.id}>
                  <span>{s.name}</span>
                  <span className="badge">{s.type}</span>
                </li>
              ))}
            </ul>
          </details>
          <details open>
            <summary>Why · structured contribution evidence</summary>
            {receipt.explainability.status === "unavailable" ? (
              <p className="helper">
                Explainability unavailable: {receipt.explainability.reason}. No
                contributions invented.
              </p>
            ) : (
              <>
                <p className="helper">
                  Explainability {receipt.explainability.status} · omission:{" "}
                  {receipt.explainability.omission}.{" "}
                  {receipt.explainability.issues.join(", ")}
                </p>
                {receipt.explainability.contributions.length ? (
                  <ul className="signal-evidence">
                    {receipt.explainability.contributions.map((c) => (
                      <li key={c.signalId}>
                        <span>
                          {receipt.inputSignals.find((s) => s.id === c.signalId)
                            ?.name ?? c.signalId}
                        </span>
                        <span className="mono">{c.score.toFixed(3)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="helper">No parsed contributions returned.</p>
                )}
                <p className="helper">
                  {receipt.explainability.missingSignalIds.length} signals have
                  no contribution value;{" "}
                  {receipt.explainability.omittedSignalIds.length} are
                  explicitly marked omitted.
                </p>
              </>
            )}
            <p className="helper">
              Contribution scores are not probabilities, additive percentages or
              causal proof. Missing contributions are not assumed to be
              low-impact.
            </p>
          </details>
          <details>
            <summary>Provenance &amp; versions</summary>
            <dl className="receipt-facts">
              <div>
                <dt>Host</dt>
                <dd className="mono">{receipt.qlooEvidence.provenance.host}</dd>
              </div>
              <div>
                <dt>Candidate ID</dt>
                <dd className="mono">{receipt.candidate.id}</dd>
              </div>
              <div>
                <dt>Evidence fetched</dt>
                <dd>{receipt.qlooEvidence.provenance.fetchedAt}</dd>
              </div>
              <div>
                <dt>Evaluated</dt>
                <dd>{receipt.evaluatedAt}</dd>
              </div>
              <div>
                <dt>Receipt ID</dt>
                <dd className="mono">{receipt.receiptId}</dd>
              </div>
              <div>
                <dt>Request ID</dt>
                <dd className="mono">{receipt.requestId}</dd>
              </div>
              <div>
                <dt>Schema</dt>
                <dd className="mono">{receipt.schemaVersion}</dd>
              </div>
              <div>
                <dt>Normalization</dt>
                <dd className="mono">{receipt.normalizationVersion}</dd>
              </div>
            </dl>
            <p className="helper">
              An inspectable snapshot; not signed or tamper-proof. All captured
              fields remain available below.
            </p>
          </details>
          <details>
            <summary>Machine-readable receipt</summary>
            <pre tabIndex={0} aria-label="Machine-readable Cultural Receipt">
              {JSON.stringify(receipt, null, 2)}
            </pre>
          </details>
        </>
      ) : (
        <div className="empty-state">
          <span className="empty-mark" aria-hidden="true">
            ≡
          </span>
          <h3>Evidence before authorization.</h3>
          <p>
            A receipt appears only after successful provider evidence
            evaluation. Unavailable evaluations do not manufacture a receipt.
          </p>
        </div>
      )}
    </section>
  );
}
