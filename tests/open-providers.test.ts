// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { clearOpenCache, setNominatimGap } from "@/server/open/http";
import {
  kartaView,
  parseKartaView,
  kartaViewSequenceWindow,
} from "@/server/open/kartaview";
import { panoramax, parsePanoramax } from "@/server/open/panoramax";
import { mapillary, parseMapillary } from "@/server/open/mapillary";
import {
  geocodeCandidate,
  queryVariants,
  toIdentity,
} from "@/server/open/nominatim";
import { factsFromTags, overpassTags } from "@/server/open/osm-facts";
import { openRoute, parseRoute } from "@/server/open/openrouteservice";
import {
  commonsFileFor,
  exactImage,
  wikidataImage,
} from "@/server/open/exact-image";
import { buildSequence, rankGallery } from "@/server/open/rank";
import {
  placeItem,
  relationForDistance,
  safeImage,
} from "@/server/open/media-common";
import { resolveOpenPlace } from "@/server/open/context";
import { contextRequirementReport } from "@/server/state/policy";
import type { PlaceMediaItem } from "@/server/open/types";

const fx = (n: string) =>
  JSON.parse(readFileSync(resolve(__dirname, "fixtures/open", n), "utf8")).body;
const kv = fx("kartaview-nyc.json"),
  px = fx("panoramax-paris.json"),
  nomA = fx("nominatim-algonquin.json"),
  nomM = fx("nominatim-melodys.json"),
  commons = fx("commons-algonquin.json"),
  wikidata = fx("wikidata-algonquin-p18.json");
const algonquin = {
  name: "The Algonquin Hotel Times Square, Autograph Collection",
  address: "59 W 44th St New York, NY 10036",
  type: "place" as const,
};
const target = { lat: 40.7559397, lng: -73.9823473 };
const now = "2026-10-29T12:00:00.000Z";

// A scripted network: first matching prefix answers; everything else 404s.
const net = (routes: [string, unknown | (() => Response)][]) =>
  (async (url: string | URL | Request) => {
    const u = String(url);
    for (const [prefix, body] of routes)
      if (u.startsWith(prefix))
        return typeof body === "function"
          ? (body as () => Response)()
          : Response.json(body);
    return new Response("nope", { status: 404 });
  }) as unknown as typeof fetch;
const boom = (name: string) => () => {
  throw Object.assign(new Error(name), { name });
};

beforeEach(() => {
  clearOpenCache();
  setNominatimGap(0);
});

