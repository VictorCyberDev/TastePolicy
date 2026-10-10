import "server-only";
import type { QlooProvider } from "@/server/qloo/contracts";
import { validateDemoInput } from "./input";
import { discover, evaluateAction } from "./service";
import { createRequestId } from "@/lib/logging/request-id";
import { normalizeError } from "@/lib/errors/normalize";
const MAX_BODY_BYTES = 16384;
export async function handleDemo(
  request: Request,
  operation: string,
  provider: QlooProvider,
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
    const reader = request.body?.getReader();
    if (!reader)
      return send({ status: "error", code: "INVALID_INPUT", requestId }, 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        return send(
          { status: "error", code: "BODY_TOO_LARGE", requestId },
          413,
        );
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return send({ status: "error", code: "INVALID_INPUT", requestId }, 400);
    }
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
  } catch {
    return send(
      { status: "error", ...normalizeError(undefined, requestId) },
      500,
    );
  }
}
