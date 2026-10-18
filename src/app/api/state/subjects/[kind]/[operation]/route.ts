import { getStateStore } from "@/server/state/postgres";
import { getQlooProvider } from "@/server/qloo/provider";
import { acquireDemoBudget } from "@/server/taste/budget";
import { handleSubjects } from "@/server/subjects/http";
export const maxDuration = 60;
export async function POST(
  request: Request,
  context: { params: Promise<{ kind: string; operation: string }> },
) {
  const release = acquireDemoBudget();
  if (!release)
    return Response.json(
      { status: "error", code: "RATE_LIMITED" },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  try {
    const { kind, operation } = await context.params;
    return await handleSubjects(
      request,
      kind,
      operation,
      getStateStore(),
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
