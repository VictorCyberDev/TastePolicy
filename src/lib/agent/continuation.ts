// Interface authority, not taste scoring. No provider/state/policy imports.
export type AgentDecision = "ALLOW" | "ASK" | "REJECT" | "UNAVAILABLE";
export function boundedContinuation(decision: AgentDecision) {
  return {
    schemaVersion: "taste-continuation-demo-v1" as const,
    permitted:
      decision === "ALLOW"
        ? ["recommend", "add_to_draft"]
        : decision === "ASK"
          ? ["request_clarification"]
          : decision === "REJECT"
            ? ["do_not_proceed", "offer_repair"]
            : ["do_not_assume_negative_preference"],
    automaticRetry: false as const,
    authorityBoundary:
      "Preference authorization only. No purchase, pay, book, private-information sharing, account or execution authority.",
  };
}
