import { z } from "zod";
import type { KeyScope } from "./types";

// The single contract that drives the REST gateway, remote MCP, A2A, SDK and
// OpenAPI. Schemas describe shape for clients; the service remains the
// validator of record.
export const PLATFORM_CONTRACT_VERSION = "tastepolicy-platform-contract-v1";
export const AUTHORITY_BOUNDARY =
  "Cultural preference authorization only. ALLOW never grants purchase, payment, booking, messaging, legal, account or private-data authority.";

const ref = z.string().min(1).max(128);
export const passportInput = z.object({
  passportRef: ref.describe("Passport reference issued to the account"),
  grantId: ref
    .optional()
    .describe("Only for access to another account's Passport"),
  stateSummary: z.boolean().optional().describe("Counts only, no raw anchors"),
});
export const evaluateInput = z.object({
  idempotencyKey: z.string().min(8).max(128),
  passportRef: ref,
  grantId: ref.optional(),
  proposal: z
    .object({
      agentId: z.string().min(1).max(80),
      expectedStateVersion: z.number().int().min(1),
      candidate: z.object({
        id: z.string().min(1).max(80),
        name: z.string().min(1).max(160),
        type: z.enum(["brand", "place", "destination"]),
      }),
      context: z
        .object({
          key: z.string().min(1).max(80),
          domain: z.string().min(1).max(40),
        })
        .loose(),
    })
    .loose(),
});
export const policyInput = z.object({
  passportRef: ref,
  grantId: ref.optional(),
  agentId: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,64}$/)
    .optional()
    .describe("Resolve autonomy rules for this agent"),
});
const leaseRefField = z.string().regex(/^tl_[a-f0-9]{48}$/);
export const leaseRequestInput = z.object({
  idempotencyKey: z.string().min(8).max(80),
  evaluationRef: ref,
  ttlSeconds: z.number().int().min(60).max(86400).optional(),
  checkpointSeconds: z.number().int().min(30).max(86400).optional(),
});
export const leaseRefInput = z.object({
  leaseRef: leaseRefField,
  expectedRev: z.number().int().min(0).optional(),
});
export const leaseResumeInput = z.object({
  idempotencyKey: z.string().min(8).max(80),
  leaseRef: leaseRefField,
  evaluationRef: ref,
});
export const attestationInput = z.object({
  leaseRef: leaseRefField,
  audience: z
    .string()
    .regex(/^https:\/\/[a-z0-9.-]{1,190}(:\d{1,5})?$/)
    .describe("Origin of the party that will verify the proof"),
  holderKey: z
    .looseObject({ kty: z.string(), crv: z.string(), x: z.string() })
    .optional()
    .describe("Public JWK of the holder; adds key binding"),
  delegateAgentId: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,64}$/)
    .optional()
    .describe("Hand the proof to another agent (requires holderKey)"),
});
export const evaluationRefInput = z.object({ evaluationRef: ref });
export const emptyInput = z.object({});

