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
export interface EvaluationRequest {
  passportRef: string;
  grantId?: string;
  idempotencyKey: string;
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
  receiptRef: string;
  status: "COMPLETED";
  continuation: {
    schemaVersion: "taste-continuation-v1";
    permitted: string[];
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
