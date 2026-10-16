import "server-only";
import type { InteractiveService } from "./service";
import { SESSION_COOKIE } from "@/server/state/http";
import { StateFailure } from "@/lib/state/types";
import { readJsonBody, BodyReadFailure } from "@/server/taste/read-body";
import { record, uuid } from "@/lib/validation";
import type { QlooProvider } from "@/server/qloo/contracts";
export async function handleInteractive(
  request: Request,
  op: string,
  service: InteractiveService | null,
  provider: () => QlooProvider,
) {
  const requestId = crypto.randomUUID(),
    url = new URL(request.url);
  const send = (data: unknown, status = 200) =>
    Response.json(data, {
      status,
      headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
    });
  if (
    request.headers.get("origin") !==
      `${url.protocol}//${request.headers.get("host") ?? url.host}` ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return send({ status: "error", code: "ORIGIN_NOT_ALLOWED" }, 403);
  if (
    ![
      "plan",
      "answer",
      "repair",
      "replay-clarification",
      "replay-repair",
    ].includes(op)
  )
    return send({ status: "error", code: "NOT_FOUND" }, 404);
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    return send({ status: "error", code: "INVALID_CONTENT_TYPE" }, 415);
  if (!service)
    return send(
      { status: "unavailable", reason: "persistence_not_configured" },
      503,
    );
  try {
    const body = await readJsonBody(request);
    const token =
      request.headers
        .get("cookie")
        ?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith(SESSION_COOKIE + "="))
        ?.slice(SESSION_COOKIE.length + 1) ?? "";
    let data: unknown;
    if (op === "plan") data = await service.plan(token, body);
    else if (op === "answer")
      data = await service.answer(token, body, requestId);
    else if (op === "repair")
      data = await service.repair(token, body, provider, requestId);
    else {
      const q = record(body);
      if (!q || Object.keys(q).some((k) => k !== "id") || !uuid(q.id))
        throw new StateFailure("INVALID_INPUT");
      data = await service.replay(
        token,
        uuid(q.id)!,
        op === "replay-repair" ? "repair" : "clarification",
      );
    }
    return send({ status: "available", data, requestId });
  } catch (e) {
    if (e instanceof StateFailure)
      return send(
        { status: "error", code: e.code, requestId },
        e.code === "SESSION_EXPIRED"
          ? 401
          : e.code === "NOT_FOUND"
            ? 404
            : e.code === "RATE_LIMITED"
              ? 429
              : e.code.endsWith("CONFLICT")
                ? 409
                : 400,
      );
    if (e instanceof BodyReadFailure)
      return send(
        { status: "error", code: e.code, requestId },
        e.code === "BODY_READ_TIMEOUT"
          ? 408
          : e.code === "BODY_TOO_LARGE"
            ? 413
            : 400,
      );
    return send({ status: "error", code: "INTERNAL_ERROR", requestId }, 500);
  }
}
