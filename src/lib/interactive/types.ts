import type {
  Context,
  StateDecision,
  StateEvaluation,
} from "@/lib/state/types";
import type { InferenceResult } from "@/types/domain";
export type FactorKind =
  "PRICE_REQUIRED" | "PRICE_CURRENCY_REQUIRED" | "CULTURAL_BORDERLINE";
export interface Factor {
  kind: FactorKind;
  constraintId?: string;
  currency?: string;
  question: string;
  policyEffect: string;
  answerSchema: "MONEY_OR_UNKNOWN" | "DISPOSITION";
}
export interface ClarificationPlan {
  schemaVersion: "clarification-plan-v1";
  evaluationId: string;
  profileId: string;
  stateVersion: number;
  parentClarificationId: string | null;
  status: "ACTIONABLE" | "NO_ACTIONABLE_CLARIFICATION" | "STALE";
  planId: string;
  factor?: Factor;
  evidenceSource: "captured";
}
export type Answer =
  | { kind: "PRICE"; amount: number; currency: string }
  | { kind: "UNKNOWN" }
  | {
      kind: "DISPOSITION";
      value: "ACCEPTABLE" | "UNACCEPTABLE" | "STILL_UNSURE";
    };
export interface InteractiveAuthorization {
  schemaVersion: "interactive-authorization-v1";
  interactionId: string;
  originalEvaluation: StateEvaluation;
  parentClarificationId: string | null;
  plan: ClarificationPlan;
  answer: Answer;
  context: Context;
  finalDecision: StateDecision;
  capturedEvidenceReference: string;
  stateVersion: number;
  stateHash: string;
  provenance: {
    source: "EXPLICIT_INTERACTION";
    answeredAt: string;
    requestId: string;
  };
  evidenceSource: "captured";
}
export interface ClarificationRecord {
  id: string;
  profileId: string;
  evaluationId: string;
  stateVersion: number;
  parentId: string | null;
  factor: FactorKind;
  plan: ClarificationPlan;
  answer: Answer;
  result: InteractiveAuthorization;
  key: string;
  payloadHash: string;
  createdAt: string;
}
export type RepairStatus =
  | "REPAIR_AVAILABLE"
  | "NO_VERIFIED_REPAIR_WITHIN_BOUND"
  | "NO_VERIFIABLE_REPAIR"
  | "UNAVAILABLE"
  | "STALE";
export interface RepairResult {
  schemaVersion: "repair-plan-v1";
  repairId: string;
  originalEvaluation: StateEvaluation;
  stateVersion: number;
  status: RepairStatus;
  reason: string;
  method: {
    kind: "BOUNDED_CANDIDATE_SUBSTITUTION";
    structuralCost: 1;
    maxCandidates: 1;
    maxProviderCalls: 4;
    providerCalls: number;
    ordering: "DISCOVERY_RANK_THEN_ID";
    discovered: { id: string; rank: number }[];
    discoveryProvenance?: InferenceResult["provenance"];
  };
  preservedConstraints: string[];
  changeSet: { field: "candidate"; from: string; to: string }[];
  verification?: StateEvaluation;
  condition?: string;
  evidenceSource: "captured";
  createdAt: string;
  requestId: string;
}
export interface RepairRecord {
  id: string;
  profileId: string;
  evaluationId: string;
  stateVersion: number;
  verificationId: string | null;
  status: RepairStatus;
  result: RepairResult;
  key: string;
  payloadHash: string;
  createdAt: string;
}
