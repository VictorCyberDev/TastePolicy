import "server-only";
import { TasteStateService } from "./service";
import { StateFailure } from "@/lib/state/types";
import { readJsonBody, BodyReadFailure } from "@/server/taste/read-body";
import { record, uuid } from "@/lib/validation";
import type { QlooProvider } from "@/server/qloo/contracts";
import { contextGraph, stateDiff } from "./graph";
export const SESSION_COOKIE = "tastepolicy_demo";
export async function handleState(
  request: Request,
  operation: string,
  service: TasteStateService | null,
  provider: () => QlooProvider,
) {
  const requestId = crypto.randomUUID();
  const send = (
    body: unknown,
    status = 200,
    headers: Record<string, string> = {},
  ) =>
    Response.json(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-ID": requestId,
        ...headers,
      },
    });
  const url = new URL(request.url);
  if (
    request.headers.get("origin") !==
      `${url.protocol}//${request.headers.get("host") ?? url.host}` ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return send({ status: "error", code: "ORIGIN_NOT_ALLOWED" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return send({ status: "error", code: "INVALID_CONTENT_TYPE" }, 415);
  if (!service)
    return send(
      { status: "unavailable", reason: "persistence_not_configured" },
      503,
    );
  try {
    const raw = await readJsonBody(request),
      r = record(raw);
    if (!r) throw new StateFailure("INVALID_INPUT");
    const token =
      request.headers
        .get("cookie")
        ?.split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith(SESSION_COOKIE + "="))
        ?.slice(SESSION_COOKIE.length + 1) ?? "";
    if (operation === "session") {
      if (Object.keys(r).length) throw new StateFailure("INVALID_INPUT");
      if (token) {
        try {
          return send({ status: "available", data: await service.read(token) });
        } catch (e) {
          if (!(e instanceof StateFailure) || e.code !== "SESSION_EXPIRED")
            throw e;
        }
      }
      const session = await service.createSession();
      return send({ status: "available", expiresAt: session.expiresAt }, 200, {
        "Set-Cookie": `${SESSION_COOKIE}=${session.token}; Path=/api/state; HttpOnly; SameSite=Strict; Max-Age=86400${url.protocol === "https:" ? "; Secure" : ""}`,
      });
    }
    if (operation === "read") {
      if (Object.keys(r).length) throw new StateFailure("INVALID_INPUT");
      const data = await service.read(token);
      const e = data.evaluations.at(-1);
      const selectedState = e
        ? await service.store.transaction((x) =>
            x.states.version(data.profile.profileId, e.stateVersion),
          )
        : null;
      return send({
        status: "available",
        data: {
          ...data,
          graph: contextGraph(selectedState ?? data.state, data.feedback, e),
          tasteGraph: contextGraph(data.state, data.feedback),
          diff: stateDiff(data.previous, data.state),
        },
      });
    }
    if (operation === "mutate")
      return send({
        status: "available",
        data: await service.mutate(token, r, requestId),
      });
    if (operation === "evaluate")
      return send({
        status: "available",
        data: await service.evaluate(token, r, provider, requestId),
      });
    if (operation === "replay") {
      if (
        Object.keys(r).some((k) => k !== "evaluationId") ||
        !uuid(r.evaluationId)
      )
        throw new StateFailure("INVALID_INPUT");
      return send({
        status: "available",
        data: await service.replay(token, uuid(r.evaluationId)!),
      });
    }
    return send({ status: "error", code: "NOT_FOUND" }, 404);
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
        e.code === "BODY_TOO_LARGE"
          ? 413
          : e.code === "BODY_READ_TIMEOUT"
            ? 408
            : 400,
      );
    return send({ status: "error", code: "INTERNAL_ERROR", requestId }, 500);
  }
}
