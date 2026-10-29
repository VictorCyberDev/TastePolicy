// Contextual requirements and candidate facts (M24). Generic by design: a
// requirement is a rule about a named fact, never a diagnosis. "walking_minutes
// <= 10" is a requirement; why the person needs it is not modelled here.
//
// Source separation: Qloo supplies cultural evidence only. A candidate fact
// comes from a place provider, the person, or authored copy, and says which.
// Unknown stays unknown: a missing or inferred fact never satisfies a hard
// requirement and never violates one.

export type FactValue = string | number | boolean;

export const REQUIREMENT_OPERATORS = [
  "eq",
  "neq",
  "lte",
  "gte",
  "lt",
  "gt",
  "in",
  "not_in",
] as const;
export type RequirementOperator = (typeof REQUIREMENT_OPERATORS)[number];

// hard: a known violation REJECTs, an unknown fact ASKs, an unavailable one is
// UNAVAILABLE. soft: reported and shown, but never changes the outcome.
export type RequirementImportance = "hard" | "soft";

export interface Requirement {
  // Fact key this rule is about, e.g. "step_free_access".
  key: string;
  operator: RequirementOperator;
  expected: FactValue | FactValue[];
  importance: RequirementImportance;
  // Where the requirement itself came from (not where any fact came from).
  sourceRequirement: "USER" | "EXPLICIT_CONTEXT";
  unit?: string;
  // Human wording, presentation only; never part of a commitment.
  label?: string;
  // A fact older than this (by observedAt) is treated as unknown.
  maxFactAgeDays?: number;
}

export const FACT_STATES = ["known", "unknown", "unavailable"] as const;
export type FactState = (typeof FACT_STATES)[number];
// VERIFIED: supplied by a named provider. USER_CONFIRMED: the person said so.
// INFERRED: a guess; recorded for transparency but never decisive.
export const FACT_EVIDENCE = [
  "VERIFIED",
  "USER_CONFIRMED",
  "INFERRED",
] as const;
export type FactEvidence = (typeof FACT_EVIDENCE)[number];
// Qloo is deliberately absent: it provides cultural evidence, not place facts.
export const FACT_SOURCE_TYPES = [
  "PLACE_PROVIDER",
  "USER",
  "AUTHORED",
  "AGENT",
] as const;
export type FactSourceType = (typeof FACT_SOURCE_TYPES)[number];

export interface CandidateFact {
  key: string;
  value: FactValue | null;
  state: FactState;
  evidence: FactEvidence;
  source: string;
  sourceType: FactSourceType;
  observedAt?: string;
  confidence?: number;
  unit?: string;
  note?: string;
}

export type RequirementStatus =
  "SATISFIED" | "VIOLATED" | "UNKNOWN" | "UNAVAILABLE";
export type UnknownReason =
  | "NO_FACT"
  | "FACT_UNKNOWN"
  | "INFERRED_ONLY"
  | "STALE"
  | "CONFLICT"
  | "TYPE_MISMATCH";

export interface RequirementResult {
  requirement: Requirement;
  status: RequirementStatus;
  reason?: UnknownReason | "PROVIDER_UNAVAILABLE";
  fact?: CandidateFact;
}

export interface RequirementReport {
  schemaVersion: "taste-requirements-v1";
  results: RequirementResult[];
  hardViolated: string[];
  hardUnknown: string[];
  hardUnavailable: string[];
}
