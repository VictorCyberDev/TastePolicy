# M2 — Persistent Taste State, ContextGraph and scoped feedback

M2 wraps the accepted cultural evaluation without changing its provider contract, five-identity invariant, experimental thresholds or Cultural Receipt v1. It adds immutable state snapshots, structured user correction, context policy, captured replay and inspectable deterministic projections. No M2.5 functionality.

## Setup and persistence

Use a **dedicated TastePolicy PostgreSQL database**, including Supabase Postgres if separately provisioned. Set DATABASE_URL privately on the server. Never use NEXT_PUBLIC_DATABASE_URL or browser table clients. Run `npm run db:migrate` exactly once against a new dedicated database. Migration fails safely if schema already exists; it does not silently overwrite. Runtime never migrates. No live database/project has been modified by this implementation.

Use a trusted role owning the private tastepolicy schema, or a separately provisioned least-privilege server role with schema/table rights and deliberate RLS policies. No anon/authenticated/public grants or policies exist; all eleven tables enable RLS. No direct client access, Supabase Auth, REST dependency or service-role browser key. Hosting requires validated database TLS; never disable certificate verification. The pool is bounded to three connections with five-second connection/query deadlines. Migration/purge errors are fixed safe labels.

With no DATABASE_URL, the existing M1/M1.6 demo works and M2 explicitly says persistence not configured. No runtime test repository, PGlite, memory or file fallback is available. PGlite is a pinned **development-only PostgreSQL WASM engine** used for actual SQL constraint/rollback tests, not a mock of SQL behavior. Native pooled Postgres concurrency and remote hosting remain separate operational validation targets.

Run `npm run test:database` for migration, adapter, transaction, constraint, expiry, isolation and deterministic projection coverage. CI needs no secret. Run `npm run db:purge` hourly using a trusted operator/scheduler to remove expired profiles and cascading records. Opportunistic purge also runs when creating a demo session. Sessions/profiles expire after 24 hours even without purge; expired data is inaccessible, but physical removal still requires purge activity. No permanent promotion in M2.

## State and feedback

Version zero is empty. Save exactly five reviewed explicit signals through an intentional UI action. Initialization is not automatic learning; human supplied identities are validated again by the unchanged M1 provider service at evaluation. Each durable state change inserts N+1, preserving old snapshots, parent, mutation ID, sorted entries and SHA-256. Removal of a correction or constraint creates another version; initial five explicit likes are preserved in this bounded demo.

Feedback categories: SPECIFIC_DISLIKE, TOO_EXPENSIVE, WRONG_CONTEXT, WRONG_AESTHETIC, WRONG_ATMOSPHERE, TOO_SAFE, TOO_ADVENTUROUS, OTHER. Comments are capped at 300 characters and never executed. Only an exact SPECIFIC_DISLIKE exclusion and an explicit TOO_EXPENSIVE maximum amount/currency produce constraints. Other correction categories remain descriptive; no invented scoring effect.

| Scope             | Exact applicability                                      |
| ----------------- | -------------------------------------------------------- |
| CANDIDATE_ONLY    | Same candidate UUID                                      |
| CONTEXT           | Same explicitly supplied context key                     |
| DOMAIN            | Same supported target domain                             |
| GLOBAL_PREFERENCE | Explicit broad preference; durable requires confirmation |

| Persistence    | Behavior                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------- |
| EPHEMERAL      | Store a 30-minute descriptive event only; no state version or durable constraint is created |
| CONTEXT_SCOPED | Persistent correction only in CONTEXT scope                                                 |
| DOMAIN_SCOPED  | Persistent correction only in DOMAIN scope                                                  |
| DURABLE        | Keeps its explicit scope until removed or profile expiry                                    |

EPHEMERAL is an event-only exception to state versioning, not a hidden permanent preference. Historical events remain bounded by profile retention. Feedback scopes do not infer demographics or broaden themselves.

## Transactions and retry

