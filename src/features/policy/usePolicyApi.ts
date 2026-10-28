"use client";
import { useRef } from "react";

const MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: "Sign in on the account page first.",
  RECENT_AUTH_REQUIRED:
    "This change gives agents more freedom, so sign out and sign in again first.",
  STATE_VERSION_CONFLICT: "Your rules changed elsewhere. Reload and try again.",
  PASSPORT_NOT_FOUND: "That record is not available to this account.",
  INVALID_INPUT: "Check the values you entered.",
  NOT_CONFIGURED: "Accounts are not configured in this environment.",
  RATE_LIMITED: "Too many requests. Wait a moment.",
  ACCESS_DENIED: "This account cannot do that.",
};
export class PolicyApiError extends Error {
  constructor(readonly code: string) {
    super(MESSAGES[code] ?? "That did not work. Nothing was changed.");
  }
}
// One stable idempotency key per distinct mutation payload, so a retry of the
// same click can never apply twice.
export function usePolicyApi() {
  const keys = useRef(new Map<string, string>());
  return async function call<T>(
    op: string,
    body: Record<string, unknown> = {},
    mutation = false,
  ): Promise<T> {
    const fingerprint = op + JSON.stringify(body);
    if (mutation && !keys.current.has(fingerprint))
      keys.current.set(fingerprint, crypto.randomUUID());
    const response = await fetch(`/api/account/${op}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...body,
        ...(mutation ? { idempotencyKey: keys.current.get(fingerprint) } : {}),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (result.status !== "available")
      throw new PolicyApiError(String(result.code ?? ""));
    return result.data as T;
  };
}
