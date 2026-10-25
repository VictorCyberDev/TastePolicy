// One error catalog for every wire surface (REST, MCP, A2A, SDK). Codes are
// stable; messages are static and never contain provider or database detail.
export interface ErrorSpec {
  http: number;
  retryable: boolean;
  message: string;
}
const spec = (
  http: number,
  retryable: boolean,
  message: string,
): ErrorSpec => ({
  http,
  retryable,
  message,
});
export const ERROR_CATALOG: Record<string, ErrorSpec> = {
  AUTH_REQUIRED: spec(401, false, "A valid developer credential is required."),
  ACCESS_DENIED: spec(
    403,
    false,
    "This credential or grant does not permit the operation.",
  ),
  GRANT_REQUIRED: spec(
    403,
    false,
    "An active grant from the Passport owner is required.",
  ),
  GRANT_EXPIRED: spec(403, false, "The grant has expired."),
  GRANT_REVOKED: spec(403, false, "The grant has been revoked."),
  CREDENTIAL_REVOKED: spec(403, false, "The credential has been revoked."),
  CREDENTIAL_EXPIRED: spec(403, false, "The credential has expired."),
  RECENT_AUTH_REQUIRED: spec(
    403,
    false,
    "A fresh browser sign-in is required.",
  ),
  INTEGRITY_ERROR: spec(
    403,
    false,
    "Recorded evidence failed an integrity check.",
  ),
  PASSPORT_NOT_FOUND: spec(
    404,
    false,
    "No such Passport or evaluation is available to this caller.",
  ),
  LEASE_NOT_FOUND: spec(
    404,
    false,
    "No such lease is available to this caller.",
  ),
  LEASE_NOT_PERMITTED: spec(403, false, "This decision cannot be leased."),
  CLARIFICATION_REQUIRED: spec(
    409,
    false,
    "A fact is missing. Capture it and evaluate again; approving cannot supply it.",
  ),
  COMMITMENT_MISMATCH: spec(
    409,
    false,
    "The candidate or context you presented is not the one this authority was evaluated for. Evaluate the current choice again.",
  ),
  LEASE_STATE_CONFLICT: spec(
    409,
    false,
    "The lease changed or is not in a state that allows this.",
  ),
  INVALID_INPUT: spec(400, false, "The request does not match the contract."),
  STATE_VERSION_CONFLICT: spec(
    409,
    false,
    "The Passport state version has changed; read it again.",
  ),
  IDEMPOTENCY_KEY_CONFLICT: spec(
    409,
    false,
    "The idempotency key was used with a different payload.",
  ),
  BODY_TOO_LARGE: spec(413, false, "The request body is too large."),
  BODY_READ_TIMEOUT: spec(
    408,
    true,
    "The request body was not received in time.",
  ),
  RATE_LIMITED: spec(429, true, "Rate limit reached; retry later."),
  NOT_CONFIGURED: spec(503, true, "The service is not configured."),
  PROVIDER_UNAVAILABLE: spec(503, true, "A required provider is unavailable."),
  INTERNAL_ERROR: spec(500, true, "An internal error occurred."),
};
const FALLBACK = ERROR_CATALOG.ACCESS_DENIED;
export function errorSpec(code: string): ErrorSpec {
  if (ERROR_CATALOG[code]) return ERROR_CATALOG[code];
  if (code.endsWith("CONFLICT")) return ERROR_CATALOG.STATE_VERSION_CONFLICT;
  return FALLBACK;
}
