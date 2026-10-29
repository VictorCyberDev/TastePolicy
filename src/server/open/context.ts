import type { CandidateFact } from "@/lib/requirements/types";
import {
  resolvePlaceContext,
  type PlaceContext,
} from "@/server/places/context";
import type { PlaceProvider, RouteProvider } from "@/server/places/types";
import type { QlooEntity } from "@/types/domain";
import { exactImage, commonsFileFor, wikidataImage } from "./exact-image";
import { haversineMeters } from "./http";
import { kartaView, kartaViewSequenceWindow } from "./kartaview";
import { mapillary } from "./mapillary";
import { geocodeCandidate } from "./nominatim";
import { openRoute } from "./openrouteservice";
import { factsFromTags, overpassTags } from "./osm-facts";
import { panoramax } from "./panoramax";
import { buildSequence, rankGallery, type Sequence } from "./rank";
import type {
  GeoPoint,
  MediaProvider,
  OpenIdentity,
  OpenRoute,
  PlaceMediaItem,
  Unavailable,
} from "./types";

export interface SourceStatus {
  id: string;
  label: string;
  status: "ok" | "none" | "unavailable" | "not_configured";
  detail?: string;
}
export interface OpenPart {
  identity: OpenIdentity;
  map?: { center: GeoPoint; label: string };
  media: PlaceMediaItem[];
  sequence?: { provider: string; sequenceId: string; frames: PlaceMediaItem[] };
  panorama?: PlaceMediaItem;
  route?: OpenRoute & { originLabel: string };
  routeUnavailable?: Unavailable | "no_origin" | "no_destination";
  straightLineMeters?: number;
  originLabel?: string;
  sources: SourceStatus[];
}
export type OpenPlaceContext = PlaceContext & { open: OpenPart };

export interface OpenDeps {
  fetcher?: typeof fetch;
  heigitKey?: string;
  mapillaryToken?: string;
  google?: {
    places: PlaceProvider;
    routes: RouteProvider;
    configured: boolean;
  };
  now: string;
}
const known = (
  key: string,
  value: number,
  source: string,
  now: string,
  unit: string,
): CandidateFact => ({
  key,
  value,
  state: "known",
  evidence: "VERIFIED",
  source,
  sourceType: "PLACE_PROVIDER",
  observedAt: now,
  unit,
});

const status = (
  id: string,
  label: string,
  r: { status: string; reason?: string },
  count?: number,
): SourceStatus =>
  r.status === "available"
    ? {
        id,
        label,
        status: count === 0 ? "none" : "ok",
        detail: count === undefined ? undefined : `${count}`,
      }
    : r.reason === "not_configured"
      ? { id, label, status: "not_configured" }
      : { id, label, status: "unavailable", detail: r.reason };

