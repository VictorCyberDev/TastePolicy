import type { UnavailableReason } from "@/types/domain";
export function reasonForStatus(
  status: number,
  path: "/search" | "/entities" | "/v2/insights",
): UnavailableReason {
  if (status === 401 || status === 403) return "auth_failed";
  if (status === 429) return "rate_limited";
  // /search explicitly documents 404 for no results. Other 404s cannot establish
  // candidate absence from status alone; preserve an unknown provider failure.
  if (status === 404 && path === "/search") return "no_evidence";
  return "provider_error";
}
