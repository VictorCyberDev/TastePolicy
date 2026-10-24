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
export const evaluationRefInput = z.object({ evaluationRef: ref });
export const emptyInput = z.object({});

export interface PlatformTool {
  name: string;
  op:
    "capabilities" | "passport" | "policy" | "evaluate" | "receipt" | "status";
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
];
export const toolByName = (name: string) =>
  PLATFORM_TOOLS.find((t) => t.name === name);
