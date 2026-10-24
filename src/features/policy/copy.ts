import type {
  AutonomyLevel,
  FreshnessClass,
  OverrideEffect,
  PolicyBasis,
  PolicyStep,
} from "@/lib/policy/types";

export const LEVEL_COPY: Record<
  AutonomyLevel,
  { label: string; help: string }
> = {
  OBSERVE: {
    label: "Ask me every time",
    help: "The agent can look, but never acts on a match without asking you.",
  },
  CONFIRM_ABOVE_LIMIT: {
    label: "Ask me above a limit",
    help: "The agent may go ahead on a match when the price is within your limit. Unknown price means it asks.",
  },
  AUTONOMOUS: {
    label: "Let it decide",
    help: "A match is enough. Your saved rules and blocks still apply first.",
  },
};
export const FRESHNESS_COPY: Record<FreshnessClass, string> = {
  EXPLICIT_POSITIVE: "Things you said you like",
  CONTEXTUAL: "Preferences for a particular situation",
  EXPLORATION: "Things you wanted to explore",
};
export const EFFECT_COPY: Record<OverrideEffect, string> = {
  ALLOW_THROUGH_ASK: "Skip the question and allow",
  ALLOW_THROUGH_CULTURAL_REJECT: "Allow even though it does not match my taste",
};
export const BASIS_COPY: Record<PolicyBasis, string> = {
  USER_HARD_BLOCK: "You blocked this exact choice",
  CONTEXT_CONSTRAINT: "It breaks one of your saved limits",
  CULTURAL_POLICY: "How well it matches your taste",
  CULTURAL_PLUS_CONTEXT: "Taste match, within your limits",
  UNRESOLVED_CONTEXT: "A detail your rule needs is missing",
  REQUIRED_EVIDENCE_MISSING: "Taste evidence was unavailable",
  STALE_EVIDENCE: "Your taste information is older than you allowed",
  AUTONOMY_CEILING: "Your autonomy setting asks first",
  USER_TEMPORARY_OVERRIDE: "A temporary permission you gave",
};
export const STEP_COPY: Record<PolicyStep, string> = {
  BASE: "Taste check and your saved rules",
  HARD_RULES: "Hard rules",
  FRESHNESS: "How recent your information is",
  AUTONOMY: "Autonomy setting",
  OVERRIDE: "Temporary permissions",
};
export const OUTCOME_COPY = {
  ALLOW: "Allowed",
  ASK: "Ask first",
  REJECT: "Not a match",
  UNAVAILABLE: "Could not check",
} as const;
export const CHANGE_COPY: Record<string, string> = {
  OVERRIDE_THIS_CANDIDATE: "Give a temporary permission for this exact choice",
  RAISE_AUTONOMY: "Let this agent decide without asking",
  IGNORE_FRESHNESS: "Stop treating older information as stale",
  REMOVE_ENTRY: "Remove one of your saved rules",
};
