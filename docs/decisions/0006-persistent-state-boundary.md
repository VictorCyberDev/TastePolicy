# M2 — Versioned state, scoped correction and captured evidence

Design written before persistence implementation against fd0641fcf304528e1ea322f40a35364b12a2d0b4. Canonical architecture v2 read completely. M2.5 is excluded.

## Frozen boundaries

M1 provider, policy, thresholds, receipt v1 builder/schema, environment validation, body reader, quota guards, verifier and M1.6 gateway/stdio/proof remain unchanged. M2 wraps evaluateAction. The immutable Cultural Receipt v1 remains the cultural component inside an explicit `taste-state-evaluation-v1` envelope. An independent user hard block can yield REJECT with no fabricated v1 receipt. Existing routes and Judge Mode remain available.

## Storage and repositories

Use PostgreSQL via pinned node-postgres, not Supabase REST or Auth. A private `tastepolicy` schema has deny-by-default RLS and revoked PUBLIC privileges. Only a trusted server database role may connect; browser never contacts tables. A dedicated DATABASE_URL is optional and server-only; unconfigured runtime has no memory/file/mock fallback. PostgreSQL is available locally for actual adapter tests; remote deployment is separately verified or marked blocked.

TasteStateRepository, MutationRepository, FeedbackEventRepository, EvidenceRepository, ProposalRepository, ReceiptRepository and DemoSessionRepository remain separate interfaces grouped by a transaction-scoped unit of work. Tables: taste_profiles, taste_state_versions, taste_signals, feedback_events, mutation_records, decision_contexts, agent_proposals, provider_evidence_bundles, provider_evidence_items, cultural_receipts, demo_mutation_sessions. Normalized bounded JSON carries typed values; relational keys bind every record to profile/version. No demographic or personal identity data.

## Atomic mutations

A profile row lock serializes writes across processes. Inside one client transaction, check capability/profile/expiry, then idempotency BEFORE expected version. Same key/canonical request hash returns original result; changed payload conflicts. Version N+1, feedback, signal snapshot, mutation record and profile head commit together. No silent retry/merge. Failures roll back. Versions and child snapshots are insert-only; canonical sorted serialization and SHA-256 exclude generated IDs/timestamps from request hashes. State hashes include sorted semantic entries. Repositories return detached snapshots. SQL uniqueness and deferred foreign keys protect profile/version/mutation bindings.

## Feedback and applicability

Scopes: exact candidate, exact context key, exact domain, explicit global. Persistence: EPHEMERAL stores an expiring event only without new durable state; CONTEXT_SCOPED requires CONTEXT; DOMAIN_SCOPED requires DOMAIN; DURABLE retains its explicit scope until removal/expiry. Global durable feedback requires a separate explicit confirmation. SPECIFIC_DISLIKE creates only an exact-candidate exclusion (candidate scope); TOO_EXPENSIVE creates maximum price only when explicit amount/currency is supplied. Other categories are descriptive correction, never inferred hard blocks or executable free text. Bounded optional comments are provenance only. Initialization stores exactly five human-reviewed resolved identities; no provider inference is promoted to preference.

## Evaluation, replay and graph

Validate action/context first. Exact exclusion or known same-currency maximum-price violation rejects independently before provider construction. Otherwise call existing evaluateAction with five initial likes; unavailable cultural evidence stays UNAVAILABLE. Cultural REJECT outranks unresolved price ASK, which outranks ALLOW. Unknown/mismatched-currency required price means ASK only after evidence succeeds. Capture the immutable state version, context, logical agent, proposal, normalized evidence and envelope atomically. Captured replay uses those records only; new retrieval is a fresh evaluation. M1 v1 component retains its original cultural decision even when surrounding context overrides it.

ContextGraph is a typed deterministic projection with source IDs, sorted nodes/edges and semantic hash; no random layout identity. Taste Map, Decision Focus, State Diff and Evidence/Provenance Inspector consume snapshots. Diff uses stable signal IDs and semantic values, not row position. Browser graph failure is isolated from authorization. No graph storage or Qloo graph replication.

## Capability security, sharing and retention

A random 256-bit server-generated capability is stored only as SHA-256 and delivered in an HttpOnly SameSite=Strict cookie, Secure on HTTPS, scoped to /api/state. One cookie binds one temporary profile; no browser profile selector. Strict same-origin is mandatory, JSON only, inherited 16KiB/3-second body limits, process budget plus DB-backed per-session mutation counts. Sessions/profiles expire after 24 hours; scheduled privileged purge is documented and opportunistic cleanup runs on creation. Session is an isolated demo capability, not user authentication. Authorized logical Agent A and Agent B in the same capability consume the same subject/version; caller agent labels never grant access. No public persistent CLI writes.

## Operational limits

No automatic migrations, no modification of unrelated Supabase projects, no insecure TLS bypass, no logged connection strings, bounded pool/connect/query timeouts. Migration/purge tools are explicit operator actions. Local database tests prove actual transactions; test repositories are confined to tests. Public session creation still needs deployment protection for abuse resistance; process quotas are not distributed global admission control. No remote production persistence claim without evidence.