describe("media relationship (M25.9)", () => {
  it("distance can only make a picture NEARBY or AREA, never EXACT", () => {
    expect(relationForDistance(0)).toBe("NEARBY_STREET");
    expect(relationForDistance(60)).toBe("NEARBY_STREET");
    expect(relationForDistance(61)).toBe("AREA_CONTEXT");
    expect(relationForDistance(250)).toBe("AREA_CONTEXT");
    expect(relationForDistance(251)).toBeNull();
    const base = {
      provider: "kartaview" as const,
      providerId: "1",
      mediaType: "photo" as const,
      url: "u",
      thumbUrl: "t",
      attribution: "a",
      panoramic: false,
      location: { lat: target.lat, lng: target.lng },
    };
    expect(placeItem(base, target)?.relation).toBe("NEARBY_STREET");
    expect(
      placeItem({ ...base, location: { lat: 40.9, lng: -73.9 } }, target),
    ).toBeNull();
    expect(placeItem({ ...base, location: undefined }, target)).toBeNull();
  });
  it("only a map-linked, license-validated Commons image is EXACT_POI", async () => {
    const f = net([["https://commons.wikimedia.org/", commons]]);
    const r = await exactImage("File:W 44 St Sep 2021 01.jpg", f);
    expect(r.status === "available" && r.data).toMatchObject({
      relation: "EXACT_POI",
      license: "CC BY-SA 4.0",
      author: "Epicgenius",
      capturedAt: "2021-09-23",
    });
    // No license, or no author: not shown.
    const bad = structuredClone(commons);
    type Meta = Record<string, { value: string }>;
    const meta = (
      Object.values(bad.query.pages)[0] as {
        imageinfo: { extmetadata: Meta }[];
      }
    ).imageinfo[0].extmetadata;
    meta.LicenseShortName.value = "All rights reserved";
    clearOpenCache();
    const r2 = await exactImage(
      "File:W 44 St Sep 2021 01.jpg",
      net([["https://commons.wikimedia.org/", bad]]),
    );
    expect(r2.status === "available" && r2.data).toBeNull();
    expect(commonsFileFor({ wikimedia_commons: "File:A b.jpg" })).toBe(
      "File:A b.jpg",
    );
    expect(commonsFileFor({ wikimedia_commons: "Category:Hotels" })).toBeNull();
    expect(commonsFileFor({}, "X y.jpg")).toBe("File:X y.jpg");
    expect(commonsFileFor({})).toBeNull();
    const w = await wikidataImage(
      "Q689447",
      net([["https://www.wikidata.org/", wikidata]]),
    );
    expect(w).toEqual({ status: "available", data: "W 44 St Sep 2021 01.jpg" });
    expect((await wikidataImage("not-a-qid")).status).toBe("unavailable");
  });
  it("only allowlisted image hosts are ever shown", () => {
    expect(safeImage("https://cdn.kartaview.org/pr:sharp/abc")).toBeTruthy();
    expect(
      safeImage("https://storage9.openstreetcam.org/files/x.jpg"),
    ).toBeTruthy();
    expect(safeImage("http://cdn.kartaview.org/x")).toBeNull();
    expect(safeImage("https://evil.example/x.jpg")).toBeNull();
    expect(safeImage("https://user:pw@cdn.kartaview.org/x")).toBeNull();
    expect(safeImage(42)).toBeNull();
  });
});

describe("KartaView adapter (recorded live response)", () => {
  it("parses real frames with attribution, license, dates and blurred renditions", () => {
    const items = parseKartaView(kv, target);
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) {
      expect(i.provider).toBe("kartaview");
      expect(i.attribution).toBe("© KartaView contributors");
      expect(i.license).toBe("CC BY-SA 4.0");
      expect(i.url).toMatch(/^https:\/\/cdn\.kartaview\.org\//);
      expect(i.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["NEARBY_STREET", "AREA_CONTEXT"]).toContain(i.relation);
      expect(i.relation).not.toBe("EXACT_POI");
    }
    // The recorded frames include a real 360° capture, flagged from the
    // provider's own projection field; the ordinary frames are not.
    expect(items.filter((i) => i.panoramic).map((i) => i.providerId)).toEqual([
      "2481404617",
    ]);
  });
  it("uses the light 1280px rendition for photos and the full file only for 360 captures", () => {
    const rows = kv.result.data as {
      id: string;
      projection: string;
      imageLthUrl: string;
      imageProcUrl: string;
    }[];
    for (const i of parseKartaView(kv, target)) {
      const row = rows.find((r) => r.id === i.providerId)!;
      expect(i.url).toBe(
        row.projection === "SPHERE" ? row.imageProcUrl : row.imageLthUrl,
      );
    }
  });
  it("handles valid, empty, malformed, timeout and HTTP-error answers", async () => {
    const q = { point: target, radiusMeters: 250, limit: 50 };
    const ok = await kartaView.search(
      q,
      net([["https://api.kartaview.org/", kv]]),
    );
    expect(ok.status === "available" && ok.data.length).toBeGreaterThan(0);
    const none = await kartaView.search(
      q,
      net([["https://api.kartaview.org/", { result: { data: [] } }]]),
    );
    expect(none).toEqual({ status: "available", data: [] });
    const bad = await kartaView.search(
      q,
      net([["https://api.kartaview.org/", { nope: true }]]),
    );
    expect(bad).toEqual({ status: "unavailable", reason: "invalid_response" });
    const slow = await kartaView.search(
      q,
      net([["https://api.kartaview.org/", boom("TimeoutError")]]),
    );
    expect(slow).toEqual({ status: "unavailable", reason: "timeout" });
    const http = await kartaView.search(
      q,
      net([
        [
          "https://api.kartaview.org/",
          () => new Response("x", { status: 503 }),
        ],
      ]),
    );
    expect(http).toEqual({ status: "unavailable", reason: "provider_error" });
  });
  it("marks SPHERE projection as panoramic and drops non-public frames", () => {
    const row = structuredClone(kv.result.data[0]);
    const sphere = parseKartaView(
      { result: { data: [{ ...row, projection: "SPHERE" }] } },
      { lat: Number(row.lat), lng: Number(row.lng) },
    );
    expect(sphere[0]).toMatchObject({ panoramic: true, mediaType: "panorama" });
    expect(
      parseKartaView(
        { result: { data: [{ ...row, visibility: "private" }] } },
        target,
      ),
    ).toEqual([]);
  });
  it("reads a sequence window and rejects hostile sequence ids", async () => {
    const rows = kv.result.data;
    const f = net([["https://api.kartaview.org/", { result: { data: rows } }]]);
    expect(
      (await kartaViewSequenceWindow("1280753", 4089, target, f)).length,
    ).toBeGreaterThan(0);
    expect(await kartaViewSequenceWindow("1;drop", 4, target, f)).toEqual([]);
  });
});

