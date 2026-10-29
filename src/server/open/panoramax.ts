import { getJson } from "./http";
import { num, placeItem, safeImage, safeLanding } from "./media-common";
import type { MediaProvider, PlaceMediaItem } from "./types";

// Panoramax (federated, STAC-compatible). No key. Items carry their own
// license; a picture without one is not shown.
const API = "https://api.panoramax.xyz/api/search";
const VIEWER = "https://api.panoramax.xyz/";
interface Feature {
  id?: string;
  collection?: string;
  geometry?: { type?: string; coordinates?: number[] };
  properties?: Record<string, unknown> & {
    datetime?: string;
    license?: string;
    "view:azimuth"?: number;
    "geovisio:producer"?: string;
    "pers:interior_orientation"?: { field_of_view?: number };
    type?: string;
  };
  assets?: Record<string, { href?: string }>;
  links?: { rel?: string; href?: string }[];
}
export function parsePanoramax(
  body: { features?: Feature[] },
  target: { lat: number; lng: number },
): PlaceMediaItem[] {
  if (!Array.isArray(body?.features)) return [];
  const out: PlaceMediaItem[] = [];
  for (const f of body.features) {
    const c = f?.geometry?.coordinates;
    const p = f?.properties;
    if (!f?.id || !Array.isArray(c) || c.length < 2 || !p) continue;
    const license = typeof p.license === "string" ? p.license : "";
    const licenseUrl = safeLanding(
      f.links?.find((l) => l.rel === "license")?.href,
      [
        "creativecommons.org",
        "alliance.numerique.gouv.fr",
        "www.etalab.gouv.fr",
        "spdx.org",
      ],
    );
    if (!license) continue;
    const sd = safeImage(f.assets?.sd?.href),
      thumb = safeImage(f.assets?.thumb?.href) ?? sd;
    if (!sd || !thumb) continue;
    const fov = p["pers:interior_orientation"]?.field_of_view;
    const panoramic = fov === 360 || p.type === "equirectangular";
    const producer =
      typeof p["geovisio:producer"] === "string"
        ? p["geovisio:producer"]
        : undefined;
    const item = placeItem(
      {
        provider: "panoramax",
        providerId: f.id,
        mediaType: panoramic ? "panorama" : "photo",
        url: sd,
        thumbUrl: thumb,
        landingUrl: `${VIEWER}#focus=pic&pic=${encodeURIComponent(f.id)}`,
        viewerUrl: `${VIEWER}#focus=pic&pic=${encodeURIComponent(f.id)}`,
        author: producer,
        attribution: `© Panoramax contributors${producer ? ` · ${producer}` : ""}`,
        license,
        licenseUrl,
        capturedAt:
          typeof p.datetime === "string" ? p.datetime.slice(0, 10) : undefined,
        location: { lng: c[0], lat: c[1] },
        heading: num(p["view:azimuth"]),
        fieldOfView: fov,
        sequenceId: f.collection,
        panoramic,
      },
      target,
    );
    if (item) out.push(item);
  }
  // Panoramax does not number frames; order each sequence by capture time.
  const bySeq = new Map<string, PlaceMediaItem[]>();
  for (const i of out)
    bySeq.set(i.sequenceId ?? i.providerId, [
      ...(bySeq.get(i.sequenceId ?? i.providerId) ?? []),
      i,
    ]);
  for (const list of bySeq.values()) {
    list.sort((a, b) => (a.capturedAt ?? "").localeCompare(b.capturedAt ?? ""));
    list.forEach((i, n) => (i.sequenceIndex = n));
  }
  return out;
}
export const panoramax: MediaProvider = {
  id: "panoramax",
  async search(q, fetcher) {
    const url = `${API}?${new URLSearchParams({
      place_position: `${q.point.lng},${q.point.lat}`,
      place_distance: `0-${q.radiusMeters}`,
      limit: String(q.limit),
    })}`;
    const r = await getJson<{ features?: Feature[] }>(url, {
      allowHosts: ["api.panoramax.xyz"],
      timeoutMs: 5000,
      fetcher,
    });
    if (r.status !== "available") return r;
    if (!Array.isArray(r.data?.features))
      return { status: "unavailable", reason: "invalid_response" };
    return { status: "available", data: parsePanoramax(r.data, q.point) };
  },
};
