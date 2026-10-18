# M4 — Implementation verification

Verification date: 2026-10-17. Authoritative starting main: c6b29e66d530fde4a9eaaf8d6774ca3a03b23fa7. Canonical architecture v2, M2/M2.5/M3 product contracts, ADRs 0006–0008, accepted state/interactive/provider services and migrations were inspected before implementation. ADR 0009 was written before trajectory runtime code.

## Implemented boundary

TasteTrajectory persists an explicitly reviewed, independently server-resolved target as context-scoped EXPLORATION_INTENT, not EXPLICIT_LIKE. Five original anchors remain unchanged for ordinary authorization. Supported targets are brand/destination/place. Current position is state version/hash plus anchors and applicable context/constraints, not a numerical coordinate. Intent creation and removal preserve immutable version lineage.

For sorted S1–S5 and target T, bridge views are T2345 / 1T345 / 12T45 / 123T5 / 1234T. Five distinct UUIDs each, every anchor omitted once. A generation uses one provider instance and five concurrent infer calls, no lookup/retry/evaluation. Any required-query failure returns an unavailable generation without partial support. Evidence is normalized at the unchanged adapter boundary. Query definitions remain recorded even on unavailable generations.

Support is distinct view membership; order is support descending, best rank ascending, stable entity ID ascending. No cross-query affinity aggregation or score tie-breaker. STRICT >=4, MODERATE >=2, BROAD >=1; CONSERVATIVE/ BALANCED/ OPEN cap breadth at STRICT/ MODERATE/ BROAD. Wider starting breadth is an explicit control. Empty plans do not auto-widen. Local feedback moves at most one permitted level, preserves or tightens breadth, or stops. Generation ordinal/event ordinal and feedback cursor preserve chronology even when timestamps coincide.

All bridges start UNVERIFIED. Explicit evaluation delegates to existing TasteStateService.evaluate, whose five EXPLICIT_LIKE filters, evaluateAction, state policy and candidate-specific evidence remain unchanged. A deliberate synthetic candidate would ALLOW with target-mixed inputs but actually REJECTs under the original five. ALLOW may be explicitly selected; ASK requires linked accepted M2.5 clarification; REJECT/UNAVAILABLE cannot be adopted. Target evaluation uses the same path. Direct target ALLOW suppresses unnecessary discovery; completion requires explicit target selection, including a valid interaction-scoped ALLOW. No execution authority.

## Storage and integrity

Migration 0003 adds trajectory_intents, trajectory_generations, trajectory_candidates and trajectory_events. Earlier migrations are unchanged. TrajectoryRepository is a separate transaction-scoped interface composed into the existing PostgreSQL store. Composite SQL FKs bind intent/state signal/profile, generation/trajectory/state/profile, candidate/generation and event/evaluation/clarification/version/profile. Update triggers preserve immutable captured records; RLS and revoked PUBLIC access match accepted private server storage. Profile deletion cascades.

Session/profile locks and capability expiry are reused. Same operation key/payload returns original completed result before stale checks/provider construction; changed payload conflicts. Intent/state/mutation, generation/evidence/projection/idempotency, and local feedback/event writes are atomic. Failure injection demonstrates SQL rollback. Explicit retries after process crash/rollback can repeat external calls before commit: no exactly-once Qloo delivery claim. Native hosted contention is not proven by PGlite.

State changes make generations stale; explicit refresh binds a new generation without replacing target/tolerance. Removing intent stops planning. Historical replay makes zero provider calls, rebuilds ordering/breadth/hash, reads actual persisted candidate rows and validates selected evaluation/clarification links. Modified captured evidence fails INTEGRITY_ERROR. Read/replay labels are CAPTURED, not new live requests. Existing graph v1 omits the newly introduced intent kind so it cannot appear as an explicit preference; old-input graph behavior remains covered by the unchanged baseline.

## Executed local quality gates

