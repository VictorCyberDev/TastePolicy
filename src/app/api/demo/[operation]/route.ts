import { getQlooProvider } from "@/server/qloo/provider";
import { handleDemo } from "@/server/taste/http";
import { acquireDemoBudget } from "@/server/taste/budget";
export const maxDuration = 60;
export async function POST(
  request: Request,
  context: { params: Promise<{ operation: string }> },
) {
  const { operation } = await context.params;
  if (!["resolve", "discover", "evaluate"].includes(operation))
    return Response.json(
      { status: "error", code: "NOT_FOUND" },
      { status: 404 },
    );
  const release = acquireDemoBudget();
  if (!release)
    return Response.json(
      { status: "unavailable", reason: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": "60", "Cache-Control": "no-store" },
      },
    );
  try {
    return await handleDemo(request, operation, getQlooProvider());
  } finally {
    release();
  }
}
