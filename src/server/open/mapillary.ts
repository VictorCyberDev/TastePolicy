import { getJson } from "./http";
import { num, placeItem, safeImage } from "./media-common";
import type { MediaProvider, PlaceMediaItem } from "./types";

// Optional. Mapillary needs an access token (MAPILLARY_ACCESS_TOKEN); without
// one the provider reports not_configured and is simply skipped. Crowdsourced,
// CC BY-SA 4.0; not part of the zero-credential open core.
interface Row {
  id?: string;
  captured_at?: number;
  compass_angle?: number;
  is_pano?: boolean;
  sequence?: string;
  thumb_1024_url?: string;
  thumb_256_url?: string;
  geometry?: { coordinates?: number[] };
  creator?: { username?: string };
}
export function parseMapillary(
  body: { data?: Row[] },
  target: { lat: number; lng: number },
): PlaceMediaItem[] {
  if (!Array.isArray(body?.data)) return [];
  const out: PlaceMediaItem[] = [];
  for (const r of body.data) {
    const c = r?.geometry?.coordinates;
    const url = safeImage(r?.thumb_1024_url);
    const thumb = safeImage(r?.thumb_256_url) ?? url;
    if (!r?.id || !Array.isArray(c) || c.length < 2 || !url || !thumb) continue;
    const item = placeItem(
      {
        provider: "mapillary",
        providerId: String(r.id),
        mediaType: r.is_pano ? "panorama" : "photo",
        url,
        thumbUrl: thumb,
        landingUrl: `https://www.mapillary.com/app/?pKey=${encodeURIComponent(String(r.id))}`,
        author: r.creator?.username,
        attribution: `© Mapillary contributors${r.creator?.username ? ` · ${r.creator.username}` : ""}`,
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
        capturedAt:
          typeof r.captured_at === "number"
            ? new Date(r.captured_at).toISOString().slice(0, 10)
            : undefined,
        location: { lng: c[0], lat: c[1] },
        heading: num(r.compass_angle),
        sequenceId: r.sequence,
        panoramic: Boolean(r.is_pano),
      },
      target,
    );
    if (item) out.push(item);
  }
  return out;
}
export function mapillary(token: string | undefined): MediaProvider {
  return {
    id: "mapillary",
    async search(q, fetcher) {
      if (!token) return { status: "unavailable", reason: "not_configured" };
      // ~0.0015 degrees is a bounded box of roughly 150 m.
      const d = Math.min(0.003, q.radiusMeters / 111_000);
      const bbox = [
        q.point.lng - d,
        q.point.lat - d,
        q.point.lng + d,
        q.point.lat + d,
      ].join(",");
      const url = `https://graph.mapillary.com/images?${new URLSearchParams({
        bbox,
        limit: String(q.limit),
        fields:
          "id,captured_at,compass_angle,is_pano,sequence,thumb_1024_url,thumb_256_url,geometry,creator",
      })}`;
      const r = await getJson<{ data?: Row[] }>(url, {
        allowHosts: ["graph.mapillary.com"],
        timeoutMs: 5000,
        fetcher,
        headers: { Authorization: `OAuth ${token}` },
      });
      if (r.status !== "available") return r;
      if (!Array.isArray(r.data?.data))
        return { status: "unavailable", reason: "invalid_response" };
      return { status: "available", data: parseMapillary(r.data, q.point) };
    },
  };
}
