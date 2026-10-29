import type { ProviderOutcome } from "./types";

// Shared plumbing for third-party open services: bounded time and size, a
// host allowlist, and a small in-process TTL cache so free public
// infrastructure is not asked the same question twice.
export const USER_AGENT =
  "TastePolicy/1.0 (+https://tastepolicy.vercel.app; contact: ainaldchronicles@gmail.com)";

export async function getJson<T>(
  url: string,
  o: {
    allowHosts: string[];
    timeoutMs: number;
    fetcher?: typeof fetch;
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
    maxBytes?: number;
  },
): Promise<ProviderOutcome<T>> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { status: "unavailable", reason: "blocked_host" };
  }
  if (parsed.protocol !== "https:" || !o.allowHosts.includes(parsed.hostname))
    return { status: "unavailable", reason: "blocked_host" };
  try {
    const res = await (o.fetcher ?? fetch)(url, {
      method: o.method ?? "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...o.headers,
      },
      body: o.body,
      signal: AbortSignal.timeout(o.timeoutMs),
      redirect: "error",
    });
    if (!res.ok) return { status: "unavailable", reason: "provider_error" };
    const text = await res.text();
    if (text.length > (o.maxBytes ?? 2_000_000))
      return { status: "unavailable", reason: "invalid_response" };
    try {
      return { status: "available", data: JSON.parse(text) as T };
    } catch {
      return { status: "unavailable", reason: "invalid_response" };
    }
  } catch (e) {
    return {
      status: "unavailable",
      reason:
        e instanceof Error &&
        (e.name === "TimeoutError" || e.name === "AbortError")
          ? "timeout"
          : "provider_error",
    };
  }
}

const cache = new Map<string, { at: number; value: unknown }>();
export async function cached<T>(
  key: string,
  ttlMs: number,
  produce: () => Promise<ProviderOutcome<T>>,
  now = Date.now(),
): Promise<ProviderOutcome<T>> {
  const hit = cache.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value as ProviderOutcome<T>;
  const value = await produce();
  // Failures are not cached for long: a transient outage must not stick.
  if (value.status === "available") {
    if (cache.size > 300) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: now, value });
  }
  return value;
}
export const clearOpenCache = () => cache.clear();

// Public Nominatim allows at most one request per second.
let last = 0;
let chain: Promise<unknown> = Promise.resolve();
export function nominatimSlot<T>(
  task: () => Promise<T>,
  gapMs = 1100,
): Promise<T> {
  const run = chain.then(async () => {
    const wait = last + gapMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await task();
    } finally {
      last = Date.now();
    }
  });
  chain = run.catch(() => undefined);
  return run;
}

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const R = 6371008.8,
    rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat),
    dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const validPoint = (p: { lat: number; lng: number }) =>
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lng) &&
  Math.abs(p.lat) <= 90 &&
  Math.abs(p.lng) <= 180;
