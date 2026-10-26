import "server-only";
import { clientKey } from "./client-key";

// Admission for the sign-in endpoints, kept apart from every other budget so
// anonymous traffic cannot use up the capacity authenticated agents depend on
// (and the reverse). Per client and per process; the database-backed counters
// protect the OAuth endpoints, and better-auth applies its own persisted
// limits to the credential checks themselves.
const WINDOW = 60_000,
  PER_CLIENT = 20,
  CONCURRENT = 6,
  MAX_TRACKED = 5000;
const seen = new Map<string, number[]>();
let active = 0;
export function admitAuth(request: Request, now = Date.now()) {
  if (active >= CONCURRENT) return null;
  const k = clientKey(request),
    recent = (seen.get(k) ?? []).filter((t) => now - t < WINDOW);
  if (recent.length >= PER_CLIENT) return null;
  recent.push(now);
  seen.delete(k);
  seen.set(k, recent);
  while (seen.size > MAX_TRACKED)
    seen.delete(seen.keys().next().value as string);
  active++;
  let done = false;
  return () => {
    if (!done) {
      done = true;
      active--;
    }
  };
}
