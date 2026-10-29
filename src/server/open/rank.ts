import { haversineMeters } from "./http";
import type { PlaceMediaItem } from "./types";

const REL_RANK = {
  EXACT_POI: 0,
  NEARBY_STREET: 1,
  AREA_CONTEXT: 2,
  ILLUSTRATIVE: 3,
} as const;
const angle = (a?: number, b?: number) =>
  a === undefined || b === undefined
    ? 180
    : Math.abs(((a - b + 540) % 360) - 180);

// A short, useful gallery rather than every frame a provider returned: exact
// first, then the closest context, newest first among equals, with near
// duplicates (same place, same direction) removed and far pictures kept few.
export function rankGallery(
  items: PlaceMediaItem[],
  max = 8,
): PlaceMediaItem[] {
  // 360° captures are explored in "Look around", not shown as flat pictures.
  const sorted = items
    .filter((i) => !i.panoramic)
    .sort(
      (a, b) =>
        REL_RANK[a.relation] - REL_RANK[b.relation] ||
        Math.floor((a.distanceMeters ?? 0) / 20) -
          Math.floor((b.distanceMeters ?? 0) / 20) ||
        (b.capturedAt ?? "").localeCompare(a.capturedAt ?? "") ||
        (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0),
    );
  const out: PlaceMediaItem[] = [];
  let area = 0;
  for (const it of sorted) {
    if (out.length >= max) break;
    if (it.relation === "AREA_CONTEXT" && area >= 3) continue;
    const dup = out.some(
      (o) =>
        (o.provider === it.provider && o.providerId === it.providerId) ||
        (o.location &&
          it.location &&
          haversineMeters(o.location, it.location) < 12 &&
          angle(o.heading, it.heading) < 25),
    );
    if (dup) continue;
    if (it.relation === "AREA_CONTEXT") area++;
    out.push(it);
  }
  return out;
}

export interface Sequence {
  provider: PlaceMediaItem["provider"];
  sequenceId: string;
  frames: PlaceMediaItem[];
}
// "See the approach": consecutive frames of ONE real capture sequence near the
// destination, in capture order, thinned to a handful. Requires at least three
// frames spanning real distance, otherwise there is no approach to show.
export function buildSequence(
  items: PlaceMediaItem[],
  max = 8,
): Sequence | null {
  const groups = new Map<string, PlaceMediaItem[]>();
  for (const i of items) {
    if (!i.sequenceId || i.sequenceIndex === undefined || i.panoramic) continue;
    const k = `${i.provider}:${i.sequenceId}`;
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  let best: {
    key: string;
    frames: PlaceMediaItem[];
    nearest: number;
    span: number;
  } | null = null;
  for (const [key, frames] of groups) {
    frames.sort(
      (a, b) => (a.sequenceIndex as number) - (b.sequenceIndex as number),
    );
    if (frames.length < 3) continue;
    const locs = frames.filter((f) => f.location);
    if (locs.length < 3) continue;
    const span = haversineMeters(
      locs[0].location!,
      locs[locs.length - 1].location!,
    );
    if (span < 25) continue;
    const nearest = Math.min(...frames.map((f) => f.distanceMeters ?? 1e9));
    if (
      !best ||
      nearest < best.nearest ||
      (nearest === best.nearest && frames.length > best.frames.length)
    )
      best = { key, frames, nearest, span };
  }
  if (!best) return null;
  const f = best.frames;
  const picked: PlaceMediaItem[] = [];
  const n = Math.min(max, f.length);
  for (let i = 0; i < n; i++) {
    const frame = f[Math.round((i * (f.length - 1)) / Math.max(1, n - 1))];
    if (!picked.includes(frame)) picked.push(frame);
  }
  if (picked.length < 3) return null;
  const [provider, ...rest] = best.key.split(":");
  return {
    provider: provider as Sequence["provider"],
    sequenceId: rest.join(":"),
    frames: picked,
  };
}
