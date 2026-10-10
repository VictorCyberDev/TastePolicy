import type { UnavailableReason } from "@/types/domain";
export function reasonForStatus(status: number): UnavailableReason {
  if (status === 401 || status === 403) return "auth_failed";
  if (status === 429) return "rate_limited";
  if (status === 404) return "no_evidence";
  return "provider_error";
}
