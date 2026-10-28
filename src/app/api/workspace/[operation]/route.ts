import { getStateStore } from "@/server/state/postgres";
import {
  sessionPrincipal,
  trustedOrigin,
  safePlatformError,
} from "@/server/platform/http";
import { AttestationService } from "@/server/platform/attest-service";
import { WorkspaceService } from "@/server/platform/workspace-service";
import { platformFail, PlatformFailure } from "@/lib/platform/types";
import { readJsonBody } from "@/server/taste/read-body";
import { acquireDemoBudget } from "@/server/taste/budget";
export const maxDuration = 15;
export async function POST(
  request: Request,
  context: { params: Promise<{ operation: string }> },
) {
  const requestId = crypto.randomUUID();
  const release = acquireDemoBudget();
  if (!release)
    return safePlatformError(new PlatformFailure("RATE_LIMITED"), requestId);
  try {
    if (!trustedOrigin(request) || request.headers.has("authorization"))
      platformFail("ACCESS_DENIED");
    if (
      request.headers.get("content-type")?.split(";")[0].trim() !==
      "application/json"
    )
      platformFail("INVALID_INPUT");
    const store = getStateStore();
    if (!store) platformFail("NOT_CONFIGURED");
    const p = await sessionPrincipal(request),
      body = await readJsonBody(request),
      op = (await context.params).operation;
    const service = new WorkspaceService(store.pool);
    const data =
      op === "inspect"
        ? await service.inspect(p)
        : op === "revoke-agent"
          ? await new AttestationService(store).revokeRegisteredAgent(p, body)
          : await service.mutate(p, op, body);
    return Response.json(
      { status: "available", data, requestId },
      { headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
    );
  } catch (e) {
    return safePlatformError(e, requestId);
  } finally {
    release();
  }
}
