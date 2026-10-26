// Typed ASK. Deterministic: the class comes from the recorded decision basis
// and rules, never from a model. Two different things were both called ASK:
//
//  AUTHORITY_CONFIRMATION  The decision is settled; the owner's own rule says
//                          to check with them first (e.g. autonomy OBSERVE).
//                          The owner may allow this one exact choice for a
//                          bounded time.
//  CLARIFICATION_REQUIRED  A fact is missing (price, context, fresh evidence).
//                          Approving cannot supply it. The fact must be
//                          captured and the choice evaluated again.
export const ASK_KINDS = [
  "AUTHORITY_CONFIRMATION",
  "CLARIFICATION_REQUIRED",
] as const;
export type AskKind = (typeof ASK_KINDS)[number];
export interface Ask {
  kind: AskKind;
  reasons: string[];
  question: string;
}

// Rules written by the policy engine's autonomy step that the owner can settle
// by confirming. Anything else (including AUTONOMY:PRICE_UNKNOWN, which needs
// the price) is a clarification.
const CONFIRMABLE = new Set(["AUTONOMY:OBSERVE", "AUTONOMY:ABOVE_LIMIT"]);

// The action ladder (`ACTION:<requested>><ceiling>`) and a sensitive-domain
// "always ask" are the owner's own rules saying to check first: confirmable.
// A sensitive domain that needs fresher explicit evidence is a missing fact.
const confirmable = (basis: string, r: string) =>
  (basis === "AUTONOMY_CEILING" && CONFIRMABLE.has(r)) ||
  ((basis === "ACTION_CEILING" || basis === "SENSITIVE_DOMAIN") &&
    /^ACTION:[A-Z_]+>[A-Z_]+$/.test(r)) ||
  (basis === "SENSITIVE_DOMAIN" && r === "SENSITIVE:ALWAYS_ASK");

export function classifyAsk(basis: string, rules: readonly string[]): AskKind {
  return rules.length > 0 && rules.every((r) => confirmable(basis, r))
    ? "AUTHORITY_CONFIRMATION"
    : "CLARIFICATION_REQUIRED";
}

const QUESTIONS: Record<string, string> = {
  "AUTONOMY:OBSERVE": "Your rule says to ask you before your agent continues.",
  "AUTONOMY:ABOVE_LIMIT":
    "This is above the amount you set for acting without asking.",
  "AUTONOMY:PRICE_UNKNOWN": "What is the price?",
  "SENSITIVE:ALWAYS_ASK":
    "You asked to be consulted on this kind of choice every time.",
};
export function describeAsk(basis: string, rules: readonly string[]): Ask {
  const kind = classifyAsk(basis, rules),
    reasons = [...rules].sort();
  let question: string;
  if (kind === "AUTHORITY_CONFIRMATION")
    question = reasons[0].startsWith("ACTION:")
      ? "This goes further than you let this agent go on its own. Allow it?"
      : (QUESTIONS[reasons[0]] ?? QUESTIONS["AUTONOMY:OBSERVE"]);
  else if (
    reasons.some((r) => r === "SENSITIVE:FRESH_EXPLICIT_EVIDENCE_REQUIRED")
  )
    question = "Is this still something you want? It is a sensitive choice.";
  else if (reasons.some((r) => r.startsWith("REQUIRED_PRICE:")))
    question = "What is the price?";
  else if (reasons.some((r) => r === "AUTONOMY:PRICE_UNKNOWN"))
    question = QUESTIONS["AUTONOMY:PRICE_UNKNOWN"];
  else if (reasons.some((r) => r.startsWith("STALE:")))
    question = "Is this still true of your taste?";
  else question = "TastePolicy needs one more fact to decide.";
  return { kind, reasons, question };
}
