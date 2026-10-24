// Bounded load probe (not a capacity claim). Usage: BASE_URL=… node scripts/acceptance/load.mjs
// Public, unauthenticated endpoints only, so the numbers describe the request path
// and database reads, not a particular account's rate limit.
const B = (process.env.BASE_URL ?? "").replace(/\/$/, "");
if (!B) throw Error("BASE_URL is required");
const N = Number(process.env.REQUESTS ?? 300), C = Number(process.env.CONCURRENCY ?? 20);
const targets = [
  ["GET /api/ready", () => fetch(B + "/api/ready")],
  ["GET /.well-known/tastepolicy-issuer", () => fetch(B + "/.well-known/tastepolicy-issuer")],
  ["GET /api/attest/status/1", () => fetch(B + "/api/attest/status/1")],
  ["POST /api/attest/verify (malformed)", () => fetch(B + "/api/attest/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ presentation: "x", audience: "https://a.test", dryRun: true }) })],
  ["POST /api/mcp (no credential)", () => fetch(B + "/api/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" })],
];
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
for (const [name, call] of targets) {
  const times = [], codes = {};
  let next = 0;
  const t0 = performance.now();
  await Promise.all(Array.from({ length: C }, async () => {
    while (next++ < N) {
      const s = performance.now();
      try {
        const r = await call();
        await r.arrayBuffer();
        codes[r.status] = (codes[r.status] ?? 0) + 1;
      } catch {
        codes.error = (codes.error ?? 0) + 1;
      }
      times.push(performance.now() - s);
    }
  }));
  times.sort((a, b) => a - b);
  const total = (performance.now() - t0) / 1000;
  console.log(`${name.padEnd(38)} n=${times.length} c=${C} p50=${q(times, 0.5).toFixed(0)}ms p95=${q(times, 0.95).toFixed(0)}ms max=${times.at(-1).toFixed(0)}ms ${(times.length / total).toFixed(0)} req/s codes=${JSON.stringify(codes)}`);
}
