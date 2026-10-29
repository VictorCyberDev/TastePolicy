// Read-only outside-origin monitor. No private records or auth credentials.
import { mkdir, writeFile } from "node:fs/promises";
const origin = "https://tastepolicy.vercel.app";
const probes = [
  ["liveness", "/api/health", (v) => v.status === "ok"],
  [
    "readiness",
    "/api/ready",
    (v) =>
      v.status === "ready" &&
      v.checks.database === "up" &&
      v.checks.migrations === "current",
  ],
  ["OpenAPI", "/api/v1/openapi", (v) => typeof v.openapi === "string"],
  [
    "agent_card",
    "/.well-known/agent-card.json",
    (v) => JSON.stringify(v).includes(origin),
  ],
  [
    "OAuth_issuer",
    "/.well-known/oauth-authorization-server",
    (v) => v.issuer === origin,
  ],
];
const results = await Promise.all(
  probes.map(async ([name, path, check]) => {
    const start = performance.now();
    try {
      const response = await fetch(origin + path, {
        signal: AbortSignal.timeout(10000),
        redirect: "error",
        cache: "no-store",
      });
      const text = await response.text();
      if (text.length > 1024 * 1024) throw new Error("BOUNDS");
      const valid = response.ok && check(JSON.parse(text));
      return {
        name,
        status: valid ? "PASS" : "FAIL",
        http: response.status,
        elapsedMs: Math.round(performance.now() - start),
      };
    } catch {
      return {
        name,
        status: "FAIL",
        http: null,
        elapsedMs: Math.round(performance.now() - start),
      };
    }
  }),
);
const result = {
  checkedAt: new Date().toISOString(),
  origin,
  scope:
    "Read-only liveness/readiness/public metadata. Not signup, Qloo reachability, OAuth authorization, tool invocation or uptime SLA.",
  results,
};
await mkdir(".work-evidence", { recursive: true });
await writeFile(
  ".work-evidence/production-monitor.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result));
if (results.some((r) => r.status !== "PASS")) process.exitCode = 1;
