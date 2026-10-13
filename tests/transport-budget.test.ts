import { it, expect, vi } from "vitest";
import { resolveSignals } from "@/server/taste/resolve";
import { CANONICAL_SIGNALS } from "@/features/demo/profile";
import type { QlooProvider } from "@/server/qloo/contracts";
import {
  QLOO_TIMEOUT_MS,
  RESOLUTION_CONCURRENCY,
  DEMO_OPERATION_TIMEOUT_MS,
  DEMO_ROUTE_MAX_DURATION_SECONDS,
} from "@/lib/config/qloo-budget";
import { BODY_READ_TIMEOUT_MS } from "@/server/taste/read-body";
it("bounds five resolutions, preserves ordering and individual timeout without retries", async () => {
  let active = 0,
    maximum = 0;
  const resolve = vi.fn(async (signal: { query: string }) => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((r) =>
      setTimeout(r, signal.query === "Nils Frahm" ? 10 : 1),
    );
    active--;
    return signal.query === "Muji"
      ? { status: "unavailable" as const, reason: "timeout" as const }
      : {
          status: "available" as const,
          data: {
            state: "no_match" as const,
            matches: [],
            query: { query: signal.query },
          },
        };
  });
  const provider = { resolve } as unknown as QlooProvider;
  const results = await resolveSignals(provider, [...CANONICAL_SIGNALS]);
  expect(maximum).toBe(RESOLUTION_CONCURRENCY);
  expect(resolve).toHaveBeenCalledTimes(5);
  expect(resolve.mock.calls.map(([s]) => s.query)).toEqual(
    CANONICAL_SIGNALS.map((s) => s.query),
  );
  expect(
    results.map((r, i) =>
      r.status === "available"
        ? r.data.query.query
        : CANONICAL_SIGNALS[i].query,
    ),
  ).toEqual(CANONICAL_SIGNALS.map((s) => s.query));
  expect(results[2]).toEqual({ status: "unavailable", reason: "timeout" });
  expect(results.filter((r) => r.status === "available")).toHaveLength(4);
});
it("allows bounded composite operations below the route execution ceiling", () => {
  expect(QLOO_TIMEOUT_MS).toBe(15000);
  expect(
    Math.ceil(5 / RESOLUTION_CONCURRENCY) * QLOO_TIMEOUT_MS +
      BODY_READ_TIMEOUT_MS,
  ).toBeLessThan(DEMO_OPERATION_TIMEOUT_MS);
  expect(2 * QLOO_TIMEOUT_MS + BODY_READ_TIMEOUT_MS).toBeLessThan(
    DEMO_OPERATION_TIMEOUT_MS,
  );
  expect(DEMO_OPERATION_TIMEOUT_MS).toBeLessThan(
    DEMO_ROUTE_MAX_DURATION_SECONDS * 1000,
  );
});
