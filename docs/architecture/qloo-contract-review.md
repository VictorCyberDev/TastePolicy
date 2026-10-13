# Qloo contract review — 2026-10-10

Reviewed current Qloo-hosted developer guide and embedded OpenAPI data via HTTPS, and Qloo's authoritative [public documentation repository](https://github.com/qloo/docs-public) at d4a0eb978518f7fb404993d1509d11b21239ada6. This is documentation verification, not live API verification.

## Verified requests

| Purpose                | Request          | Parameters                                                                                                           |
| ---------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| Resolution             | GET /search      | query, types=urn:entity:TYPE, take=12                                                                                |
| Identity verification  | GET /entities    | entity_ids=comma-separated UUIDs (up to 6)                                                                           |
| Cross-domain discovery | GET /v2/insights | signal.interests.entities, filter.type, filter.exclude.entities, feature.explainability=true, take=8                 |
| Specific candidate     | GET /v2/insights | same signals/type, filter.results.entities=CANDIDATE_ID, feature.explainability=true, take=1; no candidate exclusion |

Authentication: X-Api-Key header only. The current [hackathon guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide) explicitly assigns https://hackathon.api.qloo.com to hackathon keys; those keys do not work against staging/production. Normal production documentation uses https://api.qloo.com. Runtime configuration permits only those exact HTTPS origins, with no automatic host fallback or redirects. User requests cannot select a host, URL or path.

Supported demo identity types are artist/book/brand/destination/movie/place/tv_show. Output targets are brand/destination/place. The broader API documents other domains, but this narrow slice does not need them. Canonical artist/movie/brand/tv_show inputs use cross-domain entity signals. All output domains support filter.results.entities and entity inputs per the type guide. Entity Search uses `types` (plural), not the Insights `filter.type` parameter.

## Response and score cautions

Search/entity lookup readers accept documented result arrays or results.entities. Entity normalization uses entity_id, name and subtype (or a specific type). Arbitrary properties/provider payloads terminate in the adapter; only release year/address are allowlisted identity context. Fail closed on unknown types or malformed entities.

The current Insights response schema guarantees a results.entities collection but leaves item schemas unspecified. The implemented reader expects per-entity query.affinity and query.explainability; those item structures still require live account verification. A missing/unsupported affinity is invalid_response, not a guessed score. The single explainability array reader is provisional and exposes unknown/malformed/partial evidence explicitly; tests use synthetic contract fixtures, not alleged recordings.

Affinity documentation gives conceptual 0–100 percentages, while the current hosted glossary describes 0–1. Therefore QLOO_AFFINITY_SCALE is required explicitly for inference, after actual response review. No heuristic scale inference is used. The public repository's openapi-schema.json is actually an OpenAPI document meta-schema rather than a concrete Qloo endpoint specification; the hosted page's embedded schema was also inspected instead of treating that file as an endpoint contract.

## Explainability and limits

feature.explainability requests per-result input impact; Qloo describes unit-normalized scores, low-impact omissions and warnings when explanation cannot be computed. Do not interpret them as additive percentages or causal proof. The reader only accepts entity_id plus score arrays; no speculative affinity aliases or map semantics. Missing signals do not establish deliberate provider omission. Top-level warnings are normalized as flags. Explicit omission IDs can be supplied through adapter metadata only after their live wire representation is verified; no current mapping guesses that representation.

Search documentation lists 404 no results and 429 rate limit exceeded. The guide describes 401 missing/invalid key and 403 access/type permissions; Insights describes 400 and 500. Upstream error bodies are not exposed or logged. Hackathon keys have rate/monthly quotas, but the guide supplies no numeric cap; quotas may be raised through sponsor support and keys expire after the event. Application limits are separate: 8-second timeout per call, no retries, at most five actual provider calls per route-created provider instance, 1 MiB upstream body, 16 KiB request body with a total three-second read deadline, five input signals, at most eight discovery candidates and one evaluated candidate. A process-local 30 requests/minute and four concurrent route cap is a basic abuse guard, not a distributed or account-wide guarantee. Use platform deployment protection and provider quota monitoring for the credentialed public demo. Search 404 preserves documented no-match behavior; lookup/Insights 404 remains provider_error because status alone cannot distinguish endpoint problems from missing evidence. Successful empty lookup/Insights responses remain explicit non-decisions.

## Primary references

- https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide
- https://docs.qloo.com/reference/get-search
- https://docs.qloo.com/reference/get-entities
- https://docs.qloo.com/reference/insights-api-deep-dive
- https://docs.qloo.com/reference/available-parameters-by-entity-type
- https://github.com/qloo/docs-public/blob/main/docs/interpreting-affinity-scores.md

Do not commit Qloo raw response dumps or private headers. Synthetic fixtures are clearly confined to tests.

## Event-host live observations (2026-10-13)

See [live verification](../evaluation/milestone-1-live-verification.md). Lookup entities use types arrays; Insights entities use scalar type/subtype. Per-candidate contributions use query.explainability[signal.interests.entities]. query.affinity is observed in unit representation; documented percentages must not be confused with this wire scale. Root not_found warnings explain a missing book signal in destination queries. Three candidate scores matched discovery for the same profile, but comparability remains LIMITED and full acceptance remains REPAIR due to unmocked server timeouts and incomplete verifier.
