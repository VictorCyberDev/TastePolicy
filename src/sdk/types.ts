import type {
  Context,
  StateEvaluation,
  StateDecision,
} from "@/lib/state/types";
import type { QlooEntity } from "@/types/domain";
export interface PassportSummary {
  schemaVersion: "taste-passport-v1";
  passportRef: string;
  subjectRef: string;
  passportVersion: number;
  stateVersion: number;
  stateHash: string;
  displayLabel: string;
  visibility: "PRIVATE" | "SHARED_BY_GRANT";
  status: "ACTIVE" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
  provenance: "EXPLICIT_USER_REVIEWED";
  supportedCapabilities: ("PREFERENCE_AUTHORIZATION" | "CAPTURED_REPLAY")[];
  supportedActions: "SELECT_ENTITY"[];
  supportedCandidateDomains: ("brand" | "place" | "destination")[];
  stateSummary?: { entryCounts: Record<string, number> };
  semanticHash: string;
}
export type SubjectiveAction =
  "SUGGEST" | "RANK" | "SHORTLIST" | "ADD_TO_DRAFT" | "PRESENT_AS_SELECTED";
export interface EvaluationRequest {
  passportRef: string;
  grantId?: string;
  idempotencyKey: string;
  // Omit for the legacy contract. A request above the owner's ceiling is ASK.
  requestedAction?: SubjectiveAction;
  proposal: {
    agentId: string;
    candidate: QlooEntity;
    context: Context;
    expectedStateVersion: number;
  };
}
export interface AuthorizationResponse {
  subjectRef: string;
  schemaVersion: "taste-authorization-response-v1";
  evaluationRef: string;
  passportRef: string;
  stateVersion: number;
  stateHash: string;
  decision: StateDecision["outcome"];
  decisionBasis: StateDecision["basis"];
  unresolvedFactors: string[];
  // Present only for ASK. A CLARIFICATION_REQUIRED cannot be approved or
  // leased: supply the fact and evaluate again.
  ask?: {
    kind: "AUTHORITY_CONFIRMATION" | "CLARIFICATION_REQUIRED";
    reasons: string[];
    question: string;
  };
  receiptRef: string;
  status: "COMPLETED";
  continuation: {
    schemaVersion: "taste-continuation-v1";
    permitted: string[];
    // The same permission on the subjective-action ladder.
    permittedActions: SubjectiveAction[];
    automaticRetry: false;
    authorityBoundary: string;
  };
  createdAt: string;
}
export type ReceiptResponse = AuthorizationResponse & {
  source: "recorded";
  receiptSchemaVersion: "taste-platform-receipt-v1";
  authorizationEvidence: {
    sourceEvaluationSchemaVersion: StateEvaluation["schemaVersion"];
  } & Pick<
    StateEvaluation,
    | "evaluationId"
    | "stateVersion"
    | "stateHash"
    | "agentId"
    | "action"
    | "context"
    | "decision"
    | "cultural"
    | "culturalRequest"
    | "requestId"
    | "evaluatedAt"
    | "source"
  >;
};

// The choice as it is now: the material fields, or their commitments
// (taste-commitments-v1). Unknown fields such as images are ignored.
export interface CurrentChoice {
  candidate?: { id: string; name: string; type: string } & Record<
    string,
    unknown
  >;
  context?: { key: string; domain: string } & Record<string, unknown>;
  candidateCommitment?: string;
  contextCommitment?: string;
}
