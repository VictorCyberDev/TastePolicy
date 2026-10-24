import "server-only";

// Best-effort admission for unauthenticated endpoints. It is per instance
// (serverless instances do not share memory), so it bounds abuse of one
// instance, never replaces edge protection. It is deliberately separate from the
// authenticated budget so anonymous traffic cannot starve credential holders.
const WINDOW_MS = 60_000,
  PER_IP = 60,
  CONCURRENT = 8,
  MAX_TRACKED = 5000;
const hits = new Map<string, number[]>();
let active = 0;
export function admitPublic(
  request: Request,
  now = Date.now(),
): (() => void) | null {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim().slice(0, 64) ||
    "unknown";
  if (active >= CONCURRENT) return null;
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= PER_IP) return null;
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > MAX_TRACKED)
    for (const [k, v] of hits)
      if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  active++;
  let done = false;
  return () => {
    if (!done) {
      done = true;
      active--;
    }
  };
}
