// @vitest-environment node
import { describe, it, expect } from "vitest";
import { bridgePlace } from "@/server/places/bridge";
import {
  parseGooglePlace,
  googlePlaceProvider,
  googleRouteProvider,
} from "@/server/places/google";
import { resolvePlaceContext } from "@/server/places/context";
import { parsePlaceContextBody } from "@/server/places/validation";
import type {
  PlaceProvider,
  ProviderPlace,
  RouteProvider,
} from "@/server/places/types";
import type { QlooEntity } from "@/types/domain";

const entity = (over: Partial<QlooEntity> = {}): QlooEntity => ({
  id: "e1",
  name: "Blue Note Jazz Club",
  type: "place",
  address: "131 W 3rd St, New York, NY",
  ...over,
});
const place = (over: Partial<ProviderPlace> = {}): ProviderPlace => ({
  provider: "google-places",
  providerId: "ChIJblue",
  name: "Blue Note Jazz Club",
  address: "131 W 3rd St, New York, NY 10012, USA",
  location: { lat: 40.7308, lng: -74.0007 },
  types: ["night_club"],
  photos: [],
  ...over,
});
const now = "2026-10-29T12:00:00.000Z";
const ok = (places: ProviderPlace[]): PlaceProvider => ({
  search: async () => ({ status: "available", places }),
});
const route: RouteProvider = {
  walk: async () => ({
    status: "available",
    route: {
      provider: "google-routes",
      mode: "WALK",
      minutes: 8,
      meters: 600,
      polyline: "abc",
    },
  }),
};

describe("place identity bridge", () => {
  it("matches the same place with strong name and address agreement", () => {
    const v = bridgePlace(entity(), [place()]);
    expect(v.status).toBe("matched");
    expect(v.confidence).toBeGreaterThan(0.9);
  });
  it("refuses a different business with an overlapping name", () => {
    const v = bridgePlace(entity(), [
      place({
        name: "Blue Note Hotel and Spa",
        address: "9 Elm Rd, Austin, TX",
      }),
    ]);
    expect(v.status).not.toBe("matched");
  });
  it("refuses two near-identical candidates instead of picking one", () => {
    const v = bridgePlace(entity(), [
      place(),
      place({
        providerId: "ChIJother",
        address: "131 W 3rd St, New York, NY 10012",
      }),
    ]);
    expect(v).toMatchObject({ status: "ambiguous" });
    expect(v.reasons).toContain("AMBIGUOUS_RUNNER_UP");
  });
  it("does not accept a short common name on name alone", () => {
    const v = bridgePlace(entity({ name: "Jazz", address: undefined }), [
      place({ name: "Jazz" }),
    ]);
    expect(v.status).not.toBe("matched");
  });
  it("only bridges places and handles an empty result", () => {
    expect(bridgePlace(entity({ type: "movie" }), [place()]).status).toBe(
      "no_match",
    );
    expect(bridgePlace(entity(), []).status).toBe("no_match");
  });
  it("is deterministic and accent/ampersand tolerant", () => {
    const a = bridgePlace(entity({ name: "Café Society & Bar" }), [
      place({ name: "Cafe Society and Bar" }),
    ]);
    expect(a.status).toBe("matched");
    expect(bridgePlace(entity(), [place()])).toEqual(
      bridgePlace(entity(), [place()]),
    );
  });
});

