import { getStateStore } from "@/server/state/postgres";
import { AttestationService } from "@/server/platform/attest-service";
import { admitPublicShared } from "@/server/platform/public-limit";
import { safePlatformError } from "@/server/platform/http";
import { platformFail } from "@/lib/platform/types";
import { readJsonBody } from "@/server/taste/read-body";
export const maxDuration = 30;
const NO_STORE = { "Cache-Control": "no-store" };
// Public relying-party verifier. No credential; bounded body; best-effort limit.
export async function POST(request: Request) {
  const requestId = crypto.randomUUID(),
    release = await admitPublicShared(request, "verify", getStateStore());
  if (!release)
    return Response.json(
      { status: "error", code: "RATE_LIMITED", requestId },
      { status: 429, headers: NO_STORE },
    );
  try {
    if (
      request.headers.get("content-type")?.split(";")[0].trim() !==
      "application/json"
    )
      platformFail("INVALID_INPUT");
    const store = getStateStore();
    if (!store) platformFail("NOT_CONFIGURED");
    const data = await new AttestationService(store).attestationVerify(
      await readJsonBody(request),
    );
    return Response.json(
      { status: "available", data, requestId },
      { headers: { ...NO_STORE, "X-Request-ID": requestId } },
    );
  } catch (e) {
    return safePlatformError(e, requestId);
  } finally {
    release();
  }
}
