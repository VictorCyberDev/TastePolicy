import { getJson, validPoint } from "./http";
import type { OpenRoute, ProviderOutcome, RouteQuery } from "./types";

// HeiGIT-hosted openrouteservice (the current endpoint, not the deprecated
// api.openrouteservice.org). Optional: without HEIGIT_API_KEY no duration or
// route is ever invented.
interface GeoJson {
  features?: {
    properties?: { summary?: { distance?: number; duration?: number } };
    geometry?: { type?: string; coordinates?: unknown };
  }[];
}
export function parseRoute(
  body: GeoJson,
  profile: OpenRoute["profile"],
): OpenRoute | null {
  const f = body.features?.[0];
  const s = f?.properties?.summary;
  const c = f?.geometry?.coordinates;
  if (
    !s ||
    typeof s.distance !== "number" ||
    typeof s.duration !== "number" ||
    f?.geometry?.type !== "LineString" ||
    !Array.isArray(c) ||
    c.length < 2 ||
    c.length > 5000
  )
    return null;
  const geometry: [number, number][] = [];
  for (const p of c) {
    if (
      !Array.isArray(p) ||
      typeof p[0] !== "number" ||
      typeof p[1] !== "number" ||
      !validPoint({ lat: p[1], lng: p[0] })
    )
      return null;
    geometry.push([p[0], p[1]]);
  }
  return {
    provider: "openrouteservice",
    profile,
    minutes: Math.max(1, Math.round(s.duration / 60)),
    meters: Math.round(s.distance),
    geometry,
  };
}

export async function openRoute(
  q: RouteQuery,
  apiKey: string | undefined,
  fetcher?: typeof fetch,
): Promise<ProviderOutcome<OpenRoute>> {
  if (!apiKey) return { status: "unavailable", reason: "not_configured" };
  if (!validPoint(q.from) || !validPoint(q.to))
    return { status: "unavailable", reason: "invalid_response" };
  const profile = q.profile ?? "foot-walking";
  const r = await getJson<GeoJson>(
    `https://api.heigit.org/openrouteservice/v2/directions/${profile}/geojson`,
    {
      allowHosts: ["api.heigit.org"],
      timeoutMs: 6000,
      fetcher,
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        coordinates: [
          [q.from.lng, q.from.lat],
          [q.to.lng, q.to.lat],
        ],
      }),
    },
  );
  if (r.status !== "available") return r;
  const route = parseRoute(r.data, profile);
  return route
    ? { status: "available", data: route }
    : { status: "unavailable", reason: "invalid_response" };
}
