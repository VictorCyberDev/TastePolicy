// Design contracts only. No evaluation or scoring implementation exists in Phase 0.
export type PolicyDecisionType = "ALLOW" | "ASK" | "REJECT";
export interface TasteSignal {
  id: string;
  source: "explicit" | "inferred";
  entityId: string;
}
export interface TasteContext {
  purpose: string;
  recipientId?: string;
}
export interface ProposedAction {
  id: string;
  kind: string;
  context: TasteContext;
}
export interface CulturalEvidence {
  source: string;
  description: string;
}
export interface PolicyDecision {
  outcome: PolicyDecisionType;
  reasons: readonly string[];
}
export interface CulturalReceipt {
  id: string;
  actionId: string;
  decision: PolicyDecision;
  evidence: readonly CulturalEvidence[];
}
export type ProviderResult<T> =
  | { status: "available"; data: T }
  | { status: "unavailable"; reason: "not_configured" | "provider_error" };
