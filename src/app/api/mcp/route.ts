import { getStateStore } from "@/server/state/postgres";
import { getQlooProvider } from "@/server/qloo/provider";
import { handleMcp } from "@/server/platform/mcp";
import { acquireDemoBudget } from "@/server/taste/budget";
export const maxDuration = 60;
async function handle(request: Request) {
  const release = acquireDemoBudget();
  if (!release)
    return Response.json(
      { code: "RATE_LIMITED" },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  try {
    return await handleMcp(request, {
      store: getStateStore(),
      factory: getQlooProvider,
    });
  } finally {
    release();
  }
}
export const POST = handle;
export const GET = handle;
export const DELETE = handle;
