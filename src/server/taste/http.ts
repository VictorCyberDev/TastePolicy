import "server-only";
import type { QlooProvider } from "@/server/qloo/contracts";
import { validateDemoInput } from "./input";
import { discover, evaluateAction } from "./service";
import { createRequestId } from "@/lib/logging/request-id";
import { normalizeError } from "@/lib/errors/normalize";
import {
  readJsonBody,
  BodyReadFailure,
  BODY_READ_TIMEOUT_MS,
} from "./read-body";
export async function handleDemo(
  request: Request,
  operation: string,
  provider: QlooProvider,
  bodyTimeoutMs = BODY_READ_TIMEOUT_MS,
): Promise<Response> {
  const requestId = createRequestId();
  const send = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: { "X-Request-ID": requestId, "Cache-Control": "no-store" },
    });
  const origin = request.headers.get("origin");
  if (origin) {
    let sameOrigin = false;
    try {
      const parsed = new URL(origin);
      const host = request.headers.get("host") ?? new URL(request.url).host;
      sameOrigin =
        ["http:", "https:"].includes(parsed.protocol) && parsed.host === host;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin)
      return send(
        { status: "error", code: "ORIGIN_NOT_ALLOWED", requestId },
        403,
      );
  }
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return send(
      { status: "error", code: "INVALID_CONTENT_TYPE", requestId },
      415,
    );
  try {
    const raw = await readJsonBody(request, bodyTimeoutMs);
    const input = validateDemoInput(operation, raw);
    if (!input)
      return send({ status: "error", code: "INVALID_INPUT", requestId }, 400);
    const result =
      input.operation === "resolve"
        ? {
            status: "available" as const,
            data: await Promise.all(
              input.signals.map((signal) => provider.resolve(signal)),
            ),
          }
        : input.operation === "discover"
          ? await discover(provider, input.signalIds, input.targetType)
          : await evaluateAction(
              provider,
              input.signalIds,
              input.candidateId,
              requestId,
              input.context,
            );
    if (result.status === "unavailable")
      return send(
        { ...result, requestId },
        ["no_evidence", "unsupported_entity", "unresolved_profile"].includes(
          result.reason,
        )
          ? 422
          : result.reason === "rate_limited"
            ? 429
            : 503,
      );
    return send({ ...result, requestId });
  } catch (error) {
    if (error instanceof BodyReadFailure)
      return send(
        { status: "error", code: error.code, requestId },
        error.code === "BODY_READ_TIMEOUT"
          ? 408
          : error.code === "BODY_TOO_LARGE"
            ? 413
            : 400,
      );
    return send(
      { status: "error", ...normalizeError(undefined, requestId) },
      500,
    );
  }
}
