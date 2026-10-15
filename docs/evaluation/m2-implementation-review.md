# M2 implementation evidence — 2026-10-14

Authoritative base: fd0641fcf304528e1ea322f40a35364b12a2d0b4. Canonical architecture v2 read completely; design ADR 0006 written before persistence code. PR #4 was independently observed merged with head 4ec40b68de86672ee1c6c0e735a5a13102a1f751; no modification of that PR or main. No M2.5 or merge authorization.

## Actual database proof

Pinned development-only PGlite executes PostgreSQL SQL and the actual production repository queries. It is not a repository mock. 48 database/domain/security tests cover eleven-table migration, immutable-update trigger, deferred profile/version/mutation foreign keys, state hash/order, concurrent retries and stale writes, four write-stage rollback injections, same-key payload conflicts, all scopes/classes/categories, explicit global confirmation, price/cultural precedence, cross-profile denial, expiry/purge, RLS denial, graph determinism, captured replay and provider exception sanitization. A filesystem-backed database was closed and reopened; the capability-bound version-one state matched exactly. This proves local PostgreSQL-compatible persistence, not a remote deployment or native networked Postgres multi-client load test.

The test-only pool serializes the WASM engine's single exclusive connection. Native PostgreSQL uses a real pg pool and row locks; native multi-client contention remains an additional hosting validation target. Native installation encountered container/package restrictions and did not provide a usable native server. No SQL was run against an existing Supabase project. No production WASM/memory fallback is installed.

## Preservation

Existing 197 unit/integration tests retained; one homepage label assertion and one browser label assertion were updated for the M2 badge without weakening coverage. The five-signal, separate candidate, provider/policy, experimental thresholds, receipt v1, verifier, environment schema, M1.6 gateway/stdio/stability/proof and canonical architecture files remain unchanged. UI imports only state domain values/types; pg and database configuration remain server-only.

## Browser and security proof

18 Chromium tests include the existing 15 plus M2 credential-free state, synthetic snapshot/projection, and synthetic feedback/version/Agent-B/replay flow. Existing outcomes, Judge Mode, receipt/comparison/stability, light/dark, keyboard, reduced motion, long evidence and 390×844 bounds remain covered. The full M2 browser flow uses explicitly labeled intercepted SYNTHETIC TEST DATA; it is not live DB/Qloo proof. Desktop and mobile synthetic screenshots were visually reviewed and stay ignored, never committed. Real production-build health returned ok/tastepolicy; the state endpoint returned safe unconfigured status after correcting the local host/origin comparison. Cross-origin and absent origins are denied. New endpoint uses the inherited byte/body-read deadlines.

Tracked/untracked text secret-pattern scan: zero findings. Built client credential identifier scan: zero findings. Production fixture/PGlite import and unsafe-HTML scans: zero findings. Capabilities are hashed in storage and excluded from JSON. Database errors, provider exceptions and HTTP errors are sanitized. Runtime npm audit: zero findings. Full audit: five pre-existing development high findings, zero critical; no force upgrade.

## Environment status

- M2_REMOTE_PERSISTENCE_ENVIRONMENT_BLOCKED — no dedicated hosted database connection is configured locally. Preview may build successfully while M2 persistence remains unavailable.
- M2_LIVE_QLOO_SMOKE_ENVIRONMENT_BLOCKED — no local private Qloo key; no fresh Qloo call made.
- Local PostgreSQL-compatible migration/integration/durability tests pass; do not label this check blocked or remote production proof.

## Deliberate limitations

EPHEMERAL is event-only descriptive provenance with a 30-minute expiry; it does not create a durable constraint or state version. Descriptive feedback is not scored. Initial explicit likes remain fixed in this bounded demo; corrections/constraints may be removed through new versions. Session creation is process-limited, not a distributed public admission solution; deployment protection and scheduled purge remain operator requirements. Graph UI is a semantic list/relationship inspector rather than decorative visualization. No authentication, demographic inference, learning claim, signed receipt, public persistent CLI mutation, new MCP or later milestone feature.

Final exact-head CI and Vercel are reported in the completion checkpoint; this historical implementation record is not merge authorization.
