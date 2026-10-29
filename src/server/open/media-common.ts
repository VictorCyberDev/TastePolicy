import { haversineMeters, validPoint } from "./http";
import type { GeoPoint, MediaRelation, PlaceMediaItem } from "./types";

// Image hosts the experience may load directly. Anything else is dropped.
export const IMAGE_HOSTS = [
  "cdn.kartaview.org",
  "storage1.openstreetcam.org",
  "storage2.openstreetcam.org",
  "storage3.openstreetcam.org",
  "storage4.openstreetcam.org",
  "storage5.openstreetcam.org",
  "storage6.openstreetcam.org",
  "storage7.openstreetcam.org",
  "storage8.openstreetcam.org",
  "storage9.openstreetcam.org",
  "panoramax-storage-public-fast.s3.gra.perf.cloud.ovh.net",
  "upload.wikimedia.org",
  "thumb.wikimedia.org",
  "images.mapillary.com",
  "scontent.xx.fbcdn.net",
] as const;
export function safeImage(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    if (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (IMAGE_HOSTS as readonly string[]).includes(u.hostname)
    )
      return u.href;
    // Provider CDNs on storage subdomains follow a fixed pattern.
    if (
      u.protocol === "https:" &&
      /^storage\d+\.openstreetcam\.org$/.test(u.hostname)
    )
      return u.href;
    if (
      u.protocol === "https:" &&
      /\.fbcdn\.net$/.test(u.hostname) &&
      url.includes("mapillary")
    )
      return u.href;
  } catch {
    /* fall through */
  }
  return null;
}
export function safeLanding(url: unknown, hosts: string[]): string | undefined {
  try {
    const u = new URL(String(url));
    return u.protocol === "https:" && hosts.includes(u.hostname)
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}

// Distance never proves identity. Within 60 m the picture is "near" the place;
// out to 250 m it is the surrounding area; beyond that it is not shown.
export const NEAR_METERS = 60;
export const AREA_METERS = 250;
export function relationForDistance(m: number): MediaRelation | null {
  return m <= NEAR_METERS
    ? "NEARBY_STREET"
    : m <= AREA_METERS
      ? "AREA_CONTEXT"
      : null;
}
export function placeItem(
  item: Omit<PlaceMediaItem, "distanceMeters" | "relation" | "confidence">,
  target: GeoPoint,
): PlaceMediaItem | null {
  if (!item.location || !validPoint(item.location)) return null;
  const d = haversineMeters(target, item.location);
  const relation = relationForDistance(d);
  if (!relation) return null;
  return {
    ...item,
    distanceMeters: Math.round(d),
    relation,
    // Confidence in the *relationship*: modest and never above "near".
    confidence: relation === "NEARBY_STREET" ? 0.5 : 0.25,
  };
}
export const num = (v: unknown) => {
  const n = typeof v === "string" || typeof v === "number" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
