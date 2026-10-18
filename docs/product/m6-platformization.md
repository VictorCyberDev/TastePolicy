# M6 — Taste Passport and platformization

M6 exposes the existing deterministic cultural authorization engine through authenticated, private state references. It does not create a second policy or grant execution authority. The temporary Judge Mode capability remains separate from an AUTHENTICATED ACCOUNT; no demo claim, silent conversion or state merging exists.

## Authentication and ownership

Better Auth 1.7.10 uses PostgreSQL email/password authentication and database sessions. It is the sole new direct production dependency. No hosted identity vendor, OAuth secret or email delivery service is required for this path. Email ownership and legal identity are **not** independently verified; account authentication proves control of credentials. Sharing addresses an explicitly entered existing account identifier, not an assumed email owner. Password recovery/email verification delivery and external invitations are not supplied in v1.

Production requires DATABASE_URL, a privately generated BETTER_AUTH_SECRET (at least 32 characters) and an explicit trusted HTTPS BETTER_AUTH_URL. Localhost HTTP is a development exception. Secure/HttpOnly/SameSite=Strict cookies, finite sessions, new sessions on login, logout invalidation, database auth rate limits, origin checks and body deadlines apply. Sensitive account operations require login within five minutes. Public auth JSON does not duplicate session tokens; cookies remain HttpOnly. Account endpoints recheck persisted session authority; developer endpoints require hashed-key authority. No browser-supplied user/profile ID is ownership authority.

Unclaimed temporary demo resources retain their separate capability/expiry; account deletion does not pretend to delete unassociated demo data. Account creation does not create/copy taste automatically. Explicit Passport initialization requires five distinct reviewed IDs across multiple cultural domains; the server independently validates all identities. Account state is a separate SELF lineage with no demo token. M5 demo-owned proxy histories remain separately owned, DELEGATE_ATTESTED and USER_ATTESTED_PERMISSION; they are not claimed, shared or relabeled by creating an account.

## Passport v1

`taste-passport-v1` exposes a high-entropy passportRef, SELF subject reference, immutable Passport metadata version, current state version/hash, bounded label, privacy, status/expiry, explicit input provenance and supported capabilities. Owner/user/profile linkage stays server-side. PRIVATE is the default. SHARED_BY_GRANT describes grant-based visibility, not public discovery or a promise that any grant is currently active. Every read rechecks scopes, expiry and revocation.

Metadata changes create immutable Passport versions containing the state references observed at that checkpoint. Current state references are read from the existing state engine without rewriting historical versions. The semantic hash includes schema, subject/state references, Passport version, label, privacy, expiry/status, provenance and capabilities; it excludes transport reference and issuance timestamp. Hashes are consistency checks, not signatures or tamper-proof claims.

Core account state and Passports expire after 30 days in v1. Renewal/permanent storage is not implemented. Active expiry denies new evaluation/read access; the owner may export retained expired state before physical purge. Run the documented purge command to enforce physical retention.

A Passport summary exposes no anchors, feedback, constraints, proxy subjects, group membership or provider evidence. READ_STATE_SUMMARY returns entry counts, not raw state.

## Authenticated sharing

Immutable `taste-passport-grant-v1` records exact grantor account/subject, existing grantee account, Passport, purpose, scopes, issuance and bounded expiry. AUTHENTICATED_GRANTOR_CONSENT means the signed-in grantor performed this platform action; it is not legally verified identity or relationship verification. Scopes are READ_PASSPORT_SUMMARY, READ_STATE_SUMMARY, EVALUATE_TASTE_ACTION and READ_RECEIPT, with no shared writes. Grants follow the Passport's current state until expiry/revocation; they do not freeze a historical state.

All shares expire within 30 days and no later than Passport expiry. Immutable revocation events block subsequent summary/evaluation/receipt access. Grant and credential deletion guards prevent removal of revocation evidence to resurrect authority. Shared receipt reads are limited to evaluations attributed to the requesting grantee and the relevant grant, with READ_RECEIPT required. That scope can expose captured input anchors/context; it is not implied by reading a Passport summary. Previously downloaded copies cannot be recalled by server-side revocation.

Shared evaluations use only the grantor SELF state and the existing evaluator/provider/policy. Expected state version is mandatory. Revocation/deletion and evaluation serialize under the same account locks; locks spanning two accounts use stable ID ordering. No M5 proxy/group state is mixed in. Historical owner replay remains available after grant revocation while data remains retained; revoked grantee access is denied. Sharing conveys permission to ask TastePolicy, never purchase/booking/message/private-data execution authority.

