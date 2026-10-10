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
5. The runner requires five distinct signals across at least three domains. It probes destination/place/brand (up to eight candidates each), samples high/median/low discovery alignment for coverage only, evaluates three distinct candidates and repeats one. Cross-domain score sorting does not establish comparability. It checks receipt IDs/types, versions, raw/normalized score consistency, thresholds/decision, provenance and explanation quality. It never reads the key, retries failures or falls back to fixtures.
6. Initial API success is PARTIAL_LIVE_PROOF, not milestone acceptance. Before enabling an acceptance result, independently review the live wire contract, identities, full unmocked UI, score scale and threshold rationale/distribution. Supply QLOO_VERIFY_REVIEW_FILE as a local, sanitized JSON record with wireContractVerified, canonicalIdentitiesReviewed, fullLiveUiVerified, thresholdsReviewed, scaleVerified (unit/percent), host, policyVersion, signalIds and reviewedAt. The four review flags must be true; host/scale/version/IDs must match the run. This record is a human attestation, not automated proof or a cryptographic assertion. Never include credentials, headers or raw dumps. No review record exists or is claimed in this repair pass.
7. The runner emits NOT_CONFIGURED, AUTH_FAILED, CONTRACT_MISMATCH, PARTIAL_LIVE_PROOF or LIVE_ACCEPTANCE_PASSED. Only fully passing technical checks plus the reviewed record can exit zero. Repeated score, decision, scale, policy and explanation differences remain partial proof. The runner is bounded to ten local requests, with no retries. Unsupported domains are reported explicitly; at least three usable distinct candidates are required overall.
8. Record timestamp, five verified names/types, reviewed identity decisions, target, candidate, score, decision, explanation availability and repeat behavior here after a successful live test. Keep raw Qloo dumps/headers out of the public repository.

Implementation/test completion is distinct from successful live proof. The milestone cannot claim the company thesis has been demonstrated with real data until this document is updated from an actual successful test.

## Local verification performed

On 2026-10-10, npm ci and npm run verify passed: formatting, lint, strict typecheck, 80 unit/integration tests and production build. Both Playwright tests passed, covering the real unconfigured runtime/mobile dark layout and a clearly synthetic test-only full UI flow. Browser errors were absent. Production /api/health returned HTTP 200 with the expected non-sensitive body. npm run verify:qloo was actually invoked against a running production server; it exited 2 with not_configured, confirming safe blocking rather than a live Qloo success. No canonical IDs, affinity distribution or real-data decision were obtained.

## Pre-key hardening status

The service/receipt invariants, conservative explanation states, verifier assertions and quota guards were repaired before credential provisioning. Regression tests use explicitly synthetic test-only inputs. This repair pass does not execute live Qloo verification, calibrate thresholds, resolve canonical IDs, or change BLOCKED_ON_QLOO_CREDENTIAL. The ready Vercel preview reported by PR infrastructure is not live provider proof.

Pre-key hardening verification (2026-10-10): npm ci, npm run verify and npm run test:e2e passed. There are 127 passing unit/integration tests, including 47 targeted hardening regressions, and two passing Playwright tests with no page errors. The real unconfigured runtime returned the expected safe failure and non-sensitive health response; the successful decision UI used explicit test-only interception. Runtime dependency audit reports zero vulnerabilities; the five existing high development-tool findings remain documented. No live verifier was executed in this repair pass.
