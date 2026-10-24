import { getStateStore } from "@/server/state/postgres";
import { AttestationService } from "@/server/platform/attest-service";
import { admitPublic } from "@/server/platform/public-limit";
import { safePlatformError } from "@/server/platform/http";
import { platformFail } from "@/lib/platform/types";
// Token Status List (draft-ietf-oauth-status-list). Public by design: it holds
// only anonymous status values at random indices.
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID(),
    release = admitPublic(request, "status");
  if (!release)
    return Response.json(
      { status: "error", code: "RATE_LIMITED", requestId },
      { status: 429 },
    );
  try {
    const { id } = await context.params;
    if (!/^[1-9]\d{0,8}$/.test(id)) platformFail("INVALID_INPUT");
    const store = getStateStore();
    if (!store) platformFail("NOT_CONFIGURED");
    const token = await new AttestationService(store).statusListToken(
      Number(id),
    );
    if (!token)
      return Response.json(
        { status: "error", code: "STATUS_LIST_NOT_FOUND", requestId },
        { status: 404 },
      );
    return new Response(token, {
      headers: {
        "Content-Type": "application/statuslist+jwt",
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*",
        "X-Request-ID": requestId,
      },
    });
  } catch (e) {
    return safePlatformError(e, requestId);
  } finally {
    release();
  }
}
