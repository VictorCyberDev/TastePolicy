import type { StateEvaluation } from "@/lib/state/types";
export const SHARE_SCOPES = [
  "READ_PASSPORT_SUMMARY",
  "READ_STATE_SUMMARY",
  "EVALUATE_TASTE_ACTION",
  "READ_RECEIPT",
] as const;
export const KEY_SCOPES = [
  "PASSPORT_READ",
  "TASTE_EVALUATE",
  "RECEIPT_READ",
] as const;
export type ShareScope = (typeof SHARE_SCOPES)[number];
export type KeyScope = (typeof KEY_SCOPES)[number];
export interface Principal {
  userId: string;
  kind: "SESSION" | "CREDENTIAL";
  authenticatedAt: string;
  credentialId?: string;
  credentialHash?: string;
  sessionId?: string;
  scopes?: KeyScope[];
  // Present when the principal is an OAuth-linked agent, never a developer key.
  oauth?: { clientId: string; familyId: string; resource: string };
}
export interface PassportRecord {
  subjectRef: string;
  passportRef: string;
  userId: string;
  profileId: string;
  version: number;
  stateVersion: number;
  stateHash: string;
  displayLabel: string;
  visibility: "PRIVATE" | "SHARED_BY_GRANT";
  createdAt: string;
  expiresAt: string;
}
export interface Grant {
  schemaVersion: "taste-passport-grant-v1";
  grantId: string;
  grantorUserId: string;
  granteeUserId: string;
  passportRef: string;
  profileId: string;
  scopes: ShareScope[];
  purpose: string;
  issuedAt: string;
  expiresAt: string;
  assurance: "AUTHENTICATED_GRANTOR_CONSENT";
}
export interface Credential {
  credentialId: string;
  userId: string;
  displayLabel: string;
  scopes: KeyScope[];
  createdAt: string;
  expiresAt: string;
  oauth?: { clientId: string; familyId: string; resource: string };
}
export interface PlatformEvaluation {
  evaluationRef: string;
  passportRef: string;
  userId: string;
  actorId: string;
  grantId: string | null;
  stateProfileId: string;
  stateVersion: number;
  stateHash: string;
  evaluation: StateEvaluation;
  // The subjective action the agent said it intends to take. Not part of the
  // M1-M5 evaluation (which is replayed and hashed); absent on older rows.
  requestedAction?: import("@/lib/policy/types").SubjectiveAction;
}
export class PlatformFailure extends Error {
  constructor(
    readonly code:
      | "AUTH_REQUIRED"
      | "ACCESS_DENIED"
      | "PASSPORT_NOT_FOUND"
      | "GRANT_REQUIRED"
      | "GRANT_EXPIRED"
      | "GRANT_REVOKED"
      | "CREDENTIAL_REVOKED"
      | "CREDENTIAL_EXPIRED"
      | "INVALID_INPUT"
      | "STATE_VERSION_CONFLICT"
      | "IDEMPOTENCY_KEY_CONFLICT"
      | "RATE_LIMITED"
      | "RECENT_AUTH_REQUIRED"
      | "INTEGRITY_ERROR"
      | "NOT_CONFIGURED"
      | "PROVIDER_UNAVAILABLE"
      | "LEASE_NOT_FOUND"
      | "LEASE_NOT_PERMITTED"
      | "CLARIFICATION_REQUIRED"
      | "COMMITMENT_MISMATCH"
      | "COMMITMENT_REQUIRED"
      | "LEASE_STATE_CONFLICT",
    readonly missing?: ("candidate" | "context")[],
  ) {
    super(code);
  }
}
export function platformFail(
  code: ConstructorParameters<typeof PlatformFailure>[0],
  missing?: ("candidate" | "context")[],
): never {
  throw new PlatformFailure(code, missing);
}