## Developer surfaces

The versioned API provides Passport summary, evaluate, captured receipt and evaluation status. Server-only opaque keys have an identifier plus 256-bit secret, displayed once. Only hash/metadata persist, including in idempotency records. PASSPORT_READ, TASTE_EVALUATE and RECEIPT_READ are explicit scopes. Keys expire within 30 days and support immutable revocation and atomic rotation. A completed issuance retry returns its original durable metadata without re-revealing or regenerating the secret. New rotation of an already revoked key fails closed.

API request rate is 30 per owner per UTC minute; evaluation quota is 100 per subject/UTC day, across API/session/shared use. Fixed windows can burst at boundaries. Existing process admission, 16 KiB / three-second body read, provider deadlines and call ceilings remain. One evaluation uses ordinary entities + candidate Insights; independent blocks skip provider work. There are no automatic SDK/provider retries. Crash after external work but before commit can cause repeat work on explicit retry; exactly-once delivery is not claimed.

The repository TypeScript SDK is a thin server client, not an npm release or browser policy engine. Local stdio MCP exposes six semantic operations over the same API and explicit developer credential. No raw Qloo proxy or remote MCP endpoint exists. Optional list-accessible-Passports/stability tools are not claimed as implemented. See the developer contract for exact tools.

`taste-authorization-response-v1` contains references, decision/basis, unresolved factors, captured receipt reference and `taste-continuation-v1`. ALLOW permits recommend/add_to_draft; ASK requests clarification; REJECT says do_not_proceed/offer_repair; UNAVAILABLE says do_not_assume_negative_preference. Automatic retry is false. These are cultural continuation semantics, not actual repair/clarification execution or transaction authority.

## Export, deletion and retention

Fresh authenticated owner sessions can request `taste-passport-export-v1`. It includes origin Passport/subject references, bounded Passport metadata, immutable explicit SELF state versions/signals/constraints/feedback/provenance and captured receipt references. Provider material is normalized entity/provenance references only, with no raw payloads. Proxy state and group authorization records are separately marked excluded, never flattened into SELF. No import is implemented or implied; unsigned/tampered external archives cannot enter state.

Export manifests and captured reference sets commit atomically. Replays reconstruct the same material from immutable snapshots and validate the semantic hash; new evaluations do not silently alter an old export. The hash excludes export issuance/request identifiers and includes origin identity, material state/version and provenance references. No export contents are logged or served at a public URL. The owner can download the direct authenticated result before deletion; export is not mandatory to delete. Raw provider redistribution rights are not assumed.

Delete Passport requires exact destructive confirmation and fresh authentication. It physically purges that state/receipts, removes its grants and revokes account developer credentials; the login account remains. Delete account also removes the auth identity/password/session/credential records and all owned state. Owner-profile purge invokes existing proxy/group cascades; unrelated users' state is preserved. Minimal non-content account-deletion digests expire after 30 days. No full private state is retained under a hard-deletion claim. Purged receipts become unavailable; historical decisions are not rewritten into another outcome. Account deletion invalidates authentication, so unauthenticated post-delete retries cannot recover private operation results.

Run `npm run db:purge:platform` periodically on the dedicated database: expired profiles (including M5 descendants), sessions, deletion tombstones and old rate buckets are purged. Credential metadata may remain for the active account's audit until account deletion; expired/revoked credentials cannot authenticate. No automatic hosted scheduler or retention execution is claimed merely by a successful deployment.

## Verification boundaries

Migration 0005 follows unchanged 0001–0004. Composite account/Passport/profile/state/evaluation/grant FKs, immutable history, revocation-delete guards, RLS and revoked PUBLIC privileges protect ownership. The trusted server role must be permitted to access these tables; browsers never receive DB credentials.

Local tests execute Better Auth signup/sign-in/logout and real migration/repository SQL through PGlite, including concurrency/rollback/filesystem reopen. This is not hosted/native multi-client PostgreSQL proof. Live authentication, remote persistence and external sharing delivery are separately reported; no production user/consent/provider success is fabricated. All synthetic browser transport evidence is labeled SYNTHETIC TEST DATA.

M1–M5 thresholds, provider semantics, Cultural Receipt v1, ContextGraph hashing, TasteTrajectory and TasteBench remain unchanged. M7 enterprise administration, billing, fleet controls and commercial analytics are absent.
