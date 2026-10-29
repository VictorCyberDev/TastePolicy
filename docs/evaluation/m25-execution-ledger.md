# M25 execution ledger: open place experience

Baseline: production `main` at `6447a287e5c436152eb151e14cfe56a115073552` (deployment `dpl_5XGyzQWCVqLGW3w6ZZHRF11vEJwR`), M24 complete. Branch: `m25-open-place-experience`, created from that `main`. The M24 evidence-only commit `496b809` was intentionally not carried over.

## Immutable M24 semantics (unchanged)

Evaluator, requirement/fact contract, action ceiling, receipts and the judge flow are untouched. M25 only adds data to the existing `facts` context and presentation. A picture produces no fact (tested).

## What M25 delivers

| Milestone            | Result                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 25.2 Identity        | Nominatim (server-side, 1 req/s queue, cache, <= 3 query variants), reusing the deterministic place bridge (street abbreviations normalised); ambiguous/weak matches attach nothing                                      |
| 25.3 OSM facts       | Explicit `wheelchair` / `toilets:wheelchair` tags -> facts with a "not independently verified" note; `limited`/absent -> unknown; Overpass for fresher tags with Nominatim `extratags` as fallback; contact tags dropped |
| 25.4 Map             | MapLibre GL 6 + OpenFreeMap, re-coloured to the Taste palette; destination and origin pins; attribution shown; worker served as a static asset                                                                           |
| 25.5 Routing         | openrouteservice via `api.heigit.org` (`HEIGIT_API_KEY`, optional). Unconfigured: no route, no duration, no walking-time fact                                                                                            |
| 25.6-25.9 Media      | Provider contract + resolver; KartaView, Panoramax, optional Mapillary, linked Wikimedia/Wikidata image; relationship model `EXACT_POI / NEARBY_STREET / AREA_CONTEXT / ILLUSTRATIVE` (distance never upgrades)          |
| 25.10 Gallery        | Ranked, de-duplicated 3-8 images, each with relationship label, attribution, date, license and source link                                                                                                               |
| 25.11 Approach / 360 | "See the approach" (real consecutive frames of one capture sequence, user-initiated, never called video); "Look around" only for provider-flagged panoramic captures                                                     |
| 25.12 State/motion   | Journey line progress follows authority state: ASK pauses at the boundary, ALLOW completes, REJECT softens the destination and keeps the geometry; reduced motion respected                                              |
| 25.13 Resilience     | Per-provider timeout/size/host allowlists, failure isolation, request deadline, privacy (no auto geolocation)                                                                                                            |
| M24 rough edges      | Raw "false" chip replaced by Yes/No; dashboard thumbnails load eagerly                                                                                                                                                   |

Providers, endpoints, terms and caching: `docs/architecture/open-place-providers.md`.

## Live provider validation (real network, this workspace, 2026-10-29)

Candidates are the live Qloo results from production for Margaret. `npm run live:open-places` reproduces it.

| Candidate                                              | Identity                            | OSM facts                                                                                                                 | Media                                                                                                                                       | Sequence            | 360                                           | Route          |
| ------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------- | -------------- |
| The Algonquin Hotel Times Square, Autograph Collection | matched OSM way 266170533 (0.962)   | `wheelchair=yes` -> `accessible_entrance = true` (OpenStreetMap; Nominatim tags, Overpass unreachable from the workspace) | 1 `EXACT_POI` (Wikidata P18 -> Commons, CC BY-SA 4.0, 2021-09-23, Epicgenius) + 2 `NEARBY_STREET` + 3 `AREA_CONTEXT` (KartaView, 2017-2019) | KartaView, 8 frames | yes, KartaView capture 192 m away             | not configured |
| Melody's Piano Bar                                     | matched OSM node 7099017456 (0.957) | `wheelchair=no` -> `accessible_entrance = false`                                                                          | 4 `NEARBY_STREET` + 3 `AREA_CONTEXT` (KartaView, 2017-2019), no exact image (no linked image in OSM)                                        | KartaView, 8 frames | yes, KartaView 2024-10-10 capture ~150 m away | not configured |

Per source: KartaView returned imagery for both; Panoramax returned none (no coverage in Manhattan on the public instance; separately verified live in Paris: 24 pictures, an 8-frame sequence, etalab-2.0 licenses); Wikimedia Commons returned the exact Algonquin image through Wikidata (the Commons API began rate-limiting this workspace later, so the committed Commons fixture is a re-shaped copy of the live values); Mapillary not configured; openrouteservice not configured (no key).
Real consequence for the judge story: with the Algonquin, OpenStreetMap already supplies the entrance fact, so the first ASK is about walking time only; with Melody's, OSM reports no wheelchair access, so the evaluator REJECTs a strong cultural match. Both outcomes are correct behaviour.

## Gates (after the last source change)

| Gate                                             | Result                                                                                                                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| prettier / eslint / tsc                          | clean / 0 errors (1 pre-existing warning) / clean                                                                                                                                                                                                 |
| Unit/integration                                 | 928 passed, 28 skipped (real-Postgres suites; no isolated test database). 35 M25 provider/contract tests use recorded real responses                                                                                                              |
| Production build                                 | passes; `public/vendor` worker generated by `prebuild` and `vercel-build`                                                                                                                                                                         |
| Client bundle secret grep                        | no HEIGIT/Mapillary/Google key names or headers in `.next/static`                                                                                                                                                                                 |
| Chromium E2E (full suite, after the last change) | 184 / 184 passed. Includes 13 M25 tests: relationship labels, attribution, authored fallback, approach (no autoplay), reduced motion, 360 exit, map text equivalents, route state, map failure degrade, privacy, evidence isolation, axe + mobile |
| Firefox / WebKit                                 | not executed                                                                                                                                                                                                                                      |

## Known issues and external setup

- `HEIGIT_API_KEY` (optional, free Standard key from HeiGIT) is not set: production shows the map, imagery and a straight-line distance but no route or walking time. External account setup required.
- `MAPILLARY_ACCESS_TOKEN` optional, not set.
- Public Overpass (`overpass-api.de`) is blocked from the build workspace; in production it is attempted with a 3.5 s timeout and Nominatim tags are the fallback.
- KartaView's CDN occasionally returns 500 for individual pictures; the gallery drops just that picture. KartaView's per-picture license is not in its API; the UI labels it "CC BY-SA 4.0" per KartaView's published terms, which could not be re-verified from the API (see providers doc).
- The 360 captures are large (the Melody's one is ~8 MB); they load only on "Look around".
- Production deployment and acceptance are recorded after the merge (see below); that record is kept off `main` so the deployed SHA stays unambiguous.