describe("Panoramax adapter (recorded live response)", () => {
  it("parses licensed pictures and orders each sequence by capture time", () => {
    const items = parsePanoramax(px, { lat: 48.8603, lng: 2.3001 });
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) {
      expect(i.license).toBeTruthy();
      expect(i.attribution).toMatch(/^© Panoramax contributors/);
      expect(i.url).toMatch(/^https:\/\/panoramax-storage/);
      expect(i.viewerUrl).toMatch(/^https:\/\/api\.panoramax\.xyz\//);
    }
    const bySeq = items.filter((i) => i.sequenceId === items[0].sequenceId);
    expect(bySeq.map((i) => i.sequenceIndex)).toEqual(bySeq.map((_, n) => n));
  });
  it("drops pictures without a license and flags 360 only on explicit metadata", () => {
    const f = structuredClone(px.features[0]);
    const here = {
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    };
    delete f.properties.license;
    expect(parsePanoramax({ features: [f] }, here)).toEqual([]);
    const f2 = structuredClone(px.features[0]);
    f2.properties["pers:interior_orientation"] = { field_of_view: 360 };
    expect(parsePanoramax({ features: [f2] }, here)[0]).toMatchObject({
      panoramic: true,
      mediaType: "panorama",
    });
    expect(
      parsePanoramax({ features: [px.features[0]] }, here)[0].panoramic,
    ).toBe(false);
  });
  it("degrades on empty, malformed and failing answers", async () => {
    const q = { point: { lat: 48.86, lng: 2.3 }, radiusMeters: 150, limit: 30 };
    expect(
      await panoramax.search(
        q,
        net([["https://api.panoramax.xyz/", { features: [] }]]),
      ),
    ).toEqual({ status: "available", data: [] });
    expect(
      await panoramax.search(
        q,
        net([["https://api.panoramax.xyz/", { x: 1 }]]),
      ),
    ).toEqual({ status: "unavailable", reason: "invalid_response" });
    expect(
      await panoramax.search(
        q,
        net([
          [
            "https://api.panoramax.xyz/",
            () => new Response("x", { status: 500 }),
          ],
        ]),
      ),
    ).toEqual({ status: "unavailable", reason: "provider_error" });
  });
});

