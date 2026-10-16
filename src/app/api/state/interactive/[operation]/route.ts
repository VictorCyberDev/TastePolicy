import { getStateStore } from "@/server/state/postgres";
import { InteractiveService } from "@/server/interactive/service";
import { handleInteractive } from "@/server/interactive/http";
import { getQlooProvider } from "@/server/qloo/provider";
import { acquireDemoBudget } from "@/server/taste/budget";
export const maxDuration = 60;
export async function POST(
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
    const { operation } = await context.params;
    const store = getStateStore();
    return await handleInteractive(
      request,
      operation,
      store ? new InteractiveService(store) : null,
      getQlooProvider,
    );
  } catch {
    return Response.json(
      { status: "error", code: "INTERNAL_ERROR" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    release();
  }
}
