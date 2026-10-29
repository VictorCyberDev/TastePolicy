# M24 execution ledger

Branch `ccr-770112d7-0lo0o3`, continued from `origin/main` at `04fdbb8` (M16-M23 closed). Evidence kinds: LOCAL (this workspace), CONTRACT FIXTURE (shape taken from provider docs, not a live call), NOT EXECUTED.

## Status: COMPLETE WITH EXTERNAL BLOCKERS

Everything buildable without third-party credentials or a deploy trigger is implemented and verified locally. Live Qloo and live Google Maps Platform behaviour could not be exercised in this workspace (no keys), and no production deployment was performed (see blockers).

## Milestones

| #     | Status              | What changed                                                                                                                                                                                                            | Evidence                        |
| ----- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 24.1  | Done                | Positioning: "AI that helps without replacing you", personal agency infrastructure; human vocabulary in `src/lib/human/copy.ts`; layout metadata                                                                        | `/`, README                     |
| 24.2  | Done                | Margaret persona, anchors, needs, ceiling in `src/features/experience/personas.ts`. Anchors resolve against live Qloo at runtime with user review                                                                       | e2e (mocked network)            |
| 24.3  | Done                | Generic `Requirement` contract (`src/lib/requirements`), hard/soft, 8 operators, `price` compatible with `context.price`                                                                                                | `tests/requirements.test.ts`    |
| 24.4  | Done                | `CandidateFact` (source, sourceType, evidence, state, timestamp, confidence); Qloo refused as a place-fact source                                                                                                       | same                            |
| 24.5  | Done                | Violation REJECT; unknown ASK; unavailable UNAVAILABLE; satisfied ALLOW; over-ceiling ASK; `StateEvaluation.requirements/authority`; context commitments include requirements/facts; legacy semantics regression-tested | same + full suite               |
| 24.6  | Done                | Qloo adapter untouched; evaluation path extended additively                                                                                                                                                             | 894 unit tests pass             |
| 24.7  | Done                | `src/server/places/bridge.ts` deterministic identity score, ambiguity and weak-match refusal                                                                                                                            | `tests/places.test.ts`          |
| 24.8  | Done (live blocked) | Provider photo proxy (`/api/places/photo`), attribution, `no-store`; fallback provider -> Wikimedia -> authored                                                                                                         | contract fixtures; e2e fallback |
| 24.9  | Done (live blocked) | Address, coordinates, accessibility attributes, walking time; unknown stays unknown                                                                                                                                     | contract fixtures               |
| 24.10 | Done                | Tokens, light-by-design human theme, accessible status colours                                                                                                                                                          | axe (light+dark)                |
| 24.11 | Done                | Tasteprint, Boundary Ribbon, Culture Tiles, Need Chips, Place Canvas, Authority Ladder, Decision Seal, Journey Line in `src/components/brand/`                                                                          | pages, e2e                      |
| 24.12 | Done                | Semantic CSS motion, reduced-motion respected                                                                                                                                                                           | e2e reduced-motion test         |
| 24.13 | Done                | `/experience`; `/arena/consumer` kept                                                                                                                                                                                   | e2e                             |
| 24.14 | Done                | Image-first place card, cues, need chips, ask panel, receipt, developer details disclosure                                                                                                                              | e2e                             |
| 24.15 | Done (live blocked) | Journey line from provider polyline; truthful fallback; no fabricated route                                                                                                                                             | unit                            |
| 24.16 | Done                | `/dashboard` Personal Agency Home (account-backed; labelled example when signed out)                                                                                                                                    | e2e                             |
| 24.17 | Done                | `/developers/workspace`; links, billing return URLs and tests repointed                                                                                                                                                 | e2e                             |
| 24.18 | Done                | Homepage, product, nav (Product, Use cases, Developers, Trust, Open TastePolicy)                                                                                                                                        | e2e                             |
| 24.19 | Done                | `/judge` three acts, no login, technical evidence preserved                                                                                                                                                             | e2e                             |
| 24.20 | Done                | `/experience/sensory-aware`, `/experience/low-energy` on the same generic engine                                                                                                                                        | e2e                             |
| 24.21 | Done                | Scenarios A-E tested; regression, a11y, mobile, reduced motion                                                                                                                                                          | see below                       |
| 24.22 | Partial             | Format, lint, typecheck, unit, build, e2e, secrets grep, route smoke done locally; no deploy                                                                                                                            | see blockers                    |

## Results (LOCAL)

- prettier: clean. eslint: 0 errors. typecheck: clean. `next build`: success.
- Unit/integration: see final run in the session report (895 passing, 28 skipped real-Postgres suites; no database here).
- E2E (chromium; firefox/webkit are not installed in this workspace): 171 tests; the only failures in the first full run (axe `/product` dark, nav test) were fixed and re-run green.
- Bundle: no Google key or provider header in `.next/static`.

## External blockers

1. **Qloo live path**: no `QLOO_API_KEY` here, so resolution/discovery/evaluation were exercised with mocked network edges plus the real evaluator. The adapter is unchanged and covered by existing tests.
2. **Google Places/Routes**: no `GOOGLE_MAPS_API_KEY`; adapters verified against contract fixtures only. Production falls back to Wikimedia/authored imagery and asks for unknown facts until the key is set (server-only env var, enable Places API (New) and Routes API).
3. **PostgreSQL-backed suites** (`TASTEPOLICY_TEST_DATABASE_URL`) not run: no database here.
4. **Production deployment**: production is served from the default branch. Merging this branch to `main` is the owner's decision; no deployment, merge or PR was made from this session.
5. **Firefox/WebKit e2e projects**: browsers not installed here.
