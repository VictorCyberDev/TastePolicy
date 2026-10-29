import type {
  CandidateFact,
  Requirement,
  RequirementReport,
} from "@/lib/requirements/types";
import type {
  CulturalReceipt,
  EvaluationResult,
  QlooEntity,
  TargetType,
} from "@/types/domain";
export const FEEDBACK_CATEGORIES = [
  "SPECIFIC_DISLIKE",
  "TOO_EXPENSIVE",
  "WRONG_CONTEXT",
  "WRONG_AESTHETIC",
  "WRONG_ATMOSPHERE",
  "TOO_SAFE",
  "TOO_ADVENTUROUS",
  "OTHER",
] as const;
export const SCOPES = [
  "CANDIDATE_ONLY",
  "CONTEXT",
  "DOMAIN",
  "GLOBAL_PREFERENCE",
] as const;
export const PERSISTENCE = [
  "EPHEMERAL",
  "CONTEXT_SCOPED",
  "DOMAIN_SCOPED",
  "DURABLE",
] as const;
export type Scope = (typeof SCOPES)[number];
export type Persistence = (typeof PERSISTENCE)[number];
export interface Context {
  key: string;
  domain: TargetType;
  price?: { amount: number; currency: string };
  // M24, additive: explicit requirements for this choice and the candidate
  // facts known about it. Absent means the legacy contract applies unchanged.
  requirements?: Requirement[];
  facts?: CandidateFact[];
}
export interface FeedbackInput {
  category: (typeof FEEDBACK_CATEGORIES)[number];
  scope: Scope;
  persistence: Persistence;
  candidateId?: string;
  contextKey?: string;
  domain?: TargetType;
  maxPrice?: { amount: number; currency: string };
  comment?: string;
  confirmGlobal?: boolean;
}
export interface StateEntry {
  signalId: string;
  kind:
    | "EXPLICIT_LIKE"
    | "EXPLORATION_INTENT"
    | "DURABLE_FEEDBACK"
    | "CONTEXTUAL_PREFERENCE"
    | "CONSTRAINT";
  entity?: QlooEntity;
  exploration?: import("@/lib/trajectory/types").ExplorationIntent;
  scope: Scope;
  persistence: Persistence;
  candidateId?: string;
  contextKey?: string;
  domain?: TargetType;
  constraint?:
    | { kind: "EXCLUDE_CANDIDATE" }
    | { kind: "MAX_PRICE"; amount: number; currency: string };
  category?: FeedbackInput["category"];
  source: "USER";
  sourceEventId: string;
  createdAt: string;
  expiresAt?: string;
}
export interface StateVersion {
  profileId: string;
  stateVersion: number;
  parentVersion: number | null;
  createdAt: string;
  mutationId: string | null;
  stateHash: string;
  entries: StateEntry[];
}
export interface Profile {
  profileId: string;
  createdAt: string;
  currentStateVersion: number;
  status: "TEMPORARY";
  expiresAt: string;
}
export interface Session {
  tokenHash: string;
  profileId: string;
  expiresAt: string;
  mutations: number;
}
export interface FeedbackEvent extends FeedbackInput {
  eventId: string;
  profileId: string;
  stateVersion: number;
  createdAt: string;
  expiresAt?: string;
  requestId: string;
}
export interface MutationRequest {
  expectedStateVersion: number;
  idempotencyKey: string;
  payload:
    | { kind: "INITIALIZE"; signals: QlooEntity[] }
    | { kind: "FEEDBACK"; feedback: FeedbackInput }
    | { kind: "REMOVE"; signalId: string };
  requestId: string;
}
export interface MutationResult {
  state: StateVersion;
  event?: FeedbackEvent;
  mutationId: string;
}
export interface MutationRecord {
  profileId: string;
  key: string;
  payloadHash: string;
  result: MutationResult;
}
export interface StateDecision {
  outcome: "ALLOW" | "ASK" | "REJECT" | "UNAVAILABLE";
  basis:
    | "USER_HARD_BLOCK"
    | "CONTEXT_CONSTRAINT"
    | "CULTURAL_POLICY"
    | "CULTURAL_PLUS_CONTEXT"
    | "UNRESOLVED_CONTEXT"
    | "REQUIRED_EVIDENCE_MISSING";
  rules: string[];
}
export interface SessionAuthority {
  requestedAction: string;
  ceiling: string;
  ceilingSource: string;
  escalationRequired: boolean;
  outcome: StateDecision["outcome"];
  basis: string;
  rules: string[];
  permitted: string[];
}
export interface StateEvaluation {
  schemaVersion: "taste-state-evaluation-v1";
  evaluationId: string;
  profileId: string;
  stateVersion: number;
  stateHash: string;
  agentId: string;
  action: { kind: "SELECT_ENTITY"; candidate: QlooEntity };
  context: Context;
  decision: StateDecision;
  cultural: EvaluationResult;
  culturalRequest: "SKIPPED_INDEPENDENT_BLOCK" | "REQUESTED";
  // M24, additive. Present only when the context carried requirements.
  requirements?: RequirementReport;
  // Present only when the caller named a session action ceiling and an
  // intended action. The one policy engine produced it (evaluateWithPolicy).
  authority?: SessionAuthority;
  requestId: string;
  evaluatedAt: string;
  source: "live" | "recorded";
}
export interface EvidenceBundle {
  bundleId: string;
  profileId: string;
  stateVersion: number;
  contractVersion: "qloo-event-m1";
  requestedAt: string;
  receivedAt: string;
  completeness: CulturalReceipt["explainability"]["status"];
  stateSignalIds: string[];
  receipt: CulturalReceipt;
}
export class StateFailure extends Error {
  constructor(
    readonly code:
      | "INVALID_INPUT"
      | "SESSION_EXPIRED"
      | "STATE_VERSION_CONFLICT"
      | "IDEMPOTENCY_KEY_CONFLICT"
      | "RATE_LIMITED"
      | "NOT_FOUND"
      | "NOT_CONFIGURED",
  ) {
    super(code);
  }
}
