import "server-only";
const surfaces = [
  "REST",
  "MCP",
  "MCP_TOOL",
  "A2A",
  "OAUTH",
  "DATABASE",
  "QLOO",
  "DECISION",
] as const;
const outcomes = [
  "OK",
  "ERROR",
  "ALLOW",
  "ASK",
  "REJECT",
  "UNAVAILABLE",
] as const;
type Surface = (typeof surfaces)[number];
type Outcome = (typeof outcomes)[number];
// No user, tenant, candidate, preference, query, URL, token, body or error text.
export function operationMetric(
  surface: Surface,
  outcome: Outcome,
  elapsedMs: number,
) {
  if (process.env.TASTEPOLICY_OPERATION_METRICS !== "true") return;
  if (
    !surfaces.includes(surface) ||
    !outcomes.includes(outcome) ||
    !Number.isFinite(elapsedMs)
  )
    return;
  try {
    console.info(
      JSON.stringify({
        event: "tastepolicy_operation_v1",
        surface,
        outcome,
        durationMs: Math.round(Math.min(120000, Math.max(0, elapsedMs))),
        at: new Date().toISOString(),
      }),
    );
  } catch {
    /* Logging failure cannot change authorization. */
  }
}
export async function measuredHttp(
  surface: Surface,
  work: () => Promise<Response>,
): Promise<Response> {
  const start = performance.now();
  try {
    const response = await work();
    operationMetric(
      surface,
      response.status >= 400 ? "ERROR" : "OK",
      performance.now() - start,
    );
    return response;
  } catch (e) {
    operationMetric(surface, "ERROR", performance.now() - start);
    throw e;
  }
}
export async function measuredProvider<T extends { status: string }>(
  work: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  try {
    const result = await work();
    operationMetric(
      "QLOO",
      result.status === "available" ? "OK" : "UNAVAILABLE",
      performance.now() - start,
    );
    return result;
  } catch (e) {
    operationMetric("QLOO", "ERROR", performance.now() - start);
    throw e;
  }
}
