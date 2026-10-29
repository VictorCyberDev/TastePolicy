# Open place experience: providers, terms and truthfulness (M25)

The M25 place experience runs with **no Google credential**. Every provider below is bounded (timeout, size cap, host allowlist), optional and independent: one failing never fails `/experience`.

| Role                      | Provider                                                    | Endpoint used                                                                | Credential               | Notes                                                                                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Map renderer              | MapLibre GL JS 6.x                                          | client, lazy-loaded on "See the journey"                                     | none                     | Worker is served as a static asset (`scripts/copy-maplibre-worker.mjs` -> `public/vendor/`, generated at build, not committed)                                                                                   |
| Map style/tiles           | OpenFreeMap                                                 | `https://tiles.openfreemap.org/styles/positron`                              | none                     | Re-coloured to the Taste palette client-side. Attribution required and shown: OpenFreeMap, OpenMapTiles, OpenStreetMap contributors                                                                              |
| Geographic identity       | Nominatim (OSM)                                             | `https://nominatim.openstreetmap.org/search`                                 | none                     | Server-side only, 1 req/s (queued), cached 6 h, identifying User-Agent, at most 3 query variants per candidate, never client-side/autocomplete. Replaceable: only `src/server/open/nominatim.ts` knows its shape |
| Explicit place facts      | OSM tags via Nominatim `extratags`, fresher via Overpass    | `https://overpass-api.de/api/interpreter` (one element by id)                | none                     | Missing tag = unknown. `wheelchair=yes/no` -> `accessible_entrance`; `limited`/absent -> unknown. Facts carry a "not independently verified" note. Contact tags are dropped                                      |
| Street imagery            | KartaView                                                   | `https://api.kartaview.org/2.0/photo/`                                       | none                     | 250 m radius; processed (blurred) renditions; 1280 px for photos, full file only for 360                                                                                                                         |
| Street imagery            | Panoramax                                                   | `https://api.panoramax.xyz/api/search`                                       | none                     | STAC; per-picture license from the API; pictures without a license are dropped                                                                                                                                   |
| Street imagery (optional) | Mapillary                                                   | `https://graph.mapillary.com/images`                                         | `MAPILLARY_ACCESS_TOKEN` | Skipped when unset                                                                                                                                                                                               |
| Exact image               | Wikidata P18 / OSM `wikimedia_commons` -> Wikimedia Commons | `commons.wikimedia.org`, `www.wikidata.org`                                  | none                     | Only route to `EXACT_POI`. Same license validation as the legacy Wikimedia route (shared in `src/server/media/commons-license.ts`)                                                                               |
| Routing (optional)        | openrouteservice (HeiGIT)                                   | `https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson` | `HEIGIT_API_KEY`         | Not the deprecated `api.openrouteservice.org`. Without a key no route, duration or walking-time fact is produced                                                                                                 |
| Enrichment (optional)     | Google Places/Routes                                        | existing adapters                                                            | `GOOGLE_MAPS_API_KEY`    | Never required                                                                                                                                                                                                   |

## Media relationship (never upgraded)

- `EXACT_POI`: only when map data links an image to the place (Wikidata P18 or OSM `wikimedia_commons`), license-validated.
- `NEARBY_STREET`: a geotagged picture within 60 m. Distance and heading are never proof of identity.
- `AREA_CONTEXT`: 60-250 m. Pictures beyond 250 m are not shown.
- `ILLUSTRATIVE`: the authored Taste image, labelled "not property photography".

## Evidence isolation

Pictures are presentation/location context. They produce no `CandidateFact`, ever (tested). Facts come only from explicit OSM tags, a routed walking time, the person's own answers, or (optionally) Google. Qloo remains cultural evidence only.

## Fair use and privacy

No browser geolocation is requested. Only the demo origin and the candidate coordinates leave the server. Public Nominatim/Overpass are used for targeted single lookups, cached, with short timeouts. Third-party imagery is hot-linked from allowlisted provider CDNs, never stored or proxied. If any provider's volume terms change, swap the adapter or self-host; the contracts in `src/server/open/types.ts` do not change.

## Licenses

Wikimedia and Panoramax licenses are read from the providers' own responses. KartaView's API does not return a per-picture license; the experience shows "CC BY-SA 4.0" per KartaView's published contributor terms, which this workspace could not re-verify from the API (the web app is a script-rendered page). Treat that single label as an assumption until confirmed against KartaView's terms.
