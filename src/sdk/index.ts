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
} from "./types";
export type {
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
  permitted: string[];
  reasons: string[];
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
  leaseVerify(leaseRef: string) {
    return this.call<Lease>("lease-verify", { leaseRef });
  }
  leaseCheckpoint(leaseRef: string, expectedRev?: number) {
    return this.call<Lease>("lease-checkpoint", {
      leaseRef,
      ...(expectedRev === undefined ? {} : { expectedRev }),
    });
  }
  leaseResume(input: {
    idempotencyKey: string;
    leaseRef: string;
    evaluationRef: string;
  }) {
    return this.call<Lease>("lease-resume", input);
  }
  leaseRelease(leaseRef: string) {
    return this.call<Lease>("lease-release", { leaseRef });
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
