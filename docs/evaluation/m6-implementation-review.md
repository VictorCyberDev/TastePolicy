# M6 implementation review evidence

Authoritative base: `35ceed937ef0bebb88b200af6f21bcc362210cb8`. Canonical architecture was read and ADR 0011 recorded before runtime implementation. Independent guide review/merge authorization remain separate.

## Evidence boundaries

- Real Better Auth email/password signup, sign-in, secure cookies, persisted session validation and logout are exercised against local PostgreSQL SQL in PGlite. This is not a claimed external/hosted authentication event or verified email/legal identity.
- Migration chain 0001 → 0002 → 0003 → 0004 → 0005 and production repositories execute locally, including ownership FKs, immutable consent/revocations, rollback, concurrent operations and filesystem reopen. PGlite is not native hosted multi-client proof.
- SDK and actual local stdio MCP run over the versioned API with a real locally issued database-hashed test credential. No raw Qloo operation or execution authority exists.
- Browser fixtures are visibly SYNTHETIC TEST DATA. No test identity/provider fixture is a production fallback.
- M5 USER_ATTESTED_PERMISSION / DELEGATE_ATTESTED history remains unchanged. Authenticated sharing is a separate provenance boundary.

## Regression organization

`tests/platform.test.ts` covers auth ownership, state/Passport privacy/versioning, grants/scopes/expiry/revocation, shared evaluation, credential hashing/one-time delivery/rotation, rate bounds, export separation/integrity, deletion, replay access, SQL/RLS ownership, concurrency, rollback and filesystem durability. `tests/platform-http.test.ts` covers real HTTP auth sanitization, origin/body protections, demo/account separation, API credential authority, SDK and actual MCP transport. `tests/e2e/platform.spec.ts` covers account/Passport/share/key/export/delete UI and mobile/keyboard/dark/light/reduced-motion behavior.

## Remaining environmental proof

M6_LIVE_AUTH_ENVIRONMENT_BLOCKED: no dedicated hosted auth/database/secret configuration supplied for live verification.

M6_REMOTE_PERSISTENCE_ENVIRONMENT_BLOCKED: no dedicated hosted DATABASE_URL supplied. Deployment readiness is not persistence proof.

M6_LIVE_SHARE_DELIVERY_ENVIRONMENT_BLOCKED: no external delivery configured or claimed. V1 uses explicit grants to known existing account identifiers; email/contact discovery and invitation delivery are not implemented.

Demo claiming, import, public Passport discovery, permanent-state renewal, external email verification/recovery, automatic proxy upgrade, expanded enterprise control plane and M7 are not implemented. Grant/credential expiry and hard deletion are real server/SQL boundaries; periodic physical retention cleanup requires the documented operator command.

Exact command results/counts/head/CI/deployment are reported in the completion report. This document does not infer success from a test name or a planned check.

## Historical V2 local validation

At the V2 reviewed head e5ad384db863fa5bd38260f241b3bc418e8f08f2, the local unit/integration run passed 526 tests, including 253 database tests. Migration 0005 applies from an empty database through the full chain. Format, lint (one unchanged M5 warning), strict TypeScript, production build and production audit pass; audit reports zero vulnerabilities. TasteBench contract/report reconcile with unchanged prediction, result and metric hashes. Browser and exact-head remote results are recorded in the PR/completion report after execution.

## V3 reconciliation scope

V3 reconciles positioning, separate opaque subjectRef, database mapping integrity, public receipt projection, export identity and capability/action distinction. V2 implementation decisions and captured evaluation persistence remain accepted. Exact reconciliation validation is reported on the new head in PR #10 and the guide handoff. WIN GATE NOT IMPLEMENTED; A2A RUNTIME NOT IMPLEMENTED; M7 NOT STARTED. M6 foundation is held at Win Gate, not complete or merge-ready.

V3 reconciliation local validation: 533 unit/integration tests (including 260 database tests), 54 Playwright cases, and 9 focused public-contract regressions pass. Format/lint/strict TypeScript/build/verify pass with one unchanged M5 lint warning. Production audit: zero vulnerabilities. TasteBench validate/contract/report reconcile with unchanged semantic artifact hashes. Secret/client-bundle scans and final remote exact-head CI are separately checked in the guide handoff; no hosted auth/database/share-delivery proof is inferred.
