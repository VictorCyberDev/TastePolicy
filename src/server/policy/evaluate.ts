import type {
  CulturalEvidence,
  PolicyDecision,
  ProviderResult,
} from "@/types/domain";
import { POLICY_V1 } from "./thresholds";
import { normalizeAffinity } from "./normalization";
export function evaluateEvidence(
  evidence: CulturalEvidence | null,
): ProviderResult<PolicyDecision> {
  if (
    !evidence ||
    normalizeAffinity(evidence.rawAffinity, evidence.scale) !==
      evidence.alignmentScore ||
    !Number.isFinite(evidence.alignmentScore)
  )
    return { status: "unavailable", reason: "no_evidence" };
  const score = evidence.alignmentScore;
  if (score > POLICY_V1.allowAbove)
    return {
      status: "available",
      data: { outcome: "ALLOW", reasonCode: "STRONG_ALIGNMENT" },
    };
  if (score < POLICY_V1.rejectBelow)
    return {
      status: "available",
      data: { outcome: "REJECT", reasonCode: "WEAK_ALIGNMENT" },
    };
  return {
    status: "available",
    data: { outcome: "ASK", reasonCode: "UNCERTAIN_ALIGNMENT" },
  };
}
