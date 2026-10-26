import "server-only";
import { createHmac } from "node:crypto";
import type { StateStore } from "@/server/state/repositories";
import { clientKey } from "./client-key";

// Admission for unauthenticated endpoints, in two tiers.
//  1. Per instance: a concurrency cap and a short window per client. Cheap, no
//     I/O, and it bounds what one instance does even if the database is slow.
//  2. Shared (PostgreSQL): an atomic counter every instance increments, per
//     client and per pool. This is the limit that holds across instances; it
//     also caps the pool's total, so the cryptographic and database work the
//     public verifier can be made to do is bounded no matter how many clients
//     (or instances) there are. Counters are keyed by an HMAC of the caller,
//     never an address, and old minutes are deleted as new ones are written.
// Each public route has its own pool, separate from the authenticated budget,
// so anonymous traffic cannot starve credential holders or the other route.
// If the shared tier is unavailable the per-instance tier still applies (it
// never opens the endpoint).
export type Pool = "verify" | "status";
const WINDOW_MS = 60_000,
  PER_IP = 60,
  DEGRADED_PER_IP = 15,
  CONCURRENT: Record<Pool, number> = { verify: 8, status: 16 },
  // Shared per-minute budgets: per client, and for the whole pool.
  SHARED_PER_CLIENT: Record<Pool, number> = { verify: 60, status: 120 },
  SHARED_POOL_TOTAL: Record<Pool, number> = { verify: 1200, status: 6000 },
  MAX_TRACKED = 5000;
const hits: Record<Pool, Map<string, number[]>> = {
  verify: new Map(),
  status: new Map(),
};
const active: Record<Pool, number> = { verify: 0, status: 0 };
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

// Both tiers. Returns a release function, or null when the caller must wait.
export async function admitPublicShared(
  request: Request,
  pool: Pool,
  store: StateStore | null,
  now = Date.now(),
): Promise<(() => void) | null> {
  const release = admitPublic(request, pool, now);
  if (!release) return null;
  if (!store) return release;
  const secret = process.env.BETTER_AUTH_SECRET ?? "unconfigured",
    minute = new Date(now).toISOString().slice(0, 16),
    keyOf = (k: string) =>
      createHmac("sha256", secret).update(`public|${pool}|${k}`).digest("hex");
  try {
    // One transaction, two atomic counters. The client's own budget is
    // spent first, so a single caller can use at most its own budget of the
    // pool and cannot exhaust it for everyone else.
    const ok = await store.transaction(async (r) => {
      const clientOk = await r.oauth.admit(
        keyOf(clientKey(request)),
        minute,
        SHARED_PER_CLIENT[pool],
      );
      if (!clientOk) return false;
      return r.oauth.admit(keyOf("*"), minute, SHARED_POOL_TOTAL[pool]);
    });
    if (!ok) {
      release();
      return null;
    }
  } catch {
    // Shared tier unavailable. The per-instance tier above already applied;
    // while it is down the budget is also tightened, so a database under
    // stress does not lift the limit exactly when it matters.
    const map = hits[pool],
      recent = (map.get(clientKey(request)) ?? []).filter(
        (t) => now - t < WINDOW_MS,
      );
    if (recent.length > DEGRADED_PER_IP) {
      release();
      return null;
    }
  }
  return release;
}
