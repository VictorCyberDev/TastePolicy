# M2.5 implementation evidence

Checkpoint: 2026-10-16. Authoritative base: `067cc0bda3fd6effbda275c0523f645500d76305`. Canonical architecture v2 and M2 contracts/ADR were read before ADR 0007 and implementation. This is local implementation evidence, not independent acceptance or merge authorization.

## Verified locally

- `npm ci` completed; no dependency or lockfile change.
- Unit/integration suite: 292 passing, including all 251 pre-existing cases plus 40 interactive PostgreSQL/service/security cases and one UI retry case.
- `npm run test:database`: 92 passing (52 preserved M2 + 40 interactive). Tests apply actual migrations 0001 then 0002 and execute production repository SQL through development-only PGlite. Fresh schema creation, composite ownership/version FKs, invalid parent lineage, duplicate operation keys, immutable records and RLS flags are covered.
- Filesystem close/reopen persists both clarification and repair results. Existing M2 durability and genesis/mutation lineage cases remain passing.
- Write-stage failure injection after clarification, repair, evidence and verification-receipt insertions demonstrates transaction rollback without half-written audit history. Expiry during repair also rolls back verification/audit writes.
- Retry tests check stored original result before stale state/provider construction, changed-payload conflict and serialized concurrent same-key calls. Native networked multi-client contention is not established by the serialized PGlite test pool. A DB rollback cannot undo prior external requests.
- Clarification covers price, currency mismatch, UNKNOWN, cultural disposition, chained price/borderline questions, deterministic priority, stale state and captured truth preservation. Answers never write Taste State or feedback.
- Repair covers discovery ordering/rank ties, independent exclusion preservation, candidate-specific verification, verified ASK/ALLOW, bounded miss, price condition, provider failures, slow-discovery deadline, four-call ceiling and captured replay. Cross-profile plan/answer/repair/replay are denied.
- HTTP coverage includes exact origin, absent/expired capability, oversized JSON, persistence missing and safe error codes; inherited body-read limits and process admission remain intact.
- UI coverage checks no automatic operation and stable client idempotency key after a lost response. Playwright covers 26 cases (all 18 preserved + eight interactive), including explicit clarification, UNKNOWN, all repair statuses, stale conflict, captured replay and explicit separate adoption.
- Browser responses are visibly labeled SYNTHETIC TEST DATA. Desktop and 390px mobile screenshots are ignored test artifacts, not live provider proof. Keyboard activation, reduced motion, dark/light, bounded structured evidence and no horizontal overflow are exercised.
- High-specificity credential source scan and client secret/unsafe HTML scan found no matches; production audit found zero vulnerabilities. No Qloo call, hosted DB operation or credential provisioning occurred. No production fixture/PGlite fallback.

The repository verify gate runs formatting, lint, strict TypeScript, all unit/integration tests and production build. Exact-head CI and Vercel outcomes are reported separately by the implementation handoff; a preview build is not proof of hosted persistence or live Qloo behavior.

## Environment limits

`M2_5_LIVE_QLOO_SMOKE_ENVIRONMENT_BLOCKED`: no QLOO_API_KEY is configured in this local runtime. No new live request or response is claimed. Accepted earlier provider behavior is reused unchanged.

`M2_5_REMOTE_PERSISTENCE_ENVIRONMENT_BLOCKED`: no dedicated DATABASE_URL is configured locally. Migration 0002 has not been applied to a hosted database; native multi-client lock contention and a real browser→hosted SQL→provider interaction require the dedicated environment.

## Preserved boundaries and deliberate limits

Migration 0001, Cultural Receipt v1, M1/M2 policy, graph/hash, Qloo wire adapters/thresholds, original verifier, M1.6 gateway and CLI are unchanged. The M2 repository factory/interfaces receive additive interactive repositories; StatePanel only mounts the new panel and delegates explicit adoption to the existing evaluation endpoint. No new dependencies.

Repair searches one candidate dimension, verifies at most one candidate and uses at most four provider calls with no retry. It does not claim global optimality or exhaustive impossibility. Original price cannot transfer to a replacement; external price requirements can make repair unverifiable. Only original M2 REJECT repair is supported; interactive rejection and exploration permissions are not generalized into a new action language. Answers stay interaction-scoped; conflicting currency constraints remain uncertain without FX. M3/TasteBench, TasteTrajectory, TasteProxy, autonomous execution and SDK/MCP expansion are not implemented.