describe("optional Mapillary", () => {
  it("is skipped without a token and never called", async () => {
    let called = false;
    const f = (async () => (
      (called = true),
      new Response("{}")
    )) as unknown as typeof fetch;
    const r = await mapillary(undefined).search(
      { point: target, radiusMeters: 100, limit: 5 },
      f,
    );
    expect(r).toEqual({ status: "unavailable", reason: "not_configured" });
    expect(called).toBe(false);
  });
  it("parses a token-authenticated response and sends the token only as a header", async () => {
    let seen: { url: string; auth?: string } | undefined;
    const f = (async (url: string, init: RequestInit) => {
      seen = {
        url: String(url),
        auth: (init.headers as Record<string, string>).Authorization,
      };
      return Response.json({
        data: [
          {
            id: "9",
            captured_at: 1_600_000_000_000,
            compass_angle: 12,
            is_pano: false,
            sequence: "s",
            thumb_1024_url: "https://images.mapillary.com/a.jpg",
            thumb_256_url: "https://images.mapillary.com/b.jpg",
            geometry: { coordinates: [target.lng, target.lat] },
            creator: { username: "pat" },
          },
        ],
      });
    }) as unknown as typeof fetch;
    const r = await mapillary("SECRET").search(
      { point: target, radiusMeters: 100, limit: 5 },
      f,
    );
    expect(r.status === "available" && r.data[0]).toMatchObject({
      provider: "mapillary",
      author: "pat",
      license: "CC BY-SA 4.0",
    });
    expect(seen!.url).not.toContain("SECRET");
    expect(seen!.auth).toBe("OAuth SECRET");
    expect(parseMapillary({ data: [{ id: "1" }] }, target)).toEqual([]);
  });
});

describe("Nominatim identity", () => {
  it("matches the real Algonquin row and carries only allowlisted tags", () => {
    const id = toIdentity(algonquin, nomA);
    expect(id).toMatchObject({
      status: "matched",
      osm: { type: "way", id: 266170533 },
    });
    expect(id.confidence).toBeGreaterThan(0.9);
    expect(id.tags).toMatchObject({ wheelchair: "yes", wikidata: "Q689447" });
    expect(Object.keys(id.tags ?? {})).not.toContain("email");
    expect(Object.keys(id.tags ?? {})).not.toContain("phone");
  });
  it("refuses ambiguous or wrong places instead of guessing", () => {
    expect(
      toIdentity(
        {
          name: "Melody’s Piano Bar",
          address: "1020 Lexington Ave New York, NY 10021",
          type: "place",
        },
        nomM,
      ).status,
    ).toBe("matched");
    expect(
      toIdentity(
        {
          name: "Totally Different Bistro",
          address: "1 Main St",
          type: "place",
        },
        nomM,
      ).status,
    ).not.toBe("matched");
    const twin = [
      nomM[0],
      { ...nomM[0], osm_id: 1, lat: "40.8", lon: "-73.9" },
    ];
    expect(
      toIdentity({ name: "Melody’s Piano Bar", type: "place" }, twin).status,
    ).toBe("ambiguous");
    expect(toIdentity(algonquin, []).status).toBe("no_match");
  });
  it("builds at most three bounded query variants", () => {
    const v = queryVariants(algonquin);
    expect(v.length).toBeLessThanOrEqual(3);
    expect(v).toContain("Algonquin Hotel New York");
    expect(queryVariants({ name: "Cafe", address: undefined })).toEqual([
      "Cafe",
    ]);
  });
  it("falls through looser queries and reports provider failure honestly", async () => {
    const calls: string[] = [];
    const f = (async (url: string) => {
      calls.push(url);
      return Response.json(
        new URL(url).searchParams.get("q") === "Algonquin Hotel New York"
          ? nomA
          : [],
      );
    }) as unknown as typeof fetch;
    const r = await geocodeCandidate(algonquin, f);
    expect(r.status === "available" && r.data.status).toBe("matched");
    expect(calls.length).toBe(2);
    expect(
      calls.every((c) =>
        c.startsWith("https://nominatim.openstreetmap.org/search?"),
      ),
    ).toBe(true);
    clearOpenCache();
    const down = await geocodeCandidate(
      algonquin,
      net([
        [
          "https://nominatim.openstreetmap.org/",
          () => new Response("x", { status: 429 }),
        ],
      ]),
    );
    expect(down).toEqual({ status: "unavailable", reason: "provider_error" });
  });
});

