# Milestone 1 live verification

Status: **BLOCKED_ON_QLOO_CREDENTIAL**.

No valid QLOO_API_KEY was available in the runtime or local environment files during implementation. No live entity resolution, cross-domain inference, candidate affinity, contribution score or Cultural Receipt is claimed. Unit/E2E fixtures are synthetic and test-only.

## Intended canonical profile

| Concept            | Expected domain | Identity review                                                                |
| ------------------ | --------------- | ------------------------------------------------------------------------------ |
| Radiohead          | artist          | Verify exact band identity.                                                    |
| Dune               | movie           | Prefer the 2021 film; inspect release year, never first fuzzy match.           |
| Aesop              | brand           | Verify skincare brand, not unrelated names.                                    |
| The Bear           | tv_show         | Verify the correct television series.                                          |
| Blue Bottle Coffee | brand           | Verify brand identity; if unavailable consider place only after manual review. |

All five remain unresolved. No Qloo IDs have been invented or replacements silently selected. Default discovery target is destination, distinct from all canonical input domains. Proposed action is SELECT_ENTITY for a real candidate returned by Qloo, evaluated in a separate candidate-filtered Insights request. Actual candidate, score, decision, repeat stability and explainability remain unverified.

## How to perform the live check

1. Request a key using Qloo's hackathon guide/form. Configure the key privately in .env.local and use the exact assigned host. Never paste keys into GitHub, screenshots, PRs or CI.
2. Resolve the profile through the UI; inspect ambiguities and entity types. The script requires a unique exact-name match for each concept and Dune release year 2021, otherwise it stops for human review. Document any canonical replacement before rerunning a reviewed profile.
3. Inspect a real Insights response privately to establish the wire affinity scale, then set QLOO_AFFINITY_SCALE=unit or percent. Missing scale disables Insights/evaluation intentionally. If the observed response structure differs, update adapter normalization and tests before claiming success.
4. Start npm run dev, then run npm run verify:qloo in another terminal (default app URL http://127.0.0.1:3000; override local port with QLOO_VERIFY_APP_URL).
5. The runner resolves five signals, discovers destinations, evaluates a specific candidate twice and prints a normalized receipt/repeat summary. It does not access keys or silently use fixtures. Nonzero exit means blocked/review needed.
6. Record timestamp, five verified names/types, reviewed identity decisions, target, candidate, score, decision, explanation availability and repeat behavior here after a successful live test. Keep raw Qloo dumps/headers out of the public repository.

Implementation/test completion is distinct from successful live proof. The milestone cannot claim the company thesis has been demonstrated with real data until this document is updated from an actual successful test.

## Local verification performed

On 2026-10-10, npm ci and npm run verify passed: formatting, lint, strict typecheck, 80 unit/integration tests and production build. Both Playwright tests passed, covering the real unconfigured runtime/mobile dark layout and a clearly synthetic test-only full UI flow. Browser errors were absent. Production /api/health returned HTTP 200 with the expected non-sensitive body. npm run verify:qloo was actually invoked against a running production server; it exited 2 with not_configured, confirming safe blocking rather than a live Qloo success. No canonical IDs, affinity distribution or real-data decision were obtained.
