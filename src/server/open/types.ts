// M25 open place layer. Presentation media, geographic identity, explicit map
// facts and routes are kept in separate contracts. Nothing here makes a
// decision: a photograph is never evidence about access, noise or safety.
export interface GeoPoint {
  lat: number;
  lng: number;
}

// How a picture relates to the candidate. Distance never upgrades a relation.
export const MEDIA_RELATIONS = [
  "EXACT_POI",
  "NEARBY_STREET",
  "AREA_CONTEXT",
  "ILLUSTRATIVE",
] as const;
export type MediaRelation = (typeof MEDIA_RELATIONS)[number];

export type MediaProviderId =
  "kartaview" | "panoramax" | "mapillary" | "wikimedia-commons";

export interface PlaceMediaItem {
  provider: MediaProviderId;
  providerId: string;
  mediaType: "photo" | "panorama";
  url: string;
  thumbUrl: string;
  landingUrl?: string;
  // Only what the provider states. Never invented.
  author?: string;
  attribution: string;
  license?: string;
  licenseUrl?: string;
  capturedAt?: string;
  location?: GeoPoint;
  heading?: number;
  fieldOfView?: number;
  sequenceId?: string;
  sequenceIndex?: number;
  width?: number;
  height?: number;
  panoramic: boolean;
  // Interactive viewer the provider itself offers for this picture.
  viewerUrl?: string;
  distanceMeters?: number;
  relation: MediaRelation;
  // 0..1 trust in `relation`, not image quality.
  confidence: number;
}

export type Unavailable =
  | "not_configured"
  | "timeout"
  | "provider_error"
  | "invalid_response"
  | "blocked_host";

export type ProviderOutcome<T> =
  | { status: "available"; data: T }
  | { status: "unavailable"; reason: Unavailable };

export interface MediaQuery {
  point: GeoPoint;
  radiusMeters: number;
  limit: number;
}
export interface MediaProvider {
  id: MediaProviderId;
  search(
    q: MediaQuery,
    fetcher?: typeof fetch,
  ): Promise<ProviderOutcome<PlaceMediaItem[]>>;
}

export interface OsmRef {
  type: "node" | "way" | "relation";
  id: number;
}
export interface OpenIdentity {
  status: "matched" | "ambiguous" | "no_match" | "not_attempted";
  confidence: number;
  margin: number;
  reasons: string[];
  displayName?: string;
  location?: GeoPoint;
  osm?: OsmRef;
  category?: string;
  kind?: string;
  // Explicit tags only, as the map data records them.
  tags?: Record<string, string>;
}

export interface OpenRoute {
  provider: "openrouteservice";
  profile: "foot-walking" | "wheelchair";
  minutes: number;
  meters: number;
  // [lng, lat] pairs exactly as the router returned them.
  geometry: [number, number][];
}
export interface RouteQuery {
  from: GeoPoint;
  to: GeoPoint;
  profile?: OpenRoute["profile"];
}