describe("caching respects free public infrastructure", () => {
  it("asks Nominatim once for the same candidate within the cache window", async () => {
    let calls = 0;
    const f = (async () => {
      calls++;
      return Response.json(nomA);
    }) as unknown as typeof fetch;
    const a = await geocodeCandidate(algonquin, f);
    const b = await geocodeCandidate(algonquin, f);
    expect(a.status === "available" && b.status === "available").toBe(true);
    expect(calls).toBe(1);
  });
  it("does not cache a failure, so a transient outage cannot stick", async () => {
    let calls = 0;
    const f = (async () => {
      calls++;
      return new Response("x", { status: 503 });
    }) as unknown as typeof fetch;
    await geocodeCandidate(algonquin, f);
    await geocodeCandidate(algonquin, f);
    expect(calls).toBe(2);
  });
});

describe("OSM facts: explicit tags only, absence is unknown (M25.3)", () => {
  it("maps explicit wheelchair tags with a not-verified note", () => {
    const yes = factsFromTags({ wheelchair: "yes" }, now);
    expect(yes.facts[0]).toMatchObject({
      key: "accessible_entrance",
      value: true,
      source: "openstreetmap",
      sourceType: "PLACE_PROVIDER",
    });
    expect(yes.facts[0].note).toMatch(/not independently verified/);
    expect(factsFromTags({ wheelchair: "no" }, now).facts[0].value).toBe(false);
    expect(
      factsFromTags({ "toilets:wheelchair": "yes" }, now).facts[0],
    ).toMatchObject({ key: "accessible_restroom", value: true });
  });
  it("never turns a missing or partial tag into a fact", () => {
    for (const tags of [
      {},
      undefined,
      { wheelchair: "limited" },
      { wheelchair: "unknown" },
      { name: "x" },
    ]) {
      const r = factsFromTags(tags as Record<string, string> | undefined, now);
      expect(r.facts).toEqual([]);
      expect(r.silentKeys).toContain("accessible_entrance");
    }
  });
  it("leaves a hard entrance requirement unknown (so it ASKs) when OSM is silent", () => {
    const req = [
      {
        key: "accessible_entrance",
        operator: "eq" as const,
        expected: true,
        importance: "hard" as const,
        sourceRequirement: "USER" as const,
      },
    ];
    const ctx = (facts: ReturnType<typeof factsFromTags>["facts"]) => ({
      key: "k",
      domain: "place" as const,
      requirements: req,
      facts,
    });
    expect(
      contextRequirementReport(ctx(factsFromTags({}, now).facts), now)
        ?.hardUnknown,
    ).toEqual(["accessible_entrance"]);
    expect(
      contextRequirementReport(
        ctx(factsFromTags({ wheelchair: "limited" }, now).facts),
        now,
      )?.hardUnknown,
    ).toEqual(["accessible_entrance"]);
    expect(
      contextRequirementReport(
        ctx(factsFromTags({ wheelchair: "no" }, now).facts),
        now,
      )?.hardViolated,
    ).toEqual(["accessible_entrance"]);
    expect(
      contextRequirementReport(
        ctx(factsFromTags({ wheelchair: "yes" }, now).facts),
        now,
      )?.hardViolated,
    ).toEqual([]);
  });
  it("reads fresh Overpass tags for one element, bounded and validated", async () => {
    const f = net([
      [
        "https://overpass-api.de/",
        { elements: [{ type: "way", id: 1, tags: { wheelchair: "no" } }] },
      ],
    ]);
    expect(await overpassTags({ type: "way", id: 266170533 }, f)).toEqual({
      status: "available",
      data: { wheelchair: "no" },
    });
    expect((await overpassTags({ type: "way", id: -1 })).status).toBe(
      "unavailable",
    );
    clearOpenCache();
    expect(
      await overpassTags(
        { type: "node", id: 5 },
        net([["https://overpass-api.de/", boom("TimeoutError")]]),
      ),
    ).toEqual({ status: "unavailable", reason: "timeout" });
    clearOpenCache();
    expect(
      await overpassTags(
        { type: "node", id: 6 },
        net([["https://overpass-api.de/", { elements: [] }]]),
      ),
    ).toEqual({ status: "unavailable", reason: "invalid_response" });
  });
});