Every mutation carries expectedStateVersion, a bounded idempotency key, structured payload and request ID. Capability binds the profile server-side; browser never sends a profile selector. A profile lock plus one-client transaction protects snapshots, feedback, signals, mutation result and head. Same key/canonical payload replays the original result before checking stale version; changed payload conflicts. Stale unrelated writes return STATE_VERSION_CONFLICT, no silent retry/merge. SQL foreign keys, uniqueness and immutable-update triggers defend the relational contract. Canonical request hashes exclude generated IDs, timestamps, comments outside the payload and request IDs; comments inside structured payload are retained as provenance and therefore participate in retry identity.

## Policy and evidence

1. Validate proposal, exactly five distinct selected identities and candidate separation.
2. Applicable exact exclusion or known same-currency max-price violation → independent REJECT without constructing Qloo.
3. Otherwise use existing evaluateAction; required evidence failure → UNAVAILABLE.
4. Cultural REJECT outranks unknown required price; unknown/mismatched-currency price → ASK after successful cultural evidence; otherwise existing cultural outcome.

No score rounding or threshold changes. Different currencies are unresolved, never silently converted. Context keys and price are caller-supplied structured claims, not verified commerce data. Cultural authorization grants no transaction/execution authority.

`taste-state-evaluation-v1` records profile/state/hash, logical agent, action/context, decision/basis/rules, request/time and an available/unavailable cultural component. Its available component is an unchanged Cultural Receipt v1 retaining the original cultural decision even if context changes the envelope outcome. Independent user blocks have no fabricated cultural receipt; culturalRequest explicitly records SKIPPED_INDEPENDENT_BLOCK rather than implying a provider request occurred. Provider bundle stores normalized candidate affinity, explainability/completeness, request/receive times, immutable state signal references and accepted M1 provenance only. Captured replay reads the original immutable state/evidence/time and makes zero provider calls. Fresh evaluation has a new evaluation ID; replay is labeled recorded.

## ContextGraph and agent portability

ContextGraph is a typed projection, not a database or Qloo graph. Nodes: PROFILE, EXPLICIT_PREFERENCE, CONSTRAINT, FEEDBACK, CONTEXT, PROPOSAL, CANDIDATE, PROVIDER_EVIDENCE, DECISION, RECEIPT. Relationships are sourced and limited to actual recorded facts. Natural/source IDs, sorting and canonical SHA-256 make semantics independent of layout and array order. Taste Map uses current state; Decision Focus and provenance use the captured evaluation state; State Diff compares stable signal identities with explicit additions/removals/constraint changes/feedback IDs. UI uses accessible lists and disclosures, no physics or 3D renderer. Core evaluation does not depend on graph construction/rendering.

Logical Agent-A and Agent-B in the same session consume the same subject profile. Agent labels are bounded provenance, not authentication or access grants. Tests demonstrate version N consumed by Agent-A, scoped exclusion to N+1, and Agent-B consuming N+1 with independent REJECT. This proves state portability, not improved understanding or preference accuracy. Existing stdio interface remains unchanged and has no new persistent write operation.

## Demo security and limitations

Random 256-bit capability, database hash only, HttpOnly/SameSite=Strict cookie, Secure on HTTPS, /api/state path, mandatory exact same-origin, JSON-only and inherited 16KiB/three-second body reader. No URL/browser profile authority. Session expiry is enforced on reads/writes/replay. Mutations/evaluations share a persistent 100-operation per-session ceiling; process admission limits remain inherited. Session creation is process-limited; use deployment protection/account quotas before exposing it broadly. No full authentication, user consent platform, distributed admission system or long-term multi-user security claim.

Remote database deployment and live Qloo smoke require independently provisioned secure environments. The implementation makes no remote persistence or new live Qloo claim without those checks. M2.5, clarification, counterfactual repair, TasteBench, TasteTrajectory, TasteProxy, SDK/MCP expansion, payment and execution remain excluded.
