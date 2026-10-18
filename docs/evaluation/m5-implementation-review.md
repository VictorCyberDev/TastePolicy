# M5 implementation review evidence

Authoritative base: `dd294c6ebe26803d290132fe794efb84707e7438`. Design semantics are recorded in ADR 0010 before runtime implementation. Independent guide review and merge authorization remain separate responsibilities.

## Proof boundaries

- Tests use SYNTHETIC TEST DATA, not live Qloo claims. Owner and proxy divergence is intentionally controlled to prove signal isolation, not proxy accuracy.
- The migration chain 0001 → 0002 → 0003 → 0004 and production PostgreSQL repository SQL run in PGlite. Filesystem close/reopen is local durability proof only.
- Proxy evaluation reuses the existing evaluator. Group policy consumes completed decisions; its service has no provider factory.
- No Qloo fixture is imported by production code. No group fairness score or benchmark extension is introduced.
- Optional live proxy smoke: M5_LIVE_PROXY_QLOO_SMOKE_ENVIRONMENT_BLOCKED unless separately recorded with actual evidence.
- Dedicated hosted persistence: M5_REMOTE_PERSISTENCE_ENVIRONMENT_BLOCKED unless separately verified. Deployment is not persistence proof.

## Regression organization

`tests/subjects.test.ts` covers independent profiles/anchors, provenance, divergent decisions, permission expiry/revocation, replay, owner purge, tombstones, immutable group versions, current-state checks, candidate/context matching, missing/duplicate coverage, composite SQL/RLS boundaries, rollback, concurrent retries and filesystem durability. `tests/subjects-http.test.ts` covers origin/content/body/credential/error boundaries. `tests/e2e/subjects.spec.ts` uses explicitly labeled intercepted HTTP evidence for separate evaluation, four group states, veto visibility, revocation, recorded replay, keyboard and narrow dark/light reduced-motion layouts. Existing M1–M4 regressions remain required.

Group policy equal rights are a deterministic design invariant. This does not establish verified external-subject permission, individual preference truth, empirical fairness, prediction accuracy or production-scale reliability. External-call crash delivery is at-least-retryable, not exactly once.

The completion report records executed command results, counts, exact head and CI/deployment statuses; do not infer a pass merely from this test plan.

## Executed local evidence

The local suite preserves all 419 pre-M5 unit/integration and 34 browser tests. M5 adds 49 SQL-backed cases and five HTTP cases (473 total unit/integration; 209 in the database command), plus 11 browser cases (45 total). Tests execute genuine deferred/FK rejection, transaction rollback and filesystem reopen. Browser transport evidence is synthetic and labeled. No native hosted multi-client or live proxy-Qloo claim follows from these checks.

TasteBench's accepted semantic artifacts remain unchanged: predictions `9342d7f39baec30e361f6969b77ee067787d3bbbd3dcd7d7f32058a3858f9233`; results `d2bebbd046c9c6004f7fe096bdad30c8074d5f7298b5d509cdee487b0c437e45`; metrics `fb7db243bd1dc33f646fb3910f74d118f799fb9ed2a6467f5c27d3949ba38052`. Contract/report reconcile; existing human/LLM baseline environment blocks remain honest.
