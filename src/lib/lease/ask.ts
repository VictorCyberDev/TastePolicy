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

export function classifyAsk(basis: string, rules: readonly string[]): AskKind {
  return basis === "AUTONOMY_CEILING" &&
    rules.length > 0 &&
    rules.every((r) => CONFIRMABLE.has(r))
    ? "AUTHORITY_CONFIRMATION"
    : "CLARIFICATION_REQUIRED";
}

const QUESTIONS: Record<string, string> = {
  "AUTONOMY:OBSERVE": "Your rule says to ask you before your agent continues.",
  "AUTONOMY:ABOVE_LIMIT":
    "This is above the amount you set for acting without asking.",
  "AUTONOMY:PRICE_UNKNOWN": "What is the price?",
};
export function describeAsk(basis: string, rules: readonly string[]): Ask {
  const kind = classifyAsk(basis, rules),
    reasons = [...rules].sort();
  let question: string;
  if (kind === "AUTHORITY_CONFIRMATION")
    question = QUESTIONS[reasons[0]] ?? QUESTIONS["AUTONOMY:OBSERVE"];
  else if (reasons.some((r) => r.startsWith("REQUIRED_PRICE:")))
    question = "What is the price?";
  else if (reasons.some((r) => r === "AUTONOMY:PRICE_UNKNOWN"))
    question = QUESTIONS["AUTONOMY:PRICE_UNKNOWN"];
  else if (reasons.some((r) => r.startsWith("STALE:")))
    question = "Is this still true of your taste?";
  else question = "TastePolicy needs one more fact to decide.";
  return { kind, reasons, question };
}
