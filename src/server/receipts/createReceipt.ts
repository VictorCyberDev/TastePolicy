import type {
  CulturalEvidence,
  CulturalReceipt,
  InferenceResult,
  PolicyDecision,
  ProposedAction,
  QlooEntity,
} from "@/types/domain";
import { POLICY_V1 } from "@/server/policy/thresholds";
export function createReceipt(
  input: {
    action: ProposedAction;
    signals: QlooEntity[];
    evidence: CulturalEvidence;
    provenance: InferenceResult["provenance"];
    decision: PolicyDecision;
    requestId: string;
  },
  clock = () => new Date().toISOString(),
  id = () => crypto.randomUUID(),
): CulturalReceipt {
  return {
    receiptId: id(),
    policyVersion: POLICY_V1.version,
    decision: input.decision,
    action: input.action,
    candidate: input.evidence.entity,
    inputSignals: input.signals,
    alignmentScore: input.evidence.alignmentScore,
    qlooEvidence: {
      rawAffinity: input.evidence.rawAffinity,
      scale: input.evidence.scale,
      provenance: input.provenance,
    },
    explainability: input.evidence.explainability,
    policy: {
      allowAbove: POLICY_V1.allowAbove,
      rejectBelow: POLICY_V1.rejectBelow,
      calibration: POLICY_V1.calibration,
    },
    requestId: input.requestId,
    evaluatedAt: clock(),
  };
}
