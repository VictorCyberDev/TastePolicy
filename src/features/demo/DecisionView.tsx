import type { CulturalReceipt, QlooEntity, TargetType } from "@/types/domain";

const decisionCopy = {
  ALLOW: {
    mark: "+",
    title: "Cultural policy: ALLOW",
    copy: "Available evidence satisfies the configured experimental cultural-policy requirements.",
  },
  ASK: {
    mark: "?",
    title: "Cultural policy: ASK",
    copy: "The experimental cultural policy does not cross the ALLOW boundary. Human review is required; interactive clarification is not implemented.",
  },
  REJECT: {
    mark: "×",
    title: "Cultural policy: REJECT",
    copy: "Available cultural evidence falls below the configured experimental policy boundary.",
  },
};
export function proposalLabel(type: TargetType) {
  return type === "destination"
    ? "Travel agent proposal"
    : type === "place"
      ? "Place-selection agent proposal"
      : "Brand-selection agent proposal";
}
export default function DecisionView({
  receipt,
  candidate,
  targetType,
  busy,
}: {
  receipt: CulturalReceipt | null;
  candidate: QlooEntity | null;
  targetType: TargetType;
  busy: boolean;
}) {
  const proposed = receipt?.candidate ?? candidate;
  const presentation = receipt ? decisionCopy[receipt.decision.outcome] : null;
  return (
    <section
      className="panel decision-panel"
      id="decision-panel"
      aria-labelledby="decision-heading"
      aria-busy={busy}
    >
      <div className="section-heading">
        <span className="step-number">03</span>
        <h2 id="decision-heading">Cultural policy evaluation</h2>
      </div>
      {proposed ? (
        <div className="proposal">
          <p className="eyebrow">
            {proposalLabel(proposed.type as TargetType)}
          </p>
          <h3>{proposed.name}</h3>
          <dl className="inline-facts">
            <div>
              <dt>Action</dt>
              <dd>SELECT_ENTITY</dd>
            </div>
            <div>
              <dt>Target</dt>
              <dd>{proposed.type}</dd>
            </div>
          </dl>
          <p className="helper">
            Proposal framing only. No agent executes this choice.
          </p>
        </div>
      ) : (
        <div className="empty-state">
          <span className="empty-mark" aria-hidden="true">
            →
          </span>
          <h3>A proposal needs evidence.</h3>
          <p>
            Resolve your signals and discover candidates in {targetType}. Then
            propose one specific entity.
          </p>
          <p className="helper">No decision issued.</p>
        </div>
      )}
      {receipt && presentation ? (
        <div
          className={`decision-result outcome-${receipt.decision.outcome.toLowerCase()}`}
        >
          <div className="outcome-heading">
            <span className="outcome-mark" aria-hidden="true">
              {presentation.mark}
            </span>
            <div>
              <p className="eyebrow">Cultural policy</p>
              <h3 aria-label={presentation.title} data-testid="decision">
                {receipt.decision.outcome}
              </h3>
            </div>
          </div>
          <p>{presentation.copy}</p>
          <p className="badge">Experimental policy</p>
          <p className="helper">
            Qloo affinity is query/context-relative aggregate evidence, not
            probability that you like this candidate.
          </p>
          <dl className="inline-facts">
            <div>
              <dt>Cultural affinity</dt>
              <dd>{receipt.alignmentScore.toFixed(4)}</dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd className="mono">{receipt.decision.reasonCode}</dd>
            </div>
          </dl>
          <p className="boundary-note">
            Cultural policy only. This grants no spending, purchasing, booking,
            sharing private information, legal or account authority.
          </p>
        </div>
      ) : null}
      <p className="helper">
        A separate candidate-specific Qloo query supplies evaluation evidence.
        Discovery rank does not authorize an action.
      </p>
    </section>
  );
}
