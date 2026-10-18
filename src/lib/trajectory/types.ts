import type { Context, StateEvaluation } from "@/lib/state/types";
import type {
  InferenceResult,
  QlooEntity,
  UnavailableReason,
} from "@/types/domain";
export const TOLERANCES = ["CONSERVATIVE", "BALANCED", "OPEN"] as const;
export const BREADTHS = ["STRICT", "MODERATE", "BROAD"] as const;
export const TRAJECTORY_FEEDBACK = [
  "TOO_SAFE",
  "ABOUT_RIGHT",
  "TOO_ADVENTUROUS",
  "STOP_EXPLORING",
] as const;
export type Tolerance = (typeof TOLERANCES)[number];
export type Breadth = (typeof BREADTHS)[number];
export type TrajectoryFeedback = (typeof TRAJECTORY_FEEDBACK)[number];
export interface ExplorationIntent {
  target: QlooEntity;
  tolerance: Tolerance;
  context: Context;
}
export interface TrajectoryIntent extends ExplorationIntent {
  trajectoryId: string;
  profileId: string;
  intentStateVersion: number;
  intentStateHash: string;
  signalId: string;
  createdAt: string;
  requestId: string;
  key: string;
  payloadHash: string;
}
export interface BridgeQuery {
  queryId: string;
  omittedAnchorId: string;
  signalIds: string[];
}
export interface CapturedQuery extends BridgeQuery {
  result: InferenceResult;
}
export interface BridgeCandidate {
  entity: QlooEntity;
  supportCount: number;
  bestRank: number;
  memberships: { queryId: string; rank: number }[];
  authorizationStatus: "UNVERIFIED";
}
export interface TrajectoryGeneration {
  feedbackCursor: number;
  ordinal: number;
  schemaVersion: "taste-trajectory-v1";
  generationId: string;
  trajectoryId: string;
  profileId: string;
  stateVersion: number;
  stateHash: string;
  target: QlooEntity;
  anchors: QlooEntity[];
  breadth: Breadth;
  context: Context;
  queryDefinitions: BridgeQuery[];
  queries: CapturedQuery[];
  candidates: BridgeCandidate[];
  status:
    | "BRIDGES_AVAILABLE"
    | "NO_BRIDGE_AT_CURRENT_BREADTH"
    | "TRAJECTORY_UNAVAILABLE";
  reason?: UnavailableReason;
  generatedAt: string;
  requestId: string;
  semanticHash: string;
  key: string;
  payloadHash: string;
  evidenceSource: "CAPTURED";
}
export interface TrajectoryEvent {
  ordinal: number;
  eventId: string;
  trajectoryId: string;
  profileId: string;
  stateVersion: number;
  generationId: string | null;
  candidateId: string | null;
  evaluationId: string | null;
  clarificationId: string | null;
  kind:
    | "TRAJECTORY_FEEDBACK"
    | "TRAJECTORY_STOPPED"
    | "STEP_AUTHORIZED"
    | "TARGET_SELECTED";
  feedback?: TrajectoryFeedback;
  breadth?: Breadth;
  createdAt: string;
  requestId: string;
  key: string;
  payloadHash: string;
}
export interface TrajectoryView {
  intent: TrajectoryIntent;
  generation: TrajectoryGeneration | null;
  events: TrajectoryEvent[];
  stateVersion: number;
  stateHash: string;
  anchors: QlooEntity[];
  breadth: Breadth;
  status: "ACTIVE" | "STALE" | "STOPPED" | "COMPLETE";
  evaluations: StateEvaluation[];
  evidenceSource: "CAPTURED";
}