describe("openrouteservice / HeiGIT (contract fixture, not a live call)", () => {
  const body = {
    features: [
      {
        properties: { summary: { distance: 640.4, duration: 497.2 } },
        geometry: {
          type: "LineString",
          coordinates: [
            [-73.99, 40.73],
            [-73.988, 40.735],
            [-73.985, 40.74],
          ],
        },
      },
    ],
  };
  it("is optional: no key means no route and no request", async () => {
    let called = false;
    const f = (async () => (
      (called = true),
      new Response("{}")
    )) as unknown as typeof fetch;
    expect(
      await openRoute(
        { from: target, to: { lat: 40.76, lng: -73.98 } },
        undefined,
        f,
      ),
    ).toEqual({ status: "unavailable", reason: "not_configured" });
    expect(called).toBe(false);
  });
  it("calls the current api.heigit.org endpoint with the key only in a header", async () => {
    let seen: { url: string; auth: string; body: string } | undefined;
    const f = (async (url: string, init: RequestInit) => {
      seen = {
        url,
        auth: (init.headers as Record<string, string>).Authorization,
        body: String(init.body),
      };
      return Response.json(body);
    }) as unknown as typeof fetch;
    const r = await openRoute(
      { from: { lat: 40.73, lng: -73.99 }, to: { lat: 40.74, lng: -73.985 } },
      "KEY123",
      f,
    );
    expect(r.status === "available" && r.data).toMatchObject({
      minutes: 8,
      meters: 640,
      profile: "foot-walking",
    });
    expect(seen!.url).toBe(
      "https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson",
    );
    expect(seen!.url).not.toContain("openrouteservice.org");
    expect(seen!.url).not.toContain("KEY123");
    expect(seen!.auth).toBe("KEY123");
    expect(JSON.parse(seen!.body).coordinates[0]).toEqual([-73.99, 40.73]);
  });
  it("rejects malformed geometry, bad coordinates and provider errors", async () => {
    expect(parseRoute({ features: [] }, "foot-walking")).toBeNull();
    expect(
      parseRoute(
        {
          features: [
            {
              properties: { summary: { distance: 1, duration: 1 } },
              geometry: { type: "Point", coordinates: [] },
            },
          ],
        },
        "foot-walking",
      ),
    ).toBeNull();
    expect(
      parseRoute(
        {
          features: [
            {
              properties: { summary: { distance: 1, duration: 1 } },
              geometry: {
                type: "LineString",
                coordinates: [
                  [500, 200],
                  [1, 1],
                ],
              },
            },
          ],
        },
        "foot-walking",
      ),
    ).toBeNull();
    expect(
      (await openRoute({ from: { lat: 99, lng: 0 }, to: target }, "k")).status,
    ).toBe("unavailable");
    const f = net([
      ["https://api.heigit.org/", () => new Response("x", { status: 403 })],
    ]);
    expect(
      await openRoute(
        { from: target, to: { lat: 40.76, lng: -73.98 } },
        "k",
        f,
      ),
    ).toEqual({ status: "unavailable", reason: "provider_error" });
  });
});

