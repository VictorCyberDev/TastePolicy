// SYNTHETIC TEST DATA built from recorded real provider shapes. Network edges
// (images, OpenFreeMap) are intercepted; the UI and the open-place contract
// are the real ones.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Page } from "@playwright/test";
import { parseKartaView } from "../../src/server/open/kartaview";
import type { OpenPlaceContext } from "../../src/server/open/context";
import type { PlaceMediaItem } from "../../src/server/open/types";

const kv = JSON.parse(
  readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../fixtures/open/kartaview-nyc.json",
    ),
    "utf8",
  ),
).body;
const target = { lat: 40.7559397, lng: -73.9823473 };
const frames = parseKartaView(kv, target);
const plain = frames.filter((f) => !f.panoramic);
const sphere = frames.find((f) => f.panoramic) as PlaceMediaItem;

const exact: PlaceMediaItem = {
  provider: "wikimedia-commons",
  providerId: "File:W 44 St Sep 2021 01.jpg",
  mediaType: "photo",
  url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/W_44_St_Sep_2021_01.jpg/1280px-W_44_St_Sep_2021_01.jpg",
  thumbUrl:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/W_44_St_Sep_2021_01.jpg/1280px-W_44_St_Sep_2021_01.jpg",
  landingUrl: "https://commons.wikimedia.org/wiki/File:W_44_St_Sep_2021_01.jpg",
  author: "Epicgenius",
  attribution: "Epicgenius · Wikimedia Commons",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  capturedAt: "2021-09-23",
  panoramic: false,
  relation: "EXACT_POI",
  confidence: 0.9,
};
const seqFrames = Array.from({ length: 5 }, (_, n) => ({
  ...plain[n % plain.length],
  providerId: `seq-${n}`,
  sequenceId: "S1",
  sequenceIndex: 100 + n,
}));

export function openContext(
  over: Partial<OpenPlaceContext["open"]> = {},
  top: Partial<OpenPlaceContext> = {},
): OpenPlaceContext {
  return {
    status: "available",
    identity: { status: "matched", confidence: 0.96, margin: 0.9, reasons: [] },
    place: {
      provider: "openstreetmap",
      providerId: "way/266170533",
      name: "SYNTHETIC TEST DATA Jazz Cellar",
      address: "59, West 44th Street, Midtown, Manhattan, New York, 10036",
      location: target,
      types: ["tourism", "hotel"],
    },
    facts: [],
    silentKeys: ["accessible_entrance", "walking_minutes", "noise_level"],
    provenance: { requestedAt: "2026-10-29T00:00:00Z", sources: [] },
    open: {
      identity: {
        status: "matched",
        confidence: 0.96,
        margin: 0.9,
        reasons: [],
        displayName:
          "SYNTHETIC Jazz Cellar, 59, West 44th Street, Midtown, Manhattan Community Board 5, Manhattan, New York",
        location: target,
        osm: { type: "way", id: 266170533 },
      },
      map: { center: target, label: "SYNTHETIC TEST DATA Jazz Cellar" },
      media: [exact, ...plain.slice(0, 3)],
      sequence: { provider: "kartaview", sequenceId: "S1", frames: seqFrames },
      panorama: sphere,
      routeUnavailable: "not_configured",
      straightLineMeters: 2347,
      originLabel: "Margaret's home (demo location)",
      originPoint: { lat: 40.7359, lng: -73.9911 },
      sources: [
        { id: "nominatim", label: "OpenStreetMap place search", status: "ok" },
        {
          id: "kartaview",
          label: "KartaView street imagery",
          status: "ok",
          detail: "4",
        },
      ],
      ...over,
    },
    ...top,
  };
}
export const routeFixture = {
  provider: "openrouteservice" as const,
  profile: "foot-walking" as const,
  minutes: 13,
  meters: 900,
  originLabel: "Margaret's home (demo location)",
  geometry: [
    [-73.9911, 40.7359],
    [-73.989, 40.7405],
    [-73.9858, 40.7482],
    [-73.9823, 40.7559],
  ] as [number, number][],
};

const svg = (c: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="${c}"/></svg>`;
// Real image hosts and OpenFreeMap are never hit from tests.
export async function stubOpenNetwork(
  page: Page,
  opts: { style?: boolean } = {},
) {
  for (const [pattern, color] of [
    ["**/cdn.kartaview.org/**", "#7a8fb5"],
    ["**/upload.wikimedia.org/**", "#b58f7a"],
    ["**/thumb.wikimedia.org/**", "#b58f7a"],
  ] as const)
    await page.route(pattern, (r) =>
      r.fulfill({ contentType: "image/svg+xml", body: svg(color) }),
    );
  await page.route("**/tiles.openfreemap.org/**", (r) =>
    opts.style === false
      ? r.abort()
      : r.fulfill({
          contentType: "application/json",
          json: {
            version: 8,
            sources: {},
            layers: [
              {
                id: "background",
                type: "background",
                paint: { "background-color": "#fbf7ef" },
              },
            ],
          },
        }),
  );
}