// One place, many independent sources. Each is bounded, optional and failing
// alone. The returned facts are explicit map data and a routed walking time;
// pictures never produce a fact.
export async function resolveOpenPlace(
  input: {
    entity: Pick<QlooEntity, "name" | "address" | "type">;
    origin?: GeoPoint & { label: string };
  },
  deps: OpenDeps,
): Promise<OpenPlaceContext> {
  const { now } = deps;
  const sources: SourceStatus[] = [];
  const idr = await geocodeCandidate(input.entity, deps.fetcher);
  sources.push(status("nominatim", "OpenStreetMap place search", idr));
  const identity: OpenIdentity =
    idr.status === "available"
      ? idr.data
      : {
          status: "not_attempted",
          confidence: 0,
          margin: 0,
          reasons: [idr.reason],
        };

  // Optional Google enrichment never gates the open path.
  const google = deps.google?.configured
    ? await resolvePlaceContext(
        { entity: input.entity as QlooEntity, origin: input.origin },
        deps.google.places,
        deps.google.routes,
        now,
      )
    : null;

  const facts: CandidateFact[] = [];
  const silentKeys: string[] = [];
  const open: OpenPart = {
    identity: { ...identity, tags: undefined },
    media: [],
    sources,
  };
  const loc = identity.status === "matched" ? identity.location : undefined;
  if (loc && identity.osm) {
    open.map = { center: loc, label: input.entity.name };
    const providers: MediaProvider[] = [
      kartaView,
      panoramax,
      mapillary(deps.mapillaryToken),
    ];
    const [tagsR, ...mediaR] = await Promise.all([
      overpassTags(identity.osm, deps.fetcher),
      ...providers.map((p) =>
        p.search(
          {
            point: loc,
            radiusMeters: 150,
            limit: p.id === "kartaview" ? 100 : 60,
          },
          deps.fetcher,
        ),
      ),
    ]);
    sources.push(status("overpass", "OpenStreetMap tags (Overpass)", tagsR));
    const tags = tagsR.status === "available" ? tagsR.data : identity.tags;
    const tf = factsFromTags(tags, now);
    facts.push(...tf.facts);
    silentKeys.push(...tf.silentKeys);

    const all: PlaceMediaItem[] = [];
    providers.forEach((p, i) => {
      const r = mediaR[i];
      const label =
        p.id === "kartaview"
          ? "KartaView street imagery"
          : p.id === "panoramax"
            ? "Panoramax street imagery"
            : "Mapillary street imagery";
      sources.push(
        status(
          p.id,
          label,
          r,
          r.status === "available" ? r.data.length : undefined,
        ),
      );
      if (r.status === "available") all.push(...r.data);
    });

    // Exact image: only when the map data itself links one.
    let file = commonsFileFor(tags);
    if (!file && tags?.wikidata) {
      const w = await wikidataImage(tags.wikidata, deps.fetcher);
      if (w.status === "available" && w.data)
        file = commonsFileFor(undefined, w.data);
    }
    const exact: PlaceMediaItem[] = [];
    if (file) {
      const e = await exactImage(file, deps.fetcher);
      sources.push(
        status(
          "commons",
          "Wikimedia Commons (linked image)",
          e,
          e.status === "available" && e.data ? 1 : 0,
        ),
      );
      if (e.status === "available" && e.data) exact.push(e.data);
    }
    open.media = rankGallery([...exact, ...all]);
    // Extend the nearest KartaView sequence into a stretch of street.
    const nearest = all
      .filter(
        (i) =>
          i.provider === "kartaview" &&
          i.sequenceId &&
          i.sequenceIndex !== undefined &&
          !i.panoramic,
      )
      .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))[0];
    let seq: Sequence | null = buildSequence(all);
    if (!seq && nearest) {
      const window = await kartaViewSequenceWindow(
        nearest.sequenceId as string,
        nearest.sequenceIndex as number,
        loc,
        deps.fetcher,
      );
      seq = buildSequence(window);
    }
    if (seq) open.sequence = seq;
    // Nearest genuinely panoramic capture, labelled by its own relation (a 360
    // a block away is "around the area", not "the place").
    open.panorama = all
      .filter((i) => i.panoramic)
      .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))[0];

    if (input.origin) {
      open.originLabel = input.origin.label;
      open.straightLineMeters = Math.round(haversineMeters(input.origin, loc));
      const r = await openRoute(
        { from: input.origin, to: loc },
        deps.heigitKey,
        deps.fetcher,
      );
      sources.push(status("openrouteservice", "Routing (openrouteservice)", r));
      if (r.status === "available") {
        open.route = { ...r.data, originLabel: input.origin.label };
        facts.push(
          known(
            "walking_minutes",
            r.data.minutes,
            "openrouteservice",
            now,
            "min",
          ),
        );
      } else open.routeUnavailable = r.reason;
    } else open.routeUnavailable = "no_origin";
  } else {
    open.routeUnavailable = "no_destination";
  }
  if (!facts.some((f) => f.key === "walking_minutes"))
    silentKeys.push("walking_minutes");
  silentKeys.push("noise_level");

  const matched = identity.status === "matched";
  const base: PlaceContext =
    google && google.status === "available"
      ? google
      : {
          status: matched ? "available" : "unavailable",
          ...(matched
            ? {}
            : {
                reason:
                  identity.status === "not_attempted"
                    ? ("provider_error" as const)
                    : ("no_identity" as const),
              }),
          identity: {
            status:
              identity.status === "not_attempted"
                ? "not_attempted"
                : identity.status,
            confidence: identity.confidence,
            margin: identity.margin,
            reasons: identity.reasons,
          },
          ...(matched
            ? {
                place: {
                  provider: "openstreetmap" as const,
                  providerId: `${identity.osm!.type}/${identity.osm!.id}`,
                  name: input.entity.name,
                  address: identity.displayName ?? input.entity.address ?? "",
                  location: loc,
                  types: [identity.category ?? "", identity.kind ?? ""].filter(
                    Boolean,
                  ),
                },
              }
            : {}),
          facts: [],
          silentKeys: [],
          provenance: { requestedAt: now, sources: [] },
        };
  const merged = [...base.facts, ...facts];
  return {
    ...base,
    facts: merged,
    silentKeys: [...new Set([...base.silentKeys, ...silentKeys])].filter(
      (k) => !merged.some((f) => f.key === k),
    ),
    provenance: {
      requestedAt: now,
      sources: [
        ...base.provenance.sources,
        ...sources.filter((s) => s.status === "ok").map((s) => s.id),
      ],
    },
    open,
  };
}