const mk = (over: Partial<PlaceMediaItem>): PlaceMediaItem => ({
  provider: "kartaview",
  providerId: Math.random().toString(36),
  mediaType: "photo",
  url: "u",
  thumbUrl: "t",
  attribution: "a",
  panoramic: false,
  relation: "NEARBY_STREET",
  confidence: 0.5,
  distanceMeters: 10,
  location: { lat: 40.7559, lng: -73.9823 },
  heading: 10,
  ...over,
});
describe("gallery and sequence selection", () => {
  it("puts EXACT first, removes near-duplicates and caps far context", () => {
    const items = [
      mk({
        providerId: "a",
        distanceMeters: 5,
        location: { lat: 40.7559, lng: -73.9823 },
        heading: 10,
      }),
      mk({
        providerId: "dup",
        distanceMeters: 6,
        location: { lat: 40.75591, lng: -73.9823 },
        heading: 15,
      }),
      mk({
        providerId: "b",
        distanceMeters: 30,
        location: { lat: 40.7562, lng: -73.9823 },
        heading: 200,
      }),
      ...[0, 1, 2, 3, 4].map((n) =>
        mk({
          providerId: `area${n}`,
          relation: "AREA_CONTEXT",
          distanceMeters: 100 + n,
          location: { lat: 40.757 + n * 0.001, lng: -73.98 },
          heading: n * 70,
        }),
      ),
      mk({
        providerId: "exact",
        provider: "wikimedia-commons",
        relation: "EXACT_POI",
        distanceMeters: undefined,
        location: undefined,
      }),
    ];
    const g = rankGallery(items);
    expect(g[0].relation).toBe("EXACT_POI");
    expect(g.map((i) => i.providerId)).not.toContain("dup");
    expect(
      g.filter((i) => i.relation === "AREA_CONTEXT").length,
    ).toBeLessThanOrEqual(3);
    expect(g.length).toBeLessThanOrEqual(8);
  });
  it("keeps panoramic captures out of the flat gallery", () => {
    const g = rankGallery([
      mk({ providerId: "p", panoramic: true, mediaType: "panorama" }),
      mk({ providerId: "q" }),
    ]);
    expect(g.map((i) => i.providerId)).toEqual(["q"]);
  });
  it("builds an approach only from one real sequence with 3+ frames and real span", () => {
    const frames = Array.from({ length: 30 }, (_, n) =>
      mk({
        providerId: `f${n}`,
        sequenceId: "S",
        sequenceIndex: 100 + n,
        distanceMeters: 100 - n * 3,
        location: { lat: 40.7559 + n * 0.00005, lng: -73.9823 },
      }),
    ).reverse();
    const seq = buildSequence(frames)!;
    expect(seq.frames.length).toBeLessThanOrEqual(8);
    expect(seq.frames.length).toBeGreaterThanOrEqual(3);
    const idx = seq.frames.map((f) => f.sequenceIndex!);
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(new Set(seq.frames.map((f) => f.sequenceId))).toEqual(
      new Set(["S"]),
    );
    expect(buildSequence(frames.slice(0, 2))).toBeNull();
    expect(
      buildSequence(frames.map((f) => ({ ...f, panoramic: true }))),
    ).toBeNull();
    // Three frames within a few metres are not an approach.
    expect(
      buildSequence(
        frames
          .slice(0, 3)
          .map((f) => ({ ...f, location: { lat: 40.7559, lng: -73.9823 } })),
      ),
    ).toBeNull();
  });
});

