// Independent caller: no TastePolicy implementation or provider imports.
export function obey(result) {
  const decision =
    result?.status === "available"
      ? result.data?.decision?.outcome
      : result?.status === "unavailable"
        ? "UNAVAILABLE"
        : null;
  const c = result?.continuation;
  if (
    !decision ||
    !c ||
    c.schemaVersion !== "taste-continuation-demo-v1" ||
    c.automaticRetry !== false ||
    !Array.isArray(c.permitted) ||
    c.permitted.some(
      (a) =>
        ![
          "recommend",
          "add_to_draft",
          "request_clarification",
          "do_not_proceed",
          "offer_repair",
          "do_not_assume_negative_preference",
        ].includes(a),
    )
  )
    return {
      status: "STOPPED_INVALID_CONTRACT",
      actions: [],
      automaticRetry: false,
    };
  let actions = [],
    message = "";
  if (decision === "ALLOW") {
    actions = c.permitted.filter((a) =>
      ["recommend", "add_to_draft"].includes(a),
    );
    message = "Demo recommendation/draft only. No transaction performed.";
  } else if (
    decision === "ASK" &&
    c.permitted.includes("request_clarification")
  ) {
    actions = ["request_clarification"];
    message =
      "What information is missing? Please answer explicitly, then request a new evaluation. No answer inferred.";
  } else if (decision === "REJECT" && c.permitted.includes("do_not_proceed")) {
    actions = c.permitted.filter((a) =>
      ["do_not_proceed", "offer_repair"].includes(a),
    );
    message =
      "Stopped. A different candidate may be evaluated; no rule is relaxed.";
  } else if (
    decision === "UNAVAILABLE" &&
    c.permitted.includes("do_not_assume_negative_preference")
  ) {
    actions = ["do_not_assume_negative_preference"];
    message = "Stopped: evidence unavailable is not dislike. No retry.";
  } else
    return {
      status: "STOPPED_INVALID_CONTRACT",
      actions: [],
      automaticRetry: false,
    };
  return {
    schemaVersion: "obedient-agent-trace-v1",
    status:
      decision === "ALLOW" && actions.length ? "DEMO_CONTINUED" : "STOPPED",
    decision,
    actions,
    message,
    automaticRetry: false,
    transactionPerformed: false,
    trace: ["AGENT PROPOSED", "TASTEPOLICY DECIDED", "AGENT OBEYED"],
    draft:
      decision === "ALLOW" && actions.includes("add_to_draft")
        ? { candidate: result.data.candidate.name, execution: false }
        : null,
  };
}
