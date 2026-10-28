// What each decision lets an agent do next. One table, shared by the service
// and the conformance suite.
export const CONTINUATION_ACTIONS = {
  ALLOW: ["recommend", "add_to_draft"],
  ASK: ["request_clarification"],
  REJECT: ["do_not_proceed", "offer_repair"],
  UNAVAILABLE: ["do_not_assume_negative_preference"],
} as const;
