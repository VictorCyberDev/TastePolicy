import { z } from "zod";
import type { PlatformTool } from "@/lib/platform/contracts";
const ref = z.string();
const decision = z.enum(["ALLOW", "ASK", "REJECT", "UNAVAILABLE"]);
const authorization = z.looseObject({
  schemaVersion: z.literal("taste-authorization-response-v1"),
  evaluationRef: ref,
  passportRef: ref,
  decision,
  receiptRef: ref,
  continuation: z.looseObject({}),
});
const lease = z.looseObject({
  schemaVersion: z.literal("taste-lease-v1"),
  leaseRef: ref,
  status: ref,
  valid: z.boolean(),
  permittedActions: z.array(ref),
});
export function outputFor(op: PlatformTool["op"]) {
  if (op === "capabilities")
    return z.looseObject({
      schemaVersion: z.literal("tastepolicy-capabilities-v1"),
      contract: ref,
      authorityBoundary: ref,
      decisions: z.array(decision),
      credentialScopes: z.array(ref),
      tools: z.array(z.looseObject({ name: ref })),
    });
  if (op === "passport")
    return z.looseObject({
      schemaVersion: z.literal("taste-passport-v1"),
      passportRef: ref,
      subjectRef: ref,
      stateVersion: z.number().int(),
      status: z.enum(["ACTIVE", "EXPIRED"]),
    });
  if (op === "policy")
    return z.looseObject({
      schemaVersion: z.literal("taste-policy-summary-v1"),
      passportRef: ref,
      policyVersion: z.number().nullable(),
      autonomy: z.looseObject({}),
    });
  if (op === "evaluate" || op === "receipt" || op === "status")
    return authorization;
  if (op === "attestation")
    return z.looseObject({
      schemaVersion: z.literal("taste-attestation-v1"),
      attestation: ref,
      jti: ref,
      audience: ref,
      expiresAt: ref,
      statusUri: ref,
    });
  if (op === "attestation-verify")
    return z.looseObject({
      valid: z.boolean(),
      reasons: z.array(ref),
      dryRun: z.boolean(),
    });
  return lease;
}
