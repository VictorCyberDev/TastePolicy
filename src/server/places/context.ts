import type { CandidateFact } from "@/lib/requirements/types";
import { bridgePlace } from "./bridge";
import type {
  IdentityVerdict,
  PlaceProvider,
  RouteProvider,
  RouteSummary,
} from "./types";
import type { QlooEntity } from "@/types/domain";

export interface PlaceContext {
  status: "available" | "unavailable";
  // Why no factual context is attached; the experience falls back truthfully.
  reason?: "not_configured" | "provider_error" | "timeout" | "no_identity";
  identity: {
    status: IdentityVerdict["status"] | "not_attempted";
    confidence: number;
    margin: number;
    reasons: string[];
  };
  place?: {
    provider: "google-places" | "openstreetmap";
    providerId: string;
    name: string;
    address: string;
    location?: { lat: number; lng: number };
    mapsUri?: string;
    types: string[];
    openNow?: boolean;
  };
  photo?: {
    // Same-origin proxy path; the provider key never leaves the server.
    src: string;
    widthPx?: number;
    heightPx?: number;
    attributions: { displayName: string; uri?: string }[];
    provider: "Google Maps";
  };
  route?: RouteSummary & { originLabel: string };
  routeUnavailable?:
    "not_configured" | "provider_error" | "timeout" | "no_origin";
  facts: CandidateFact[];
  // Fact keys the provider had a chance to answer and was silent about.
  silentKeys: string[];
  provenance: { requestedAt: string; sources: string[] };
}

export interface ContextInput {
  entity: QlooEntity;
  origin?: { lat: number; lng: number; label: string };
}

const known = (
  key: string,
  value: boolean | number,
  source: string,
  now: string,
  unit?: string,
): CandidateFact => ({
  key,
  value,
  state: "known",
  evidence: "VERIFIED",
  source,
  sourceType: "PLACE_PROVIDER",
  observedAt: now,
  ...(unit ? { unit } : {}),
});

export async function resolvePlaceContext(
  input: ContextInput,
  places: PlaceProvider,
  routes: RouteProvider,
  now: string,
): Promise<PlaceContext> {
  const base = {
    facts: [] as CandidateFact[],
    silentKeys: [] as string[],
    provenance: { requestedAt: now, sources: [] as string[] },
  };
  const result = await places.search({
    name: input.entity.name,
    address: input.entity.address,
  });
  if (result.status === "unavailable")
    return {
      status: "unavailable",
      reason: result.reason,
      identity: {
        status: "not_attempted",
        confidence: 0,
        margin: 0,
        reasons: [],
      },
      ...base,
    };
  const verdict = bridgePlace(input.entity, result.places);
  const identity = {
    status: verdict.status,
    confidence: verdict.confidence,
    margin: verdict.margin,
    reasons: verdict.reasons,
  };
  // Nothing from the provider is attached unless identity is certain.
  if (verdict.status !== "matched")
    return {
      status: "unavailable",
      reason: "no_identity",
      identity,
      ...base,
      provenance: { requestedAt: now, sources: ["google-places:search"] },
    };
  const p = verdict.place;
  const facts: CandidateFact[] = [];
  const silentKeys: string[] = [];
  if (p.wheelchairAccessibleEntrance !== undefined)
    facts.push(
      known(
        "accessible_entrance",
        p.wheelchairAccessibleEntrance,
        "google-places",
        now,
      ),
    );
  else silentKeys.push("accessible_entrance");
  const sources = ["google-places:search"];
  let route: PlaceContext["route"];
  let routeUnavailable: PlaceContext["routeUnavailable"];
  if (p.location && input.origin) {
    const r = await routes.walk(input.origin, p.location);
    if (r.status === "available") {
      sources.push("google-routes:walk");
      route = { ...r.route, originLabel: input.origin.label };
      facts.push(
        known("walking_minutes", r.route.minutes, "google-routes", now, "min"),
      );
    } else routeUnavailable = r.reason;
  } else routeUnavailable = "no_origin";
  if (!facts.some((f) => f.key === "walking_minutes"))
    silentKeys.push("walking_minutes");
  // Noise level and seating are not attributes this provider reports.
  silentKeys.push("noise_level");
  const photo = p.photos[0];
  return {
    status: "available",
    identity,
    place: {
      provider: p.provider,
      providerId: p.providerId,
      name: p.name,
      address: p.address,
      location: p.location,
      mapsUri: p.mapsUri,
      types: p.types,
      openNow: p.openNow,
    },
    ...(photo
      ? {
          photo: {
            src: `/api/places/photo?ref=${encodeURIComponent(photo.ref)}`,
            widthPx: photo.widthPx,
            heightPx: photo.heightPx,
            attributions: photo.attributions,
            provider: "Google Maps" as const,
          },
        }
      : {}),
    ...(route ? { route } : {}),
    ...(routeUnavailable ? { routeUnavailable } : {}),
    facts,
    silentKeys,
    provenance: { requestedAt: now, sources },
  };
}
