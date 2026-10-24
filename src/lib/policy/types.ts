import type { Context, StateDecision } from "@/lib/state/types";
import type { TargetType } from "@/types/domain";

export const POLICY_SCHEMA = "taste-policy-v1";
export const EVIDENCE_CLASSES = [
  "HARD_CONSTRAINT",
  "EXPLICIT_NEGATIVE",
  "EXPLICIT_POSITIVE",
  "CONTEXTUAL",
  "EXPLORATION",
] as const;
export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];
export const FRESHNESS_CLASSES = [
  "EXPLICIT_POSITIVE",
  "CONTEXTUAL",
  "EXPLORATION",
] as const;
export type FreshnessClass = (typeof FRESHNESS_CLASSES)[number];
export const AUTONOMY_LEVELS = [
  "OBSERVE",
  "CONFIRM_ABOVE_LIMIT",
  "AUTONOMOUS",
] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

export interface PolicyDocument {
  schemaVersion: typeof POLICY_SCHEMA;
  // Maximum age in days of the newest applicable entry of a class.
  freshness: Partial<Record<FreshnessClass, number>>;
  autonomy: {
    default: AutonomyLevel;
    byDomain: Partial<Record<TargetType, AutonomyLevel>>;
    byAgent: Record<string, AutonomyLevel>;
    // Required semantics for CONFIRM_ABOVE_LIMIT.
    limit?: { amount: number; currency: string };
  };
}
export const OVERRIDE_EFFECTS = [
  "ALLOW_THROUGH_ASK",
  "ALLOW_THROUGH_CULTURAL_REJECT",
] as const;
export type OverrideEffect = (typeof OVERRIDE_EFFECTS)[number];
export interface PolicyOverride {
  overrideId: string;
  effect: OverrideEffect;
  scope: {
    candidateId?: string;
    contextKey?: string;
    domain?: TargetType;
    agentId?: string;
  };
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
}
export type PolicyBasis =
  | StateDecision["basis"]
  | "STALE_EVIDENCE"
  | "AUTONOMY_CEILING"
  | "USER_TEMPORARY_OVERRIDE";
export type PolicyStep =
  "BASE" | "HARD_RULES" | "FRESHNESS" | "AUTONOMY" | "OVERRIDE";
export interface TraceEntry {
  step: PolicyStep;
  // What this step did: kept, lowered, raised or ignored (with the winning step).
  action: "KEPT" | "LOWERED" | "RAISED" | "IGNORED" | "STOPPED";
  outcome: StateDecision["outcome"];
  note?: string;
  rules?: string[];
}
export interface PolicyDecision {
  outcome: StateDecision["outcome"];
  basis: PolicyBasis;
  rules: string[];
  baseOutcome: StateDecision["outcome"];
  policyVersion: number | null;
  trace: TraceEntry[];
}
export interface PolicyInput {
  agentId: string;
  context: Context;
  now: string;
}
export const DEFAULT_POLICY: PolicyDocument = {
  schemaVersion: POLICY_SCHEMA,
  freshness: {},
  autonomy: { default: "AUTONOMOUS", byDomain: {}, byAgent: {} },
};
