import "server-only";

// Best-effort admission for unauthenticated endpoints. It is per instance
// (serverless instances do not share memory), so it bounds abuse of one
// instance and never replaces edge protection. It is separate from the
// authenticated budget, and each public route has its own pool, so anonymous
// traffic can starve neither credential holders nor the other public route.
export type Pool = "verify" | "status";
const WINDOW_MS = 60_000,
  PER_IP = 60,
  CONCURRENT: Record<Pool, number> = { verify: 8, status: 16 },
  MAX_TRACKED = 5000;
const hits: Record<Pool, Map<string, number[]>> = {
  verify: new Map(),
  status: new Map(),
};
const active: Record<Pool, number> = { verify: 0, status: 0 };
// Only headers the platform sets are trusted: Vercel overwrites these, so a
// client cannot choose its own bucket. Without them everyone shares "unknown".
export function clientKey(request: Request) {
  const h = request.headers;
  const v =
    h.get("x-vercel-forwarded-for") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",").at(-1);
  return (v ?? "unknown").trim().slice(0, 64) || "unknown";
}
export function admitPublic(
  request: Request,
  pool: Pool = "verify",
  now = Date.now(),
): (() => void) | null {
  if (active[pool] >= CONCURRENT[pool]) return null;
  const map = hits[pool],
    ip = clientKey(request),
    recent = (map.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= PER_IP) return null;
  recent.push(now);
  map.delete(ip);
  map.set(ip, recent); // most recently used last
  // Hard cap: evict the least recently used clients, never grow unbounded.
  while (map.size > MAX_TRACKED) map.delete(map.keys().next().value as string);
  active[pool]++;
  let done = false;
  return () => {
    if (!done) {
      done = true;
      active[pool]--;
    }
  };
}