describe("resolveOpenPlace: provider independence and evidence isolation", () => {
  const all = (over: Record<string, unknown> = {}) =>
    net([
      ...(Object.entries(over) as [string, unknown][]),
      ["https://nominatim.openstreetmap.org/", nomA],
      [
        "https://overpass-api.de/",
        { elements: [{ tags: { wheelchair: "yes", wikidata: "Q689447" } }] },
      ],
      ["https://api.kartaview.org/", kv],
      ["https://api.panoramax.xyz/", { features: [] }],
      ["https://www.wikidata.org/", wikidata],
      ["https://commons.wikimedia.org/", commons],
    ]);
  const run = (f: typeof fetch, extra: Record<string, unknown> = {}) =>
    resolveOpenPlace(
      {
        entity: algonquin,
        origin: { lat: 40.7359, lng: -73.9911, label: "Home" },
      },
      { fetcher: f, now, ...extra },
    );

  it("places the candidate, returns an exact image plus nearby street frames, and no Google key is needed", async () => {
    const c = await run(all());
    expect(c.status).toBe("available");
    expect(c.place?.provider).toBe("openstreetmap");
    expect(c.open.media[0].relation).toBe("EXACT_POI");
    expect(
      c.open.media.some(
        (m) => m.provider === "kartaview" && m.relation !== "EXACT_POI",
      ),
    ).toBe(true);
    expect(c.open.panorama?.panoramic).toBe(true);
    expect(c.open.map?.center).toEqual(c.open.identity.location);
    expect(c.open.straightLineMeters).toBeGreaterThan(1000);
    expect(c.open.routeUnavailable).toBe("not_configured");
    expect(JSON.stringify(c)).not.toMatch(/email|phone/i);
  });
  it("derives facts only from explicit OSM tags and a routed time; pictures add none", async () => {
    const c = await run(all());
    expect(c.facts.map((f) => f.key)).toEqual(["accessible_entrance"]);
    expect(
      c.facts.every(
        (f) =>
          f.sourceType === "PLACE_PROVIDER" && f.source === "openstreetmap",
      ),
    ).toBe(true);
    expect(c.silentKeys).toEqual(
      expect.arrayContaining(["walking_minutes", "noise_level"]),
    );
    // Same pictures, silent map: no facts at all.
    const silent = await run(
      all({ "https://overpass-api.de/": { elements: [{ tags: {} }] } }),
      {},
    );
    clearOpenCache();
    const silent2 = await run(
      net([
        [
          "https://nominatim.openstreetmap.org/",
          [{ ...nomA[0], extratags: {} }],
        ],
        ["https://overpass-api.de/", { elements: [{ tags: {} }] }],
        ["https://api.kartaview.org/", kv],
      ]),
    );
    expect(silent.open.media.length).toBeGreaterThan(0);
    expect(silent2.facts).toEqual([]);
    expect(silent2.silentKeys).toContain("accessible_entrance");
    expect(silent2.open.media.length).toBeGreaterThan(0);
  });
  it("adds a routed walking time when a key is configured", async () => {
    const route = {
      features: [
        {
          properties: { summary: { distance: 900, duration: 780 } },
          geometry: {
            type: "LineString",
            coordinates: [
              [-73.9911, 40.7359],
              [-73.9823, 40.7559],
            ],
          },
        },
      ],
    };
    const c = await run(all({ "https://api.heigit.org/": route }), {
      heigitKey: "k",
    });
    expect(c.facts.find((f) => f.key === "walking_minutes")).toMatchObject({
      value: 13,
      source: "openrouteservice",
      unit: "min",
    });
    expect(c.open.route).toMatchObject({ minutes: 13, originLabel: "Home" });
    expect(c.silentKeys).not.toContain("walking_minutes");
  });
  it("one failing provider never fails the experience (KartaView, Panoramax, Overpass, Commons)", async () => {
    const f = all({
      "https://api.kartaview.org/": () => new Response("x", { status: 500 }),
      "https://api.panoramax.xyz/": boom("TimeoutError"),
      "https://overpass-api.de/": boom("TimeoutError"),
    });
    const c = await run(f);
    expect(c.status).toBe("available");
    // Falls back to Nominatim's own tags and the linked Commons image.
    expect(c.facts[0]).toMatchObject({
      key: "accessible_entrance",
      value: true,
    });
    expect(c.open.media.map((m) => m.relation)).toEqual(["EXACT_POI"]);
    expect(c.open.sources.find((s) => s.id === "kartaview")?.status).toBe(
      "unavailable",
    );
    expect(c.open.sources.find((s) => s.id === "panoramax")?.status).toBe(
      "unavailable",
    );
  });
  it("with every provider down the candidate simply has no media, facts stay unknown", async () => {
    const c = await run(net([]));
    expect(c.status).toBe("unavailable");
    expect(c.facts).toEqual([]);
    expect(c.open.media).toEqual([]);
    expect(c.open.routeUnavailable).toBe("no_destination");
  });
  it("an unmatched place gets no map, no media and no facts", async () => {
    const c = await resolveOpenPlace(
      {
        entity: {
          name: "Totally Different Bistro",
          address: "1 Main St",
          type: "place",
        },
      },
      {
        fetcher: net([
          ["https://nominatim.openstreetmap.org/", nomM],
          ["https://api.kartaview.org/", kv],
        ]),
        now,
      },
    );
    expect(c.status).toBe("unavailable");
    expect(c.reason).toBe("no_identity");
    expect(c.open.map).toBeUndefined();
    expect(c.open.media).toEqual([]);
    expect(c.facts).toEqual([]);
  });
});
