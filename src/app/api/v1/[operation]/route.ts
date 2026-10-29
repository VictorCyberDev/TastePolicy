import { measuredHttp } from "@/server/operations/metrics";
import { getStateStore } from "@/server/state/postgres";
import { getQlooProvider } from "@/server/qloo/provider";
import { handlePlatform, safePlatformError } from "@/server/platform/http";
import { acquireDemoBudget } from "@/server/taste/budget";
export const maxDuration = 60;
async function handle(
  request: Request,
  context: { params: Promise<{ operation: string }> },
) {
  const release = acquireDemoBudget();
  if (!release)
    return Response.json(
      { status: "error", code: "RATE_LIMITED" },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  try {
    return await handlePlatform(
      request,
      (await context.params).operation,
      "v1",
      getStateStore(),
      getQlooProvider,
    );
  } catch (e) {
    return safePlatformError(e, crypto.randomUUID());
  } finally {
    release();
  }
}
const measured = (
  request: Request,
  context: { params: Promise<{ operation: string }> },
) => measuredHttp("REST", () => handle(request, context));
export const POST = measured;
export const GET = measured;
