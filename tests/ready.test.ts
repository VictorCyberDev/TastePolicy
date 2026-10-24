// @vitest-environment node
import { it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});
it("reports not_ready with named, value-free components when nothing is configured", async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("BETTER_AUTH_SECRET", "");
  vi.stubEnv("TASTEPOLICY_ATTESTATION_KEY", "");
  vi.stubEnv("QLOO_API_KEY", "");
  const { GET } = await import("@/app/api/ready/route");
  const res = await GET();
  const body = await res.json();
  expect(res.status).toBe(503);
  expect(body.status).toBe("not_ready");
  expect(body.checks).toMatchObject({
    database: "unconfigured",
    authentication: "unconfigured",
    attestation: "unconfigured",
  });
  expect(JSON.stringify(body)).not.toMatch(
    /postgres|secret|key=|tp_live|BEGIN/i,
  );
  expect(res.headers.get("cache-control")).toBe("no-store");
});
