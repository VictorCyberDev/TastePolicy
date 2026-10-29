import { getJson } from "./http";
import { num, placeItem, safeImage } from "./media-common";
import type { MediaProvider, PlaceMediaItem } from "./types";

// KartaView (formerly OpenStreetCam). Public read API, no key. Imagery is
// contributor-licensed CC BY-SA 4.0; the processed ("proc") rendition has
// faces and plates blurred, so it is the one we show.
const API = "https://api.kartaview.org/2.0/photo/";
interface Row {
  id?: string;
  lat?: string;
  lng?: string;
  heading?: string;
  fieldOfView?: string;
  shotDate?: string;
  sequenceId?: string;
  sequenceIndex?: string;
  projection?: string;
  status?: string;
  visibility?: string;
  width?: string;
  height?: string;
  imageProcUrl?: string;
  imageThUrl?: string;
  imageLthUrl?: string;
  user?: { displayName?: string } | null;
}
export function parseKartaView(
  body: { result?: { data?: Row[] } },
  target: { lat: number; lng: number },
): PlaceMediaItem[] {
  const rows = body?.result?.data;
  if (!Array.isArray(rows)) return [];
  const out: PlaceMediaItem[] = [];
  for (const r of rows) {
    if (!r || r.status !== "active" || r.visibility !== "public") continue;
    const panoramicRow =
      r.projection === "SPHERE" || num(r.fieldOfView) === 360;
    // Ordinary frames use the 1280px rendition (~200 KB, faces/plates blurred);
    // a 360° capture needs the full-resolution panorama to be explorable.
    const url = safeImage(
        panoramicRow ? r.imageProcUrl : (r.imageLthUrl ?? r.imageProcUrl),
      ),
      thumb = safeImage(r.imageThUrl) ?? safeImage(r.imageLthUrl);
    const lat = num(r.lat),
      lng = num(r.lng);
    if (!url || !thumb || !r.id || lat === undefined || lng === undefined)
      continue;
    const panoramic = r.projection === "SPHERE" || num(r.fieldOfView) === 360;
    const item = placeItem(
      {
        provider: "kartaview",
        providerId: String(r.id),
        mediaType: panoramic ? "panorama" : "photo",
        url,
        thumbUrl: thumb,
        landingUrl:
          r.sequenceId && r.sequenceIndex
            ? `https://kartaview.org/details/${encodeURIComponent(r.sequenceId)}/${encodeURIComponent(r.sequenceIndex)}/track-info`
            : undefined,
        author: r.user?.displayName || undefined,
        attribution: "© KartaView contributors",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
        capturedAt: r.shotDate ? r.shotDate.slice(0, 10) : undefined,
        location: { lat, lng },
        heading: num(r.heading),
        fieldOfView: num(r.fieldOfView),
        sequenceId: r.sequenceId,
        sequenceIndex: num(r.sequenceIndex),
        width: num(r.width),
        height: num(r.height),
        panoramic,
      },
      target,
    );
    if (item) out.push(item);
  }
  return out;
}
export const kartaView: MediaProvider = {
  id: "kartaview",
  async search(q, fetcher) {
    const url = `${API}?${new URLSearchParams({
      lat: String(q.point.lat),
      lng: String(q.point.lng),
      radius: String(q.radiusMeters),
      itemsPerPage: String(q.limit),
      orderBy: "distance",
      orderDirection: "asc",
    })}`;
    const r = await getJson<{ result?: { data?: Row[] } }>(url, {
      allowHosts: ["api.kartaview.org"],
      timeoutMs: 5000,
      fetcher,
    });
    if (r.status !== "available") return r;
    if (!Array.isArray(r.data?.result?.data))
      return { status: "unavailable", reason: "invalid_response" };
    return { status: "available", data: parseKartaView(r.data, q.point) };
  },
};

// KartaView returns one frame per sequence near a point, so the "approach" is
// built by reading the window of the nearest sequence around that frame. Index
// numbering is dense, so a page of 100 frames covers the stretch of street.
export async function kartaViewSequenceWindow(
  sequenceId: string,
  nearIndex: number,
  target: { lat: number; lng: number },
  fetcher?: typeof fetch,
): Promise<PlaceMediaItem[]> {
  if (
    !/^\d{1,12}$/.test(sequenceId) ||
    !Number.isInteger(nearIndex) ||
    nearIndex < 0
  )
    return [];
  const url = `${API}?${new URLSearchParams({
    sequenceId,
    itemsPerPage: "100",
    page: String(Math.floor(nearIndex / 100) + 1),
  })}`;
  const r = await getJson<{ result?: { data?: Row[] } }>(url, {
    allowHosts: ["api.kartaview.org"],
    timeoutMs: 5000,
    fetcher,
  });
  return r.status === "available" ? parseKartaView(r.data, target) : [];
}
