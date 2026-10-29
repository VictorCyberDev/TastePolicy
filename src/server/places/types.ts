// Factual place data. Kept strictly apart from Qloo's cultural evidence: a
// place provider says what a place IS (address, photos, accessibility
// attributes); Qloo says whether it fits a person's taste.
export interface ProviderPlace {
  provider: "google-places";
  providerId: string;
  name: string;
  address: string;
  location?: { lat: number; lng: number };
  types: string[];
  mapsUri?: string;
  // Provider-reported attributes. `undefined` means the provider was silent.
  wheelchairAccessibleEntrance?: boolean;
  wheelchairAccessibleSeating?: boolean;
  wheelchairAccessibleRestroom?: boolean;
  openNow?: boolean;
  priceLevel?: string;
  photos: PlacePhoto[];
}
export interface PlacePhoto {
  // Provider resource name, e.g. places/ID/photos/REF. Never a URL with a key.
  ref: string;
  widthPx?: number;
  heightPx?: number;
  attributions: { displayName: string; uri?: string }[];
}
export type IdentityVerdict =
  | {
      status: "matched";
      confidence: number;
      margin: number;
      reasons: string[];
      place: ProviderPlace;
    }
  | {
      status: "ambiguous";
      confidence: number;
      margin: number;
      reasons: string[];
    }
  | { status: "no_match"; confidence: 0; margin: 0; reasons: string[] };

export interface PlaceProvider {
  search(query: {
    name: string;
    address?: string;
  }): Promise<
    | { status: "available"; places: ProviderPlace[] }
    | {
        status: "unavailable";
        reason: "not_configured" | "provider_error" | "timeout";
      }
  >;
}
export interface RouteSummary {
  provider: "google-routes";
  mode: "WALK";
  minutes: number;
  meters: number;
  // Encoded polyline, drawn only when the provider returned one.
  polyline?: string;
}
export interface RouteProvider {
  walk(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ): Promise<
    | { status: "available"; route: RouteSummary }
    | {
        status: "unavailable";
        reason: "not_configured" | "provider_error" | "timeout";
      }
  >;
}
