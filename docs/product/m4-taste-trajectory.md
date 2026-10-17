# M4 — TasteTrajectory

TasteTrajectory is intentional, user-controlled cultural exploration. An explicit target is intent, not a new preference. Current position is an immutable Taste State version/hash, its five reviewed EXPLICIT_LIKE anchors, context and applicable constraints. No numeric taste position, embedding, cultural distance or individual-liking prediction is computed.

## User flow

1. Start/resume the accepted temporary demo profile and explicitly save five reviewed signals.
2. In TasteTrajectory, resolve a brand, destination or place. Inspect ambiguous identities and explicitly confirm the selected identity. Saving creates an EXPLORATION_INTENT and immutable state N+1. The server independently looks up the identity; browser names are not authority.
3. Choose CONSERVATIVE, BALANCED or OPEN tolerance. Context is fixed for this trajectory; create a new intent to change target/context/tolerance.
4. Start at STRICT, or explicitly select a broader allowed level. Generate five target-anchored discovery views. Nothing calls Qloo automatically.
5. Inspect UNVERIFIED bridge support and membership. Evaluate one bridge separately using ordinary M2 authorization and all five original likes. Discovery cannot authorize.
6. ALLOW can be explicitly selected as a policy-authorized exploration step. ASK is a stretch requiring accepted M2.5 clarification. REJECT and UNAVAILABLE cannot become authorized steps. Required candidate price is handled by existing clarification; no price is transferred from another candidate and no FX is performed.
7. Record trajectory-local feedback; generate the next bridge plan explicitly. Persistent corrections remain separate M2 actions.
8. Evaluate the target itself. ALLOW exposes DIRECT_TARGET_AVAILABLE; do not invent intermediate bridges. Explicit selection completes the trajectory for that state/context. M2.5 final ALLOW may also be selected. Completion records cultural authorization and selection, never booking, payment, travel, enjoyment or legal/account authority.

## Five-view heuristic

For sorted original anchors S1–S5 and selected target T, discover with T2345, 1T345, 12T45, 123T5 and 1234T. Each request contains exactly five distinct UUIDs; each original anchor is omitted once. Target cannot equal an anchor. Use existing infer directly, not discover (which would add identity lookups). One provider instance makes exactly five concurrent bounded infer operations, maximum five HTTP calls, with unchanged per-call deadline/transport ceiling. No retries or authorization calls in planning. Failure in any required query gives TRAJECTORY_UNAVAILABLE with no partial bridge projection.

Support count is query membership count, 1–5. Order by support descending, best provider rank ascending, entity ID ascending. Per-query normalized evidence, raw affinity, explainability and provenance are captured separately. Cross-query affinities are never averaged or used as ordering tie-breakers. Target, anchors, duplicate identities, unsupported target types and applicable independent exclusions are not returned as bridges. No scientific confidence/proximity claim.

STRICT requires support >=4, MODERATE >=2, BROAD >=1. CONSERVATIVE permits STRICT only; BALANCED permits through MODERATE; OPEN permits through BROAD. TOO_SAFE moves one allowed level wider, ABOUT_RIGHT stays, TOO_ADVENTUROUS moves one stricter, STOP_EXPLORING terminates. A feedback event does not itself call Qloo. Empty results stay NO_BRIDGE_AT_CURRENT_BREADTH; no silent widening or tolerance upgrade. Thresholds remain >0.80 ALLOW, inclusive 0.50–0.80 ASK, <0.50 REJECT.

## Persistence and operations

A new dedicated database applies 0001, then 0002, then 0003. An existing database with 0001/0002 needs only:

```sh
npm run db:migrate:trajectory
```

This is an explicit, one-time operator action. Runtime never migrates and no hosted migration is implied. Use only a dedicated TastePolicy server DATABASE_URL. No browser database client/credential and no unconfigured memory/PGlite/fixture fallback. Existing 24-hour capability/profile expiry and purge cascade trajectory records.

TrajectoryRepository is separate from state/feedback/interactive repositories. Intent, generation, candidate and event SQL tables use composite ownership/version FKs, RLS, revoked PUBLIC access and immutable update triggers. New intent state/version/mutation/trajectory writes are atomic. Completed plan evidence/candidates/idempotency result are atomic; feedback and selection events are atomic. Session then profile locks preserve accepted ordering. Same operation key/payload returns the original completed record before stale checks or provider creation; changed payload conflicts. Keys are profile- and operation-scoped. Process crash/rollback before commit may repeat external provider work on an explicit retry; exactly-once Qloo delivery is not claimed.

POST `/api/state/trajectory/{resolve,create,read,plan,evaluate,event,replay}` inherits the demo capability cookie, expiry, exact-origin/JSON/body limits, process admission and persistent operation ceiling. No profile selectors or raw-provider proxy. Candidate evaluation delegates to TasteStateService.evaluate. Selection verifies actual same-profile/version/context evaluation and optional same-root M2.5 clarification; SQL also enforces relational ownership. Receipts remain unchanged.

State advance makes plans stale. Refresh is explicit and preserves target/context/tolerance while binding new state/hash; old generations never change. Removing the intent via existing REMOVE creates another immutable state version and stops new planning. Resume an owned trajectory using its displayed trajectory ID; no browser storage of provider credentials.

Historical replay reconstructs support, order, breadth, semantic hash and captured selection statuses, validates linked evaluations and makes zero Qloo requests. Tampering fails INTEGRITY_ERROR. Evidence is labeled CAPTURED; this does not imply a new live call. Existing ContextGraph v1 omits exploration-intent entries rather than misclassifying them as explicit preferences; old-input graph hashes are preserved. Existing TasteBench dataset/formulas/prompts remain unchanged.

## Honest limits

Five-view support is a bounded heuristic, not a validated measure of cultural movement or recommendation superiority. No preference manipulation, durable learning from trajectory feedback, automatic execution, M5/TasteProxy/group taste, authentication or platform expansion. Development-only PGlite tests execute production SQL; they do not prove hosted/native multi-client PostgreSQL behavior. Vercel build success does not prove persistence or live Qloo trajectory behavior. See the implementation review for actual verification/environment status.
