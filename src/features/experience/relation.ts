import type { MediaRelation, PlaceMediaItem } from "@/server/open/types";

// Honest wording for how a picture relates to the place. Never upgraded.
export function relationLabel(
  relation: MediaRelation,
  place: string,
  area?: string,
): string {
  switch (relation) {
    case "EXACT_POI":
      return `Photo of ${place}`;
    case "NEARBY_STREET":
      return `Street view near ${place}`;
    case "AREA_CONTEXT":
      return area ? `Around ${area}` : `In the area around ${place}`;
    default:
      return "Taste illustration — not property photography";
  }
}

// "…, 59, West 44th Street, Midtown, Manhattan…" -> "Midtown": the part right
// after the street, when it is a name and not a number or an admin district.
export function areaFromDisplayName(display?: string): string | undefined {
  if (!display) return undefined;
  const parts = display.split(",").map((p) => p.trim());
  const street = parts.findIndex((p) =>
    /(street|avenue|road|boulevard|drive|lane|place|way|square|broadway|plaza)$/i.test(
      p,
    ),
  );
  const next = street >= 0 ? parts[street + 1] : undefined;
  return next &&
    !/\d/.test(next) &&
    !/community board|county|borough/i.test(next)
    ? next
    : undefined;
}

export const itemAlt = (i: PlaceMediaItem, place: string, area?: string) =>
  `${relationLabel(i.relation, place, area)}${i.capturedAt ? `, captured ${i.capturedAt}` : ""}`;
