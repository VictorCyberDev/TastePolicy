import { bridgePlace } from "@/server/places/bridge";
import type { ProviderPlace } from "@/server/places/types";
import type { QlooEntity } from "@/types/domain";
import { cached, getJson, nominatimSlot, validPoint } from "./http";
import type { OpenIdentity, ProviderOutcome } from "./types";

// Geographic identity from OpenStreetMap's public Nominatim, used server-side,
// one request per second, cached, and only when the candidate has no
// coordinates of its own. Swappable: nothing outside this file knows its shape.
const HOSTS = ["nominatim.openstreetmap.org"];
interface Row {
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  category?: string;
  type?: string;
  extratags?: Record<string, string> | null;
}

const TAGS = new Set([
  "wheelchair",
  "wheelchair:description",
  "toilets:wheelchair",
  "wikidata",
  "wikimedia_commons",
]);
export function toIdentity(
  entity: Pick<QlooEntity, "name" | "address" | "type">,
  rows: Row[],
): OpenIdentity {
  const usable = rows.filter(
    (r) =>
      (r.osm_type === "node" ||
        r.osm_type === "way" ||
        r.osm_type === "relation") &&
      Number.isInteger(r.osm_id) &&
      validPoint({ lat: Number(r.lat), lng: Number(r.lon) }),
  );
  const places: ProviderPlace[] = usable.map((r) => ({
    provider: "google-places", // shape only; the bridge never reads this
    providerId: `${r.osm_type}/${r.osm_id}`,
    name: r.name || (r.display_name ?? "").split(",")[0],
    address: r.display_name ?? "",
    types: [r.category ?? "", r.type ?? ""],
    photos: [],
  }));
  const verdict = bridgePlace(
    { id: "n", name: entity.name, address: entity.address, type: "place" },
    places,
  );
  if (verdict.status !== "matched")
    return {
      status: verdict.status,
      confidence: verdict.confidence,
      margin: verdict.margin,
      reasons: verdict.reasons,
    };
  const row = usable.find(
    (r) => `${r.osm_type}/${r.osm_id}` === verdict.place.providerId,
  )!;
  return {
    status: "matched",
    confidence: verdict.confidence,
    margin: verdict.margin,
    reasons: verdict.reasons,
    displayName: row.display_name,
    location: { lat: Number(row.lat), lng: Number(row.lon) },
    osm: {
      type: row.osm_type as "node" | "way" | "relation",
      id: row.osm_id as number,
    },
    category: row.category,
    kind: row.type,
    tags: Object.fromEntries(
      Object.entries(row.extratags ?? {}).filter(
        ([k, v]) =>
          typeof k === "string" && typeof v === "string" && v.length < 300,
      ),
    ),
  };
}

// Query variants, most specific first. Qloo names often carry a brand suffix
// ("…, Autograph Collection") that OpenStreetMap does not, so a looser variant
// follows. Each extra variant costs one rate-limited request, so at most three.
export function queryVariants(
  entity: Pick<QlooEntity, "name" | "address">,
): string[] {
  const head = entity.name.split(",")[0].trim();
  const address = entity.address ?? "";
  // City: what follows the street type ("… 44th St New York, NY 10036").
  const city =
    address.match(
      /\b(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Pl|Place|Sq|Square|Way)\b\.?,?\s+([A-Za-z][A-Za-z .'-]*?)(?:,|$)/,
    )?.[1] ??
    address
      .split(",")
      .map((p) => p.trim())
      .find((p) => /^[A-Za-z][A-Za-z .'-]{2,}$/.test(p));
  // A short distinctive core: Nominatim wants every word to match a name.
  const core = head
    .replace(/^(the|a|an)\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .join(" ");
  return [
    ...new Set(
      [
        city ? `${head} ${city}` : "",
        city && core ? `${core} ${city}` : core,
        address ? `${entity.name}, ${address}` : entity.name,
      ].filter(Boolean),
    ),
  ].slice(0, 3);
}

export async function geocodeCandidate(
  entity: Pick<QlooEntity, "name" | "address" | "type">,
  fetcher?: typeof fetch,
): Promise<ProviderOutcome<OpenIdentity>> {
  let last: OpenIdentity | null = null;
  for (const q of queryVariants(entity)) {
    const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams(
      {
        q,
        format: "jsonv2",
        limit: "5",
        extratags: "1",
      },
    )}`;
    const rows = await cached<Row[]>(
      `nominatim:${q.toLowerCase()}`,
      6 * 3_600_000,
      () =>
        nominatimSlot(() =>
          getJson<Row[]>(url, { allowHosts: HOSTS, timeoutMs: 6000, fetcher }),
        ),
    );
    if (rows.status !== "available")
      return last ? { status: "available", data: last } : rows;
    if (!Array.isArray(rows.data))
      return { status: "unavailable", reason: "invalid_response" };
    const identity = toIdentity(entity, rows.data);
    if (identity.status === "matched")
      return { status: "available", data: identity };
    // An ambiguous answer is kept as the result unless a looser query matches.
    if (!last || identity.status === "ambiguous") last = identity;
  }
  return {
    status: "available",
    data: last ?? {
      status: "no_match",
      confidence: 0,
      margin: 0,
      reasons: ["NO_PROVIDER_RESULTS"],
    },
  };
}
