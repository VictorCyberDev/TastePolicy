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

// The subjective-action ladder: what an agent does with a choice that fits the
// person's taste, from least to most consequential. None of these is an
// execution authority; buying, booking and paying are outside TastePolicy.
export const SUBJECTIVE_ACTIONS = [
  "SUGGEST",
  "RANK",
  "SHORTLIST",
  "ADD_TO_DRAFT",
  "PRESENT_AS_SELECTED",
] as const;
export type SubjectiveAction = (typeof SUBJECTIVE_ACTIONS)[number];
export const actionLevel = (a: SubjectiveAction) =>
  SUBJECTIVE_ACTIONS.indexOf(a);
// Legacy continuation vocabulary (taste-continuation-v1) mapped to the ladder.
// "recommend" put a choice in front of the person without selecting it for
// them, which is SHORTLIST; "add_to_draft" is ADD_TO_DRAFT. A legacy ALLOW
// therefore permits SUGGEST..ADD_TO_DRAFT and never PRESENT_AS_SELECTED.
export const LEGACY_ACTION_MAP = {
  recommend: "SHORTLIST",
  add_to_draft: "ADD_TO_DRAFT",
} as const satisfies Record<string, SubjectiveAction>;
export const LEGACY_PERMITTED_ACTIONS: SubjectiveAction[] = [
  "SUGGEST",
  "RANK",
  "SHORTLIST",
  "ADD_TO_DRAFT",
];
export interface ActionCeilings {
  // The highest action the agent may take without asking the owner.
  default: SubjectiveAction;
  byDomain: Partial<Record<TargetType, SubjectiveAction>>;
  byAgent: Record<string, SubjectiveAction>;
}
// Sensitive subjective domains. The owner marks a domain sensitive; the
// repository's domains are brand, destination and place, so sensitivity is a
// property of the domain, never inferred from content.
export interface SensitiveRule {
  alwaysAsk?: boolean;
  maxAction?: SubjectiveAction;
  // Newest explicit positive evidence must be at most this many days old.
  freshExplicitDays?: number;
  // A temporary override cannot lift the ASK this rule produced.
  noOverride?: boolean;
}
export type SensitiveRules = Partial<Record<TargetType, SensitiveRule>>;
// Organization-level ceiling. It can only lower what a subject policy allows
// and never touches hard rules; the subject's own constraints stay untouched.
export interface OrganizationCeiling {
  organizationId: string;
  maxAction: SubjectiveAction;
}
export type CeilingSource =
  "AGENT" | "DOMAIN" | "DEFAULT" | "SENSITIVE_DOMAIN" | "ORGANIZATION" | "NONE";
export interface ActionTrace {
  requested: SubjectiveAction | null;
  ceiling: SubjectiveAction | null;
  ceilingSource: CeilingSource;
  escalationRequired: boolean;
  // Actions the decision lets the agent take now, in ladder order.
  permitted: SubjectiveAction[];
}

export interface PolicyDocument {
  schemaVersion: typeof POLICY_SCHEMA;
  // Optional, additive. Absent means the legacy contract applies unchanged.
  actions?: ActionCeilings;
  sensitive?: SensitiveRules;
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
  | "ACTION_CEILING"
  | "SENSITIVE_DOMAIN"
  | "USER_TEMPORARY_OVERRIDE";
export type PolicyStep =
  | "BASE"
  | "HARD_RULES"
  | "FRESHNESS"
  | "AUTONOMY"
  | "SENSITIVE"
  | "ACTION"
  | "OVERRIDE";
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
  // Present only when an action was requested or a ladder is configured.
  action?: ActionTrace;
}
export interface PolicyInput {
  agentId: string;
  context: Context;
  now: string;
  requestedAction?: SubjectiveAction;
}
export const DEFAULT_POLICY: PolicyDocument = {
  schemaVersion: POLICY_SCHEMA,
  freshness: {},
  autonomy: { default: "AUTONOMOUS", byDomain: {}, byAgent: {} },
};
