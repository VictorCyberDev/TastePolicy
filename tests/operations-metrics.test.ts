// @vitest-environment node
import { it, expect, vi, afterEach } from "vitest";
import {
  operationMetric,
  measuredHttp,
  measuredProvider,
} from "@/server/operations/metrics";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it("logs only fixed low-cardinality fields and clamps durations", () => {
  vi.stubEnv("TASTEPOLICY_OPERATION_METRICS", "true");
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  operationMetric("DECISION", "ASK", 500000);
  expect(JSON.parse(log.mock.calls[0][0])).toEqual({
    event: "tastepolicy_operation_v1",
    surface: "DECISION",
    outcome: "ASK",
    durationMs: 120000,
    at: expect.any(String),
  });
  // Runtime inputs are validated even if a future caller circumvents TypeScript.
  operationMetric("PRIVATE_VALUE" as "REST", "OK", 1);
  operationMetric("REST", "OK", NaN);
  expect(log).toHaveBeenCalledTimes(1);
});
it("keeps protocol responses, errors and provider values unchanged without logging their contents", async () => {
  vi.stubEnv("TASTEPOLICY_OPERATION_METRICS", "true");
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const response = new Response("PRIVATE_BODY", { status: 503 });
  expect(await measuredHttp("MCP", async () => response)).toBe(response);
  const error = new Error("PRIVATE_ERROR");
  await expect(
    measuredHttp("OAUTH", async () => {
      throw error;
    }),
  ).rejects.toBe(error);
  const result = { status: "unavailable", reason: "PRIVATE_REASON" };
  expect(await measuredProvider(async () => result)).toBe(result);
  expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE");
  expect(log).toHaveBeenCalledTimes(3);
});
it("emits nothing until enabled", () => {
  vi.stubEnv("TASTEPOLICY_OPERATION_METRICS", "false");
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  operationMetric("REST", "OK", 1);
  expect(log).not.toHaveBeenCalled();
});
