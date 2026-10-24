import type { QlooEntity } from "@/types/domain";
import type {
  StateEvaluation,
  StateDecision,
  Context,
} from "@/lib/state/types";
export const PERMISSION_SCOPES = [
  "MODEL_MANAGEMENT",
  "TASTE_EVALUATION",
  "GROUP_EVALUATION",
] as const;
export type PermissionScope = (typeof PERMISSION_SCOPES)[number];
export interface TasteSubject {
  ownerProfileId: string;
  subjectId: string;
  subjectKind: "SELF" | "PROXY";
  stateProfileId: string;
  displayLabel: string;
  createdAt: string;
  expiresAt: string;
}
export interface PermissionAttestation {
  ownerProfileId: string;
  subjectId: string;
  attestationId: string;
  assuranceLevel: "USER_ATTESTED_PERMISSION";
  scopes: PermissionScope[];
  attestedAt: string;
  expiresAt: string;
  provenance: "DELEGATE_ATTESTED";
  requestId: string;
}
export interface SubjectEvent {
  ownerProfileId: string;
  subjectId: string;
  eventId: string;
  kind: "PERMISSION_REVOKED" | "PROXY_DELETED";
  attestationId: string;
  createdAt: string;
  requestId: string;
}
export interface AnchorProvenance {
  ownerProfileId: string;
  subjectId: string;
  stateProfileId: string;
  stateVersion: number;
  attestationId: string;
  source: "DELEGATE_ATTESTED";
  signalIds: string[];
}
export const AUTHORITY_BOUNDARY =
  "Cultural authorization only. No purchase, payment, booking, legal, account, communication, execution or physical-consent authority.";
export interface ProxyAuthorization {
  schemaVersion: "proxy-authorization-v1";
  authorizationId: string;
  subjectId: string;
  subjectKind: "PROXY";
  permissionAttestationId: string;
  permissionAssurance: "USER_ATTESTED_PERMISSION";
  provenance: AnchorProvenance;
  stateVersion: number;
  stateHash: string;
  baseEvaluation: StateEvaluation;
  authorityBoundary: string;
  createdAt: string;
  semanticHash: string;
}
export interface MemberAuthorization {
  authorizationId: string;
  subjectId: string;
  subjectKind: TasteSubject["subjectKind"];
  stateProfileId: string;
  stateVersion: number;
  stateHash: string;
  candidate: QlooEntity;
  contextHash: string;
  context: Context;
  // The member's final decision: their own policy (if the member's state
  // belongs to a Passport with one) already applied. Never softer than `policy.baseDecision`
  // except through the member's own explicit temporary permission.
  decision: StateDecision["outcome"];
  decisionBasis:
    | StateDecision["basis"]
    | "STALE_EVIDENCE"
    | "AUTONOMY_CEILING"
    | "USER_TEMPORARY_OVERRIDE";
  evidenceAvailability: "available" | "unavailable";
  // Present only when the member's own policy layer took part. It records what
  // was applied so that a replay reproduces this decision from captured
  // versions, never from today's rules.
  policy?: MemberPolicy;
}
export interface MemberPolicy {
  // null: no published policy (an override alone can still apply).
  version: number | null;
  baseDecision: StateDecision["outcome"];
  rules: string[];
  overrideIds: string[];
  appliedAt: string;
}
export interface TasteGroup {
  ownerProfileId: string;
  groupId: string;
  displayLabel: string;
  currentVersion: number;
}
export interface GroupVersion {
  ownerProfileId: string;
  groupId: string;
  groupVersion: number;
  parentVersion: number | null;
  memberSubjectIds: string[];
  policyId: "UNANIMOUS_NO_VETO_V1";
  createdAt: string;
  semanticHash: string;
}
export interface GroupAuthorization {
  schemaVersion: "group-authorization-v1";
  authorizationId: string;
  groupId: string;
  groupVersion: number;
  policyId: GroupVersion["policyId"];
  candidate: QlooEntity;
  context: Context;
  contextHash: string;
  memberResults: MemberAuthorization[];
  aggregateDecision: StateDecision["outcome"];
  aggregateBasis:
    | "MEMBER_REJECT"
    | "MEMBER_EVIDENCE_UNAVAILABLE"
    | "MEMBER_CLARIFICATION_REQUIRED"
    | "UNANIMOUS_ALLOW";
  rejectingMembers: string[];
  unavailableMembers: string[];
  askingMembers: string[];
  allowingMembers: string[];
  createdAt: string;
  requestId: string;
  authorityBoundary: string;
  semanticHash: string;
}
export type SubjectFailureCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "PERMISSION_INACTIVE"
  | "PERMISSION_SCOPE_REQUIRED"
  | "PROXY_MODEL_INSUFFICIENT"
  | "PROVIDER_UNAVAILABLE"
  | "INTEGRITY_ERROR"
  | "GROUP_VERSION_CONFLICT"
  | "GROUP_MEMBER_STATE_STALE"
  | "GROUP_MEMBER_INPUT_MISMATCH"
  | "GROUP_EVALUATION_INCOMPLETE"
  | "GROUP_MEMBER_DUPLICATE";
export class SubjectFailure extends Error {
  constructor(readonly code: SubjectFailureCode) {
    super(code);
  }
}
