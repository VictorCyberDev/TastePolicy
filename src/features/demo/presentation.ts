import type { UnavailableReason } from "@/types/domain";
export interface Notice {
  title: string;
  detail: string;
  kind: "validation" | "configuration" | "provider" | "evidence" | "internal";
}
export const reasons: Record<UnavailableReason, Notice> = {
  not_configured: {
    kind: "configuration",
    title: "Qloo not configured",
    detail:
      "Live Qloo integration is not configured in this environment. No cultural evidence or decision has been fabricated.",
  },
  host_not_configured: {
    kind: "configuration",
    title: "Provider configuration required",
    detail: "The server must use the Qloo origin assigned with the credential.",
  },
  affinity_scale_unverified: {
    kind: "configuration",
    title: "Score semantics not verified",
    detail:
      "The provider affinity scale must be independently verified before evaluation can proceed.",
  },
  auth_failed: {
    kind: "provider",
    title: "Provider access unavailable",
    detail:
      "Qloo denied access. A server operator must check the assigned host and credential.",
  },
  rate_limited: {
    kind: "provider",
    title: "Request budget reached",
    detail:
      "Please wait before retrying. TastePolicy does not retry automatically.",
  },
  request_budget_exhausted: {
    kind: "provider",
    title: "Request call ceiling reached",
    detail: "This request exceeded its bounded provider call budget.",
  },
  timeout: {
    kind: "provider",
    title: "Provider response timed out",
    detail: "Required cultural evidence could not be established in time.",
  },
  provider_error: {
    kind: "provider",
    title: "Qloo is unavailable",
    detail: "Required cultural evidence could not be established.",
  },
  invalid_response: {
    kind: "evidence",
    title: "Unsupported provider evidence",
    detail:
      "The response could not be safely interpreted under the current contract.",
  },
  no_evidence: {
    kind: "evidence",
    title: "Candidate evidence missing",
    detail: "No candidate evidence returned. This is not a cultural rejection.",
  },
  unsupported_entity: {
    kind: "evidence",
    title: "Unsupported target",
    detail: "The selected entity could not be verified in this target domain.",
  },
  unresolved_profile: {
    kind: "validation",
    title: "Signal profile needs review",
    detail: "Verify five distinct entities from at least two cultural domains.",
  },
};
export function requestNotice(code: unknown): Notice {
  if (code === "INVALID_INPUT")
    return {
      kind: "validation",
      title: "Review the request",
      detail:
        "Check the five signal names, selected identities and candidate before trying again.",
    };
  if (code === "BODY_TOO_LARGE")
    return {
      kind: "validation",
      title: "Request too large",
      detail: "Use short cultural signal names and bounded structured inputs.",
    };
  if (code === "BODY_READ_TIMEOUT")
    return {
      kind: "validation",
      title: "Request reading timed out",
      detail: "The request did not finish within its allowed duration.",
    };
  if (code === "ORIGIN_NOT_ALLOWED")
    return {
      kind: "validation",
      title: "Request origin not allowed",
      detail: "Use the demo from its own page origin.",
    };
  return {
    kind: "internal",
    title: "Request could not be completed",
    detail:
      "No decision was issued. Try again later; internal details are kept private.",
  };
}
