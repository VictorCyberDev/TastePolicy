# M5 — TasteProxy and explicit group authorization

TasteProxy is a separately identified, pseudonymous model managed under **USER_ATTESTED_PERMISSION**. Permission is attested by the current user and is not independently verified. No external subject authentication, signed consent, relationship inference or sensitive-trait modeling exists. SELF and PROXY are different subjects. A group is a policy object, never a merged preference profile.

## Independent models

SELF maps uniquely to the existing capability-owned profile. Each PROXY gets its own profile, genesis, immutable state versions, hashes and evaluations. No public demo session is issued to that profile. The owner cannot substitute its ID into SELF operations. Exactly five distinct, explicitly reviewed identities spanning multiple domains are required. The server independently looks up those five IDs and stores normalized identities, not browser names. Provenance is DELEGATE_ATTESTED; engine-compatible EXPLICIT_LIKE does not claim the subject personally confirmed an anchor. Nothing is copied from SELF or inferred from owner feedback, trajectories or demographics.

Creation requires MODEL_MANAGEMENT and TASTE_EVALUATION scopes. GROUP_EVALUATION is optional and required for new inclusion and aggregation. Grants are immutable and expire within the owner's existing temporary retention (at most 24 hours). Immutable revocation events deny new work. There is no regrant or external-consent workflow. Anchor replacement requires identity review, current expectedStateVersion and idempotency key; exactly five remain. No delegated clarification, feedback learning, repair or trajectories are supplied.

## Separate evaluation, then aggregation

1. Evaluate SELF through the existing authorization surface.
2. Evaluate each PROXY separately for the same candidate and structured context. The internal extracted evaluator reuses accepted five-signal/candidate validation, Qloo adapter, deterministic state policy and Cultural Receipt v1. One proxy evaluation has the ordinary entities + candidate Insights budget (two calls maximum; independent hard blocks skip provider work). No group endpoint fans out Qloo calls.
3. Create a group of 2–5 unique owned subjects; membership changes create immutable versions.
4. Select exactly one completed evaluation per member and the expected group version. Aggregation checks ownership, active GROUP_EVALUATION permission, candidate ID/type, canonical context hash and current state version/hash. Missing execution fails structurally (GROUP_EVALUATION_INCOMPLETE), not UNAVAILABLE. Stale state fails GROUP_MEMBER_STATE_STALE.
5. Apply **UNANIMOUS_NO_VETO_V1** to final member decisions only:

| Condition, in precedence order | Group outcome | Basis                         |
| ------------------------------ | ------------- | ----------------------------- |
| Any REJECT                     | REJECT        | MEMBER_REJECT                 |
| Else any UNAVAILABLE           | UNAVAILABLE   | MEMBER_EVIDENCE_UNAVAILABLE   |
| Else any ASK                   | ASK           | MEMBER_CLARIFICATION_REQUIRED |
| All ALLOW                      | ALLOW         | UNANIMOUS_ALLOW               |

A known veto still determines REJECT when another member is UNAVAILABLE; all member results remain visible. No owner privilege, weights, majority voting, raw-affinity arithmetic, group score or compatibility percentage exists. Equal veto/decision rights are an explicit fairness-aware design property, not scientifically validated universal fairness. ASK is unresolved; a delegate cannot silently answer as the subject. UNAVAILABLE is missing evidence, not dislike.

## Audit and lifecycle

proxy-authorization-v1 wraps the existing state evaluation and unchanged base Cultural Receipt. group-authorization-v1 stores canonical member snapshots, references, policy, categories, candidate/context and semantic hash. Members sort by subject ID; input order and raw affinities cannot determine group policy. Group semantic hashes exclude issuance ID, timestamp and request ID while retaining the captured member references. Hashes are integrity consistency checks, not signatures/tamper-proof guarantees.

Proxy/group replay makes zero Qloo calls. It rereads captured state/evaluations, validates linkage and hashes, and recomputes decisions. Historical replay works after state advancement/revocation; current permission activity is returned separately. A historical ALLOW never restores current permission. New authorization always checks freshness and active permission.

Proxy deletion is a tombstone: model access and new authorization are denied immediately, the display label is redacted in normal inspection, affected groups receive a new membership version or close if fewer than two members remain. Proxy state-profile audit retention is linked to owner expiry even when permission expires earlier. Historical private state/receipts/grants remain only until owner expiry/purge to preserve audit integrity. This is not a claim of immediate physical erasure. Deleting a group closes it without deleting subject states. Owner purge deletes proxy state profiles and cascades all M5 data; no orphan proxy lineage remains.

All M5 writes serialize under the existing owner/session lock, with proxy profile locks for state access. Operation-scoped completed idempotency precedes provider construction, stale-version checks and permission revalidation: same key/payload returns the original completed result; changed payload conflicts. These retries are historical, not fresh authority. SQL writes are atomic. A crash after external work but before durable commit can repeat that external work on retry; exactly-once Qloo delivery is not claimed.

## Operations and deployment

Semantic operations are POST `/api/state/subjects/proxy/{resolve,inspect,create,update,revoke,delete,evaluate,replay}` and `/api/state/subjects/group/{inspect,create,update,delete,authorize,replay}`. The existing HttpOnly capability cookie identifies the owner; browser-provided subject/group IDs are looked up under that owner. No browser-supplied ownerProfileId/stateProfileId is accepted as authority. Exact-origin, JSON, body/deadline limits and quota apply. GroupService accepts no provider factory.

Apply migrations in order on a dedicated database: `npm run db:migrate`, `npm run db:migrate:interactive`, `npm run db:migrate:trajectory`, `npm run db:migrate:subjects`. Migration 0004 adds composite ownership/state/evaluation/candidate/context FKs, immutable records, deferred coverage, RLS and revoked PUBLIC privileges. No direct browser database path exists.

PGlite tests execute these migrations and production PostgreSQL repository SQL, including rollback and filesystem reopen; they are not hosted/native multi-client PostgreSQL proof. Live proxy smoke and hosted persistence need separately configured secure environments. Vercel deployment success alone does not establish database persistence.

M1–M4 policy/provider/receipt/ContextGraph/TasteBench/trajectory contracts are preserved. M6 authentication, cross-account consent, sharing, Passport, SDK/MCP expansion, portability and real subject verification remain unimplemented. No execution, payment, booking, communication, legal, account or physical-consent authority is granted by any cultural ALLOW.
