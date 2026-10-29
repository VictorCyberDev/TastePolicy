import "server-only";
import type {
  PlaceProvider,
  PlacePhoto,
  ProviderPlace,
  RouteProvider,
} from "./types";

// Google Maps Platform, server-side only. The key never reaches a browser:
// the client receives place facts and a same-origin photo proxy path.
const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.types",
  "places.googleMapsUri",
  "places.accessibilityOptions",
  "places.currentOpeningHours.openNow",
  "places.priceLevel",
  "places.photos",
].join(",");

type Fetcher = typeof fetch;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);

export function parseGooglePlace(raw: unknown): ProviderPlace | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  const id = str(r.id),
    name = str((r.displayName as { text?: unknown } | undefined)?.text);
  if (!id || !name) return null;
  const loc = r.location as
    { latitude?: unknown; longitude?: unknown } | undefined;
  const acc = (r.accessibilityOptions ?? {}) as Record<string, unknown>;
  const photos: PlacePhoto[] = (Array.isArray(r.photos) ? r.photos : [])
    .slice(0, 6)
    .flatMap((p: Record<string, unknown>) => {
      const ref = str(p?.name);
      if (!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(ref))
        return [];
      return [
        {
          ref,
          widthPx: typeof p.widthPx === "number" ? p.widthPx : undefined,
          heightPx: typeof p.heightPx === "number" ? p.heightPx : undefined,
          attributions: (Array.isArray(p.authorAttributions)
            ? p.authorAttributions
            : []
          )
            .slice(0, 3)
            .map((a: Record<string, unknown>) => ({
              displayName: str(a?.displayName) || "Google Maps contributor",
              ...(str(a?.uri).startsWith("https://")
                ? { uri: str(a.uri) }
                : {}),
            })),
        },
      ];
    });
  return {
    provider: "google-places",
    providerId: id,
    name,
    address: str(r.formattedAddress),
    ...(typeof loc?.latitude === "number" && typeof loc?.longitude === "number"
      ? { location: { lat: loc.latitude, lng: loc.longitude } }
      : {}),
    types: Array.isArray(r.types)
      ? r.types.filter((t) => typeof t === "string").slice(0, 12)
      : [],
    ...(str(r.googleMapsUri).startsWith("https://")
      ? { mapsUri: str(r.googleMapsUri) }
      : {}),
    wheelchairAccessibleEntrance: bool(acc.wheelchairAccessibleEntrance),
    wheelchairAccessibleSeating: bool(acc.wheelchairAccessibleSeating),
    wheelchairAccessibleRestroom: bool(acc.wheelchairAccessibleRestroom),
    openNow: bool(
      (r.currentOpeningHours as { openNow?: unknown } | undefined)?.openNow,
    ),
    ...(str(r.priceLevel) ? { priceLevel: str(r.priceLevel) } : {}),
    photos,
  };
}

export function googlePlaceProvider(
  apiKey: string | undefined,
  fetcher: Fetcher = fetch,
): PlaceProvider {
  return {
    async search({ name, address }) {
      if (!apiKey) return { status: "unavailable", reason: "not_configured" };
      try {
        const res = await fetcher(
          "https://places.googleapis.com/v1/places:searchText",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": apiKey,
              "X-Goog-FieldMask": FIELDS,
            },
            body: JSON.stringify({
              textQuery: address ? `${name}, ${address}` : name,
              pageSize: 5,
            }),
            signal: AbortSignal.timeout(4500),
            redirect: "error",
          },
        );
        if (!res.ok) return { status: "unavailable", reason: "provider_error" };
        const body = (await res.json()) as { places?: unknown[] };
        return {
          status: "available",
          places: (body.places ?? [])
            .map(parseGooglePlace)
            .filter((p): p is ProviderPlace => p !== null),
        };
      } catch (e) {
        return {
          status: "unavailable",
          reason:
            e instanceof DOMException && e.name === "TimeoutError"
              ? "timeout"
              : "provider_error",
        };
      }
    },
  };
}

export function googleRouteProvider(
  apiKey: string | undefined,
  fetcher: Fetcher = fetch,
): RouteProvider {
  return {
    async walk(from, to) {
      if (!apiKey) return { status: "unavailable", reason: "not_configured" };
      try {
        const res = await fetcher(
          "https://routes.googleapis.com/directions/v2:computeRoutes",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": apiKey,
              "X-Goog-FieldMask":
                "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
            },
            body: JSON.stringify({
              origin: {
                location: {
                  latLng: { latitude: from.lat, longitude: from.lng },
                },
              },
              destination: {
                location: { latLng: { latitude: to.lat, longitude: to.lng } },
              },
              travelMode: "WALK",
            }),
            signal: AbortSignal.timeout(4500),
            redirect: "error",
          },
        );
        if (!res.ok) return { status: "unavailable", reason: "provider_error" };
        const body = (await res.json()) as {
          routes?: {
            duration?: string;
            distanceMeters?: number;
            polyline?: { encodedPolyline?: string };
          }[];
        };
        const r = body.routes?.[0];
        const seconds = /^(\d+)s$/.exec(r?.duration ?? "");
        if (!r || !seconds || typeof r.distanceMeters !== "number")
          return { status: "unavailable", reason: "provider_error" };
        return {
          status: "available",
          route: {
            provider: "google-routes",
            mode: "WALK",
            minutes: Math.max(1, Math.round(Number(seconds[1]) / 60)),
            meters: r.distanceMeters,
            ...(r.polyline?.encodedPolyline
              ? { polyline: r.polyline.encodedPolyline }
              : {}),
          },
        };
      } catch {
        return { status: "unavailable", reason: "provider_error" };
      }
    },
  };
}