| Command/check                                            | Observed result                                 |
| -------------------------------------------------------- | ----------------------------------------------- |
| npm ci                                                   | Passed; 502 installed packages                  |
| npm run format:check                                     | Passed                                          |
| npm run lint                                             | Passed                                          |
| npm run typecheck                                        | Passed                                          |
| npm run test                                             | 410 passed; all 356 existing tests retained     |
| npm run test:database                                    | 151 passed; all 99 existing tests retained      |
| npm run build                                            | Passed                                          |
| npm run test:e2e                                         | 34 passed; all 26 existing tests retained       |
| npm run verify                                           | Passed; 410 tests and production build repeated |
| npm run tastebench:validate                              | VALID, unchanged 24 scenarios                   |
| npm run tastebench:contract -- .tastebench/m4-regression | COMPLETE                                        |
| npm run tastebench:report -- .tastebench/m4-regression   | REPORT_RECONCILED                               |
| npm audit --omit=dev --audit-level=high                  | Zero vulnerabilities                            |
| git diff --check                                         | Passed                                          |

New ordinary tests: 52 trajectory SQL/domain/integration cases, two presentation unit cases and eight intercepted browser cases. SQL tests use production repository SQL and actual 0001→0002→0003 migrations in development-only PGlite. They cover ownership/version/candidate/evaluation/clarification FKs, immutable rows, rollback, same-key replay/conflict, profile isolation/cascade and filesystem close/reopen. They are not native hosted PostgreSQL proof.

## Browser and security review

Actual production-build Chromium exercised explicit target identity review, unverified discovery, ALLOW, ASK→M2.5, REJECT, UNAVAILABLE, five-view failure, local feedback, tolerance cap, explicit refresh, stop, direct target completion and receipt disclosure. Narrow 390×844 dark mode, reduced motion, keyboard activation, long names/IDs and horizontal overflow were checked; light mode was exercised by direct-target flow. Synthetic browser data is explicitly labeled SYNTHETIC TEST DATA. No unexpected browser page errors were observed. The dark mobile element capture was visually inspected; screenshots are temporary test evidence, not claimed live proof.

No automatic provider request occurs on mounting the trajectory UI. The protected API reuses exact origin, JSON, bounded body reader, HttpOnly profile capability and operation admission. No browser profile selector or raw Qloo route. Only fixed provider hosts are used through the unchanged adapter. No dangerous HTML rendering, new logging, environment dump, real secret or new dependency. A production scan of 11 generated client JavaScript files found none of QLOO_API_KEY, DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PGlite or TasteBench fixture markers. Source/diff scans and frozen-boundary comparison accompany the final commit checks.

## TasteBench preservation

Dataset hash: 0d30276bce61ba67158f305bf5340acc51f53ec58cc041159db6b774970bc11d.

Unchanged semantic prediction hash: 9342d7f39baec30e361f6969b77ee067787d3bbbd3dcd7d7f32058a3858f9233.

Unchanged semantic result hash: d2bebbd046c9c6004f7fe096bdad30c8074d5f7298b5d509cdee487b0c437e45.

Unchanged semantic metric hash: fb7db243bd1dc33f646fb3910f74d118f799fb9ed2a6467f5c27d3949ba38052.

The initial local M4 regression was executed before commit, with dirty working-tree provenance. It is engineering regression evidence only. A clean-head run has a different run identity because codeSha is included. No dataset, metric formula, prompt, human annotation or scientific finding was changed. Human/external-baseline environment blocks remain intact.

## Environmental proof limits

M4_LIVE_QLOO_SMOKE_ENVIRONMENT_BLOCKED — QLOO_API_KEY is absent and no local environment file exists in this workspace. No authenticated Qloo call was made and no live trajectory evidence is claimed.

M4_REMOTE_PERSISTENCE_ENVIRONMENT_BLOCKED — DATABASE_URL is absent. No hosted database, migration or unrelated project was touched. Vercel build/deployment status cannot establish persistence. GitHub PR integration CI and Vercel exact-head status are recorded separately in the completion report, rather than inferred from local success.

No M5, TasteProxy, delegated/group taste, authentication, SDK/MCP expansion, payment, booking or autonomous execution. No merge is performed by the implementation session.