describe("place context", () => {
  it("attaches provider facts, photo proxy path and route only for a matched identity", async () => {
    const photo = {
      ref: "places/ChIJblue/photos/AbC_1",
      attributions: [{ displayName: "A Photographer" }],
    };
    const ctx = await resolvePlaceContext(
      {
        entity: entity(),
        origin: { lat: 40.73, lng: -73.99, label: "Margaret's home" },
      },
      ok([place({ wheelchairAccessibleEntrance: true, photos: [photo] })]),
      route,
      now,
    );
    expect(ctx.status).toBe("available");
    expect(ctx.photo?.src).toBe(
      "/api/places/photo?ref=places%2FChIJblue%2Fphotos%2FAbC_1",
    );
    expect(JSON.stringify(ctx)).not.toMatch(/key=|AIza/);
    expect(ctx.facts.map((f) => [f.key, f.value, f.sourceType])).toEqual([
      ["accessible_entrance", true, "PLACE_PROVIDER"],
      ["walking_minutes", 8, "PLACE_PROVIDER"],
    ]);
    expect(ctx.silentKeys).toContain("noise_level");
  });
  it("leaves facts unknown when the provider is silent", async () => {
    const ctx = await resolvePlaceContext(
      { entity: entity() },
      ok([place()]),
      route,
      now,
    );
    expect(ctx.facts).toEqual([]);
    expect(ctx.silentKeys).toEqual(
      expect.arrayContaining(["accessible_entrance", "walking_minutes"]),
    );
    expect(ctx.routeUnavailable).toBe("no_origin");
  });
  it("attaches nothing when identity is ambiguous", async () => {
    const ctx = await resolvePlaceContext(
      { entity: entity() },
      ok([
        place({ wheelchairAccessibleEntrance: true }),
        place({ providerId: "x", wheelchairAccessibleEntrance: false }),
      ]),
      route,
      now,
    );
    expect(ctx).toMatchObject({ status: "unavailable", reason: "no_identity" });
    expect(ctx.facts).toEqual([]);
    expect(ctx.photo).toBeUndefined();
  });
  it("reports an unconfigured provider truthfully", async () => {
    const ctx = await resolvePlaceContext(
      { entity: entity() },
      googlePlaceProvider(undefined),
      googleRouteProvider(undefined),
      now,
    );
    expect(ctx).toMatchObject({
      status: "unavailable",
      reason: "not_configured",
    });
  });
});

describe("google adapters (contract fixtures, not live evidence)", () => {
  const body = {
    places: [
      {
        id: "ChIJblue",
        displayName: { text: "Blue Note Jazz Club" },
        formattedAddress: "131 W 3rd St, New York, NY 10012, USA",
        location: { latitude: 40.7308, longitude: -74.0007 },
        types: ["night_club"],
        googleMapsUri: "https://maps.google.com/?cid=1",
        accessibilityOptions: { wheelchairAccessibleEntrance: false },
        photos: [
          {
            name: "places/ChIJblue/photos/AbC",
            widthPx: 4000,
            heightPx: 3000,
            authorAttributions: [
              { displayName: "Pat", uri: "https://maps.google.com/u/1" },
            ],
          },
          { name: "javascript:alert(1)" },
        ],
      },
    ],
  };
  it("parses places and drops malformed photo references", () => {
    const p = parseGooglePlace(body.places[0])!;
    expect(p.wheelchairAccessibleEntrance).toBe(false);
    expect(p.wheelchairAccessibleSeating).toBeUndefined();
    expect(p.photos).toHaveLength(1);
    expect(parseGooglePlace({ id: "x" })).toBeNull();
  });
  it("sends the key only as a server header and tolerates failures", async () => {
    let seen: RequestInit | undefined;
    const fetcher = (async (_u: string, init: RequestInit) => {
      seen = init;
      return new Response(JSON.stringify(body));
    }) as unknown as typeof fetch;
    const r = await googlePlaceProvider("K", fetcher).search({
      name: "Blue Note",
    });
    expect(r.status).toBe("available");
    expect((seen!.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe(
      "K",
    );
    expect(String(seen!.body)).not.toContain('K"');
    const bad = (async () =>
      new Response("no", { status: 500 })) as unknown as typeof fetch;
    expect(
      await googlePlaceProvider("K", bad).search({ name: "x" }),
    ).toMatchObject({
      status: "unavailable",
      reason: "provider_error",
    });
    const walk = (async () =>
      new Response(
        JSON.stringify({
          routes: [
            {
              duration: "540s",
              distanceMeters: 700,
              polyline: { encodedPolyline: "p" },
            },
          ],
        }),
      )) as unknown as typeof fetch;
    expect(
      await googleRouteProvider("K", walk).walk(
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
      ),
    ).toMatchObject({
      status: "available",
      route: { minutes: 9, meters: 700 },
    });
  });
  it("validates the context request body", () => {
    expect(
      parsePlaceContextBody(JSON.stringify({ name: "Blue Note" }))?.entity.name,
    ).toBe("Blue Note");
    expect(
      parsePlaceContextBody(JSON.stringify({ name: "x", extra: 1 })),
    ).toBeNull();
    expect(
      parsePlaceContextBody(
        JSON.stringify({ name: "x", origin: { lat: 200, lng: 0, label: "a" } }),
      ),
    ).toBeNull();
    expect(parsePlaceContextBody("not json")).toBeNull();
  });
});