export interface PlatformTool {
  name: string;
  op:
    | "capabilities"
    | "passport"
    | "policy"
    | "evaluate"
    | "receipt"
    | "status"
    | "lease"
    | "lease-verify"
    | "lease-checkpoint"
    | "lease-resume"
    | "lease-release"
    | "attestation";
  title: string;
  description: string;
  scope: KeyScope | null;
  readOnly: boolean;
  idempotent: boolean;
  input: z.ZodType;
}
export const PLATFORM_TOOLS: PlatformTool[] = [
  {
    name: "tastepolicy_capabilities",
    op: "capabilities",
    title: "TastePolicy capabilities",
    description:
      "Describe the authority boundary, decision vocabulary and scopes of the calling credential. Call first.",
    scope: null,
    readOnly: true,
    idempotent: true,
    input: emptyInput,
  },
  {
    name: "tastepolicy_get_authority",
    op: "passport",
    title: "Read Preference Passport summary",
    description:
      "Read the Passport summary (or counts-only state summary) the credential is permitted to see.",
    scope: "PASSPORT_READ",
    readOnly: true,
    idempotent: true,
    input: passportInput,
  },
  {
    name: "tastepolicy_get_policy",
    op: "policy",
    title: "Read the user's autonomy rules",
    description:
      "Read the resolved autonomy level per domain, any spending limit and freshness limits that will make evaluations more cautious. Rules can only add caution or follow an explicit user override; they never override hard rules.",
    scope: "PASSPORT_READ",
    readOnly: true,
    idempotent: true,
    input: policyInput,
  },
  {
    name: "tastepolicy_evaluate_choice",
    op: "evaluate",
    title: "Evaluate a proposed choice",
    description:
      "Ask whether a proposed brand/place/destination matches the user's cultural preference authority. Returns ALLOW, ASK, REJECT or UNAVAILABLE. UNAVAILABLE is not a rejection. The result never authorizes purchase, payment or booking.",
    scope: "TASTE_EVALUATE",
    readOnly: false,
    idempotent: true,
    input: evaluateInput,
  },
  {
    name: "tastepolicy_get_receipt",
    op: "receipt",
    title: "Read a recorded receipt",
    description:
      "Read the recorded Cultural Receipt for an earlier evaluation.",
    scope: "RECEIPT_READ",
    readOnly: true,
    idempotent: true,
    input: evaluationRefInput,
  },
  {
    name: "tastepolicy_get_status",
    op: "status",
    title: "Read evaluation status",
    description: "Read the decision and status of an earlier evaluation.",
    scope: "RECEIPT_READ",
    readOnly: true,
    idempotent: true,
    input: evaluationRefInput,
  },
  {
    name: "tastepolicy_request_lease",
    op: "lease",
    title: "Request a preference authority lease",
    description:
      "After an ALLOW or ASK evaluation, request a short-lived lease for that exact choice. ALLOW starts active; ASK waits for the person to answer. The lease permits only recommend/add_to_draft and never any purchase, payment or booking. Verify before relying on it and checkpoint before it is due.",
    scope: "TASTE_EVALUATE",
    readOnly: false,
    idempotent: true,
    input: leaseRequestInput,
  },
  {
    name: "tastepolicy_verify_lease",
    op: "lease-verify",
    title: "Verify a lease",
    description:
      "Authoritative, uncacheable check that a lease is still valid. Always verify immediately before acting; a lease may have been suspended or revoked since you last looked.",
    scope: "RECEIPT_READ",
    readOnly: true,
    idempotent: true,
    input: leaseRefInput,
  },
  {
    name: "tastepolicy_checkpoint_lease",
    op: "lease-checkpoint",
    title: "Checkpoint a lease",
    description:
      "Confirm nothing the lease relied on has changed and push the next checkpoint forward. If anything changed the lease is suspended instead of extended.",
    scope: "TASTE_EVALUATE",
    readOnly: false,
    idempotent: false,
    input: leaseRefInput,
  },
  {
    name: "tastepolicy_resume_lease",
    op: "lease-resume",
    title: "Resume a suspended lease",
    description:
      "Resume a suspended lease with a new evaluation of the same choice that is ALLOW under the current state and rules.",
    scope: "TASTE_EVALUATE",
    readOnly: false,
    idempotent: true,
    input: leaseResumeInput,
  },
  {
    name: "tastepolicy_release_lease",
    op: "lease-release",
    title: "Release a lease",
    description: "End a lease you no longer need.",
    scope: "TASTE_EVALUATE",
    readOnly: false,
    idempotent: true,
    input: leaseRefInput,
  },
  {
    name: "tastepolicy_issue_attestation",
    op: "attestation",
    title: "Issue a verifiable attestation",
    description:
      "For an ACTIVE lease, issue a short-lived SD-JWT proof a third party can verify without a TastePolicy credential. Disclose only the claims the verifier needs when presenting. The proof states cultural authority only and ends with the lease.",
    scope: "TASTE_EVALUATE",
    readOnly: false,
    idempotent: false,
    input: attestationInput,
  },
];
export const toolByName = (name: string) =>
  PLATFORM_TOOLS.find((t) => t.name === name);
