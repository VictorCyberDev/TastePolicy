export const ENTITY_TYPES = [
  "artist",
  "book",
  "brand",
  "destination",
  "movie",
  "place",
  "tv_show",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
export type TargetType = "brand" | "destination" | "place";
export type AffinityScale = "unit" | "percent";
export type PolicyDecisionType = "ALLOW" | "ASK" | "REJECT";
export type UnavailableReason =
  | "not_configured"
  | "host_not_configured"
  | "affinity_scale_unverified"
  | "auth_failed"
  | "rate_limited"
  | "timeout"
  | "provider_error"
  | "invalid_response"
  | "no_evidence"
  | "unsupported_entity"
  | "unresolved_profile";
export type ProviderResult<T> =
  | { status: "available"; data: T }
  | { status: "unavailable"; reason: UnavailableReason };
export interface QlooEntity {
  id: string;
  name: string;
  type: EntityType;
  releaseYear?: number;
  address?: string;
}
export interface EntityQuery {
  query: string;
  expectedType: EntityType;
}
export interface EntityResolution {
  query: EntityQuery;
  matches: QlooEntity[];
  state: "single" | "ambiguous" | "no_match";
}
export interface SignalContribution {
  signalId: string;
  score: number;
}
export type Explainability =
  | {
      status: "available";
      contributions: SignalContribution[];
      omittedSignalsMayHaveLowImpact: true;
    }
  | {
      status: "unavailable";
      reason: "not_returned" | "provider_warning" | "unsupported_shape";
    };
export interface CulturalEvidence {
  entity: QlooEntity;
  rawAffinity: number;
  alignmentScore: number;
  scale: AffinityScale;
  rank: number;
  explainability: Explainability;
}
export interface InferenceResult {
  candidates: CulturalEvidence[];
  provenance: {
    provider: "qloo";
    endpoint: "/v2/insights";
    host: string;
    fetchedAt: string;
    signalIds: string[];
    targetType: EntityType;
    specificCandidateId?: string;
  };
}
export interface ProposedAction {
  kind: "SELECT_ENTITY";
  targetEntity: QlooEntity;
  context?: string;
}
export interface PolicyDecision {
  outcome: PolicyDecisionType;
  reasonCode: "STRONG_ALIGNMENT" | "UNCERTAIN_ALIGNMENT" | "WEAK_ALIGNMENT";
}
export interface CulturalReceipt {
  receiptId: string;
  policyVersion: string;
  decision: PolicyDecision;
  action: ProposedAction;
  candidate: QlooEntity;
  inputSignals: QlooEntity[];
  alignmentScore: number;
  qlooEvidence: {
    rawAffinity: number;
    scale: AffinityScale;
    provenance: InferenceResult["provenance"];
  };
  explainability: Explainability;
  policy: {
    allowAbove: number;
    rejectBelow: number;
    calibration: "provisional_not_live_calibrated";
  };
  requestId: string;
  evaluatedAt: string;
}
export type EvaluationResult = ProviderResult<CulturalReceipt>;
