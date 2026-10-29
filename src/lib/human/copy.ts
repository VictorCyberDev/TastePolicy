// Human vocabulary for the main experience. Technical terms stay in the
// developer, protocol and evidence surfaces; this module is the one place the
// translation lives so the two never drift apart.
import type { SubjectiveAction } from "@/lib/policy/types";

export const TERMS = {
  Passport: "Your Taste",
  Policy: "Your Rules",
  "Action ceiling": "How far AI may go",
  ASK: "Needs your answer",
  Lease: "What AI can do right now",
  Receipt: "Why this happened",
  Timeline: "History",
  Inspector: "Decision details",
  "Agent credential": "Connected app / agent",
} as const;

export type Outcome = "ALLOW" | "ASK" | "REJECT" | "UNAVAILABLE";

export const OUTCOME_HUMAN: Record<
  Outcome,
  { label: string; glyph: string; line: string }
> = {
  ALLOW: {
    label: "Go ahead",
    glyph: "✓",
    line: "This fits you and what works today. Your AI may go as far as you allowed.",
  },
  ASK: {
    label: "Needs your answer",
    glyph: "?",
    line: "Something important is still unknown, so your AI stops and asks instead of guessing.",
  },
  REJECT: {
    label: "Not this one",
    glyph: "✕",
    line: "This breaks something you told us you need. A great fit for your taste can't override that.",
  },
  UNAVAILABLE: {
    label: "Couldn't check",
    glyph: "‖",
    line: "A source we need couldn't answer. We paused instead of guessing.",
  },
};

// The ladder, in human words first and developer terms second.
export const ACTION_HUMAN: Record<
  SubjectiveAction,
  { label: string; detail: string }
> = {
  SUGGEST: { label: "Suggest", detail: "Mention it as an idea" },
  RANK: { label: "Compare", detail: "Put options in order" },
  SHORTLIST: { label: "Shortlist", detail: "Set it aside for you to look at" },
  ADD_TO_DRAFT: { label: "Add to a plan", detail: "Pencil it into a draft" },
  PRESENT_AS_SELECTED: {
    label: "Present as the choice",
    detail: "Tell you it's the one",
  },
};

// Human wording for requirement keys the experience knows about. Unknown keys
// fall back to a readable form of the key; nothing here asserts a fact.
export const REQUIREMENT_HUMAN: Record<
  string,
  { label: string; question: string; unknown: string }
> = {
  accessible_entrance: {
    label: "Step-free entrance",
    question: "Is the entrance usable without steps?",
    unknown: "Entrance access not confirmed",
  },
  walking_minutes: {
    label: "A short walk",
    question: "About how many minutes is the walk from where you'll start?",
    unknown: "Walking time not confirmed",
  },
  noise_level: {
    label: "A quieter room",
    question: "How loud is it likely to be?",
    unknown: "Noise level not confirmed",
  },
  price: {
    label: "Within budget",
    question: "What would it cost you?",
    unknown: "Price not confirmed",
  },
  seated_option: {
    label: "Seating",
    question: "Can you be seated comfortably?",
    unknown: "Seating not confirmed",
  },
};
export const humanKey = (key: string) =>
  REQUIREMENT_HUMAN[key]?.label ??
  key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
