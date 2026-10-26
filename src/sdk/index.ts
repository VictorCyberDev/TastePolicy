// Kept in step with the shared error catalog by tests/sdk-sandbox.test.ts. The
// SDK imports nothing at runtime so plain Node can load it.
const RETRYABLE = new Set([
  "BODY_READ_TIMEOUT",
  "RATE_LIMITED",
  "NOT_CONFIGURED",
  "PROVIDER_UNAVAILABLE",
  "INTERNAL_ERROR",
]);
import type {
  PassportSummary,
  EvaluationRequest,
  AuthorizationResponse,
  ReceiptResponse,
  CurrentChoice,
} from "./types";
export type {
  CurrentChoice,
  SubjectiveAction,
  PassportSummary,
  EvaluationRequest,
  AuthorizationResponse,
  ReceiptResponse,
} from "./types";
export interface Lease {
  schemaVersion: "taste-lease-v1";
  leaseRef: string;
  status:
    | "ASK_PENDING"
    | "ACTIVE"
    | "SUSPENDED"
    | "DECLINED"
    | "REVOKED"
    | "EXPIRED"
    | "RELEASED";
  valid: boolean;
  // true when the lease is bound to commitments: verify, checkpoint and resume
  // must then present the candidate and the context (COMMITMENT_REQUIRED).
  commitmentRequired: boolean;
  permitted: string[];
  // The same permission on the subjective-action ladder.
  permittedActions: import("./types").SubjectiveAction[];
  reasons: string[];
  // Canonical commitments to the choice this authority was evaluated for.
  commitments: {
    schemaVersion: "taste-commitments-v1";
    candidate: string;
    context: string;
  } | null;
  expiresAt: string;
  checkpointDueAt: string;
  rev: number;
  cacheable: false;
  ttlMs: 0;
}
// Typed failure for every non-success response. `message` stays the stable
// code so existing string checks keep working.
export class TastePolicyError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly requestId?: string,
    // For COMMITMENT_REQUIRED: which of "candidate" / "context" was left out.
    readonly missing?: ("candidate" | "context")[],
  ) {
    super(code);
    this.name = "TastePolicyError";
  }
}
// Server-only first-party thin client. Never import a developer secret into a browser.
export class TastePolicyClient {
  constructor(
    private readonly baseURL: string,
    private readonly apiKey: string,
    private readonly options: { fetch?: typeof fetch } = {},
  ) {
    if (typeof window !== "undefined")
      throw Error("TastePolicy credentials are server-only");
    if (
      typeof apiKey !== "string" ||
      !/^tp_live_[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(apiKey)
    )
      throw Error("A server-side TastePolicy credential is required");
    const u = new URL(baseURL);
    if (
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      (u.protocol !== "https:" &&
        !(
          u.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(u.hostname)
        ))
    )
      throw Error("Invalid TastePolicy endpoint");
  }
  async call<T = unknown>(
    operation:
      | "capabilities"
      | "passport"
      | "policy"
      | "lease"
      | "lease-verify"
      | "lease-checkpoint"
      | "lease-resume"
      | "lease-release"
      | "attestation-verify"
      | "attestation"
      | "evaluate"
      | "receipt"
      | "status",
    input: unknown,
  ): Promise<T> {
    const response = await (this.options.fetch ?? fetch)(
      new URL(`/api/v1/${operation}`, this.baseURL),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
        redirect: "error",
        signal: AbortSignal.timeout(45000),
      },
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status !== "available") {
      const code =
        typeof result.code === "string" && /^[A-Z_]{1,80}$/.test(result.code)
          ? result.code
          : "TASTEPOLICY_UNAVAILABLE";
      throw new TastePolicyError(
        code,
        response.status,
        RETRYABLE.has(code),
        typeof result.requestId === "string" ? result.requestId : undefined,
        Array.isArray(result.missing)
          ? result.missing.filter(
              (m: unknown): m is "candidate" | "context" =>
                m === "candidate" || m === "context",
            )
          : undefined,
      );
    }
    return result.data as T;
  }
  capabilities() {
    return this.call<Record<string, unknown>>("capabilities", {});
  }
  passport(input: {
    passportRef: string;
    grantId?: string;
    stateSummary?: boolean;
  }) {
    return this.call<PassportSummary>("passport", input);
  }
  policy(input: { passportRef: string; grantId?: string; agentId?: string }) {
    return this.call<Record<string, unknown>>("policy", input);
  }
  // Leases permit only the cultural continuation of one decision; they never
  // carry purchase, payment or booking authority. Verify before relying on one.
  lease(input: {
    idempotencyKey: string;
    evaluationRef: string;
    ttlSeconds?: number;
    checkpointSeconds?: number;
  }) {
    return this.call<Lease>("lease", input);
  }
  // Pass `current` (the candidate and context as they are now, or their
  // commitments). A lease whose view has `commitmentRequired: true` is bound to
  // one candidate and one situation: leaving either out rejects with
  // TastePolicyError code COMMITMENT_REQUIRED and `missing`. Only a lease
  // issued before commitments existed can be verified without them.
  leaseVerify(leaseRef: string, current?: CurrentChoice) {
    return this.call<Lease>("lease-verify", { leaseRef, ...current });
  }
  leaseCheckpoint(
    leaseRef: string,
    expectedRev?: number,
    current?: CurrentChoice,
  ) {
    return this.call<Lease>("lease-checkpoint", {
      leaseRef,
      ...(expectedRev === undefined ? {} : { expectedRev }),
      ...current,
    });
  }
  leaseResume(
    input: {
      idempotencyKey: string;
      leaseRef: string;
      evaluationRef: string;
    } & CurrentChoice,
  ) {
    return this.call<Lease>("lease-resume", input);
  }
  leaseRelease(leaseRef: string) {
    return this.call<Lease>("lease-release", { leaseRef });
  }
  // A short-lived proof of an ACTIVE lease for one verifier. Present only the
  // claims the verifier needs (see src/sdk/attest.ts).
  attestation(input: {
    leaseRef: string;
    audience: string;
    holderKey?: Record<string, string>;
    delegateAgentId?: string;
  }) {
    return this.call<{
      attestation: string;
      jti: string;
      expiresAt: string;
      disclosable: string[];
      statusUri: string;
    }>("attestation", input);
  }
  // For a proof another agent handed you. Credential-free alternative:
  // POST /api/attest/verify or verifyPresentation from "tastepolicy/attest".
  verifyAttestation(input: {
    presentation: string;
    audience: string;
    nonce?: string;
    dryRun?: boolean;
    requireKeyBinding?: boolean;
    expect?: CurrentChoice;
  }) {
    return this.call<Record<string, unknown>>("attestation-verify", input);
  }
  evaluate(input: EvaluationRequest) {
    return this.call<AuthorizationResponse>("evaluate", input);
  }
  receipt(evaluationRef: string) {
    return this.call<ReceiptResponse>("receipt", { evaluationRef });
  }
  status(evaluationRef: string) {
    return this.call<AuthorizationResponse>("status", { evaluationRef });
  }
}
