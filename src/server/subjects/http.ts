import "server-only";
import type { StateStore } from "@/server/state/repositories";
import type { QlooProvider } from "@/server/qloo/contracts";
import { ProxyService } from "./proxy-service";
import { GroupService } from "./group-service";
import { StateFailure } from "@/lib/state/types";
import { SubjectFailure } from "@/lib/subjects/types";
import { readJsonBody, BodyReadFailure } from "@/server/taste/read-body";
import { SESSION_COOKIE } from "@/server/state/http";
export async function handleSubjects(
  request: Request,
  kind: string,
  op: string,
  store: StateStore | null,
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
    !["proxy", "group"].includes(kind) ||
    !(
      kind === "proxy"
        ? [
            "resolve",
            "inspect",
            "create",
            "update",
            "revoke",
            "delete",
            "evaluate",
            "replay",
          ]
        : ["inspect", "create", "update", "delete", "authorize", "replay"]
    ).includes(op)
  )
    return send({ status: "error", code: "NOT_FOUND" }, 404);
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    return send({ status: "error", code: "INVALID_CONTENT_TYPE" }, 415);
  if (!store)
    return send(
      { status: "unavailable", reason: "persistence_not_configured" },
      503,
    );
  try {
    const body = await readJsonBody(request),
      token =
        request.headers
          .get("cookie")
          ?.split(";")
          .map((s) => s.trim())
          .find((s) => s.startsWith(SESSION_COOKIE + "="))
          ?.slice(SESSION_COOKIE.length + 1) ?? "";
    let data: unknown;
    if (kind === "proxy") {
      const service = new ProxyService(store);
      if (op === "resolve") data = await service.resolve(token, body, provider);
      else if (op === "inspect") data = await service.inspect(token);
      else if (op === "create")
        data = await service.create(token, body, provider, requestId);
      else if (op === "update")
        data = await service.update(token, body, provider);
      else if (op === "evaluate")
        data = await service.evaluate(token, body, provider, requestId);
      else if (op === "replay") data = await service.replay(token, body);
      else data = await service.revoke(token, body, requestId, op === "delete");
    } else {
      const service = new GroupService(store);
      if (op === "inspect") data = await service.inspect(token);
      else if (op === "create") data = await service.create(token, body);
      else if (op === "update") data = await service.update(token, body);
      else if (op === "authorize")
        data = await service.authorize(token, body, requestId);
      else if (op === "replay") data = await service.replay(token, body);
      else data = await service.delete(token, body);
    }
    return send({ status: "available", data, requestId });
  } catch (e) {
    if (e instanceof StateFailure || e instanceof SubjectFailure)
      return send(
        { status: "error", code: e.code, requestId },
        e.code === "NOT_FOUND"
          ? 404
          : e.code === "SESSION_EXPIRED"
            ? 401
            : e.code === "RATE_LIMITED"
              ? 429
              : e.code === "PROVIDER_UNAVAILABLE"
                ? 503
                : e.code === "INVALID_INPUT"
                  ? 400
                  : 409,
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
