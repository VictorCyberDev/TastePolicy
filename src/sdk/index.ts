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
// Server-only first-party thin client. Never import a developer secret into a browser.
export class TastePolicyClient {
  constructor(
    private readonly baseURL: string,
    private readonly apiKey: string,
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
    operation: "passport" | "evaluate" | "receipt" | "status",
    input: unknown,
  ): Promise<T> {
    const response = await fetch(
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
    const result = await response.json();
    if (!response.ok || result.status !== "available")
      throw Error(
        typeof result.code === "string" && /^[A-Z_]{1,80}$/.test(result.code)
          ? result.code
          : "TASTEPOLICY_UNAVAILABLE",
      );
    return result.data as T;
  }
  passport(input: {
    passportRef: string;
    grantId?: string;
    stateSummary?: boolean;
  }) {
    return this.call<PassportSummary>("passport", input);
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
