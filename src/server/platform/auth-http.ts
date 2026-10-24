import { getAuthentication } from "@/server/platform/auth";
import { trustedOrigin, safePlatformError } from "@/server/platform/http";
import { readJsonBody } from "@/server/taste/read-body";
import { platformFail } from "@/lib/platform/types";
import { acquireDemoBudget } from "@/server/taste/budget";
export async function handleAuthentication(
  request: Request,
  auth = getAuthentication(),
) {
  const requestId = crypto.randomUUID(),
    release = acquireDemoBudget();
  try {
    if (!release) platformFail("RATE_LIMITED");
    if (!auth) platformFail("NOT_CONFIGURED");
    const path = new URL(request.url).pathname.split("/").at(-1);
    if (!["sign-up", "email", "sign-out", "ok"].includes(path ?? ""))
      platformFail("ACCESS_DENIED");
    let input = request;
    if (request.method === "POST") {
      if (
        !trustedOrigin(request) ||
        request.headers.get("content-type")?.split(";")[0].trim() !==
          "application/json"
      )
        platformFail("ACCESS_DENIED");
      const body = await readJsonBody(request);
      input = new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(body),
      });
    }
    const response = await auth.handler(input);
    if (response.status >= 400) platformFail("AUTH_REQUIRED");
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.delete("Content-Length");
    // Session tokens remain in HttpOnly cookies; never duplicate them into JSON.
    return Response.json(
      {
        status:
          path === "sign-out"
            ? "signed_out"
            : path === "ok"
              ? "ok"
              : "authenticated",
      },
      { headers },
    );
  } catch (e) {
    return safePlatformError(e, requestId);
  } finally {
    release?.();
  }
}
