# M2.5 — Interactive authorization over captured truth

Design recorded before feature implementation against 067cc0bda3fd6effbda275c0523f645500d76305. Canonical architecture v2 and M2 product/ADR read completely. M1 through M2 evaluator, policy, receipts, graph hashes and CLI remain authoritative. No M3/TasteBench, calibration, LLM or execution.

## Clarification

A pure deterministic planner consumes an owned captured M2 evaluation, its immutable state and an optional prior clarification result. ASK yields one factor: missing price first, currency mismatch second, cultural borderline last. Stable constraint signal ID orders equally prioritized factors. Plan IDs hash evaluation/version/parent/factor. Other outcomes yield NO_ACTIONABLE_CLARIFICATION; advanced state yields STALE. Planning has no provider or state write.

Answers are strict money/UNKNOWN or ACCEPTABLE/UNACCEPTABLE/STILL_UNSURE. The server recomputes the plan and validates its identity. Reevaluate captured cultural evidence plus original state and answered context through stateDecision. A human disposition may resolve only cultural ASK after all hard/context checks; it never overrides REJECT or UNAVAILABLE. Original v1 receipt and M2 envelope remain unchanged inside interactive-authorization-v1. Price then cultural questions use an explicit parent clarification chain. No answer creates a Taste State entry, feedback or new version. Conflicting-currency requirements remain unresolved; no FX or price invention.

## Persistence, stale state and retry

Migration 0002 adds explicit clarification_records and repair_records; 0001 is unchanged. ClarificationRepository and RepairRepository are separate transaction-scoped interfaces. Composite FKs bind original evaluation AND version AND profile; clarification parents bind the same root/version; repair verification links an actual same-profile/version M2 evaluation. Unique profile/idempotency keys per operation, bounded hashes/answers and immutable audit records. RLS/revoked PUBLIC privileges match M2. No browser DB access or new credential model.

Reuse the M2 cookie capability and session/profile lock order. Check stored successful idempotency replay before stale rejection or provider construction; changed canonical payload conflicts. New work requires the captured version to remain current; no rebasing. Answer/result writes and repair/verification/evidence writes are atomic. Per-profile serialization prevents simultaneous successful requests from repeating provider work. A rolled-back transaction cannot undo an external provider request; crash/rollback may require a new bounded attempt, and no exactly-once external delivery claim is made. No retries are added. Holding the lock for bounded repair serializes this small demo; native hosted lock contention remains an operational check.

## Counterfactual search and minimum change

Only candidate substitution is searched: exactly one proposal field changes, action/domain/context/state/exclusions stay fixed. Filter the original and independently excluded candidates. Sort normalized discovery rank then stable ID, never cross-request affinity. Verify at most one eligible candidate through existing candidate-specific evaluateAction plus stateDecision. Exploration permission is deferred. Context completion belongs to clarification, not a REJECT bypass.

No transferable candidate price source exists. If original price context or an applicable maximum-price rule prevents verifying replacement price, return NO_VERIFIABLE_REPAIR with an explicit condition; never reuse the old candidate's price for a new identity. Check replacement-specific constraints too. Price-only rejection has an honest condition, not a fabricated suggestion.

## Exact provider bound

Existing discover = entities + Insights = two calls. One candidate-specific evaluateAction = entities + Insights = two calls. Total maximum FOUR, one provider instance, versus the unchanged five-call transport ceiling. No retries, no loop. A wrapper also caps semantic calls at four and enforces an operation start deadline. Start verification only with at least two 15-second call windows plus overhead remaining in the existing 55-second operation window; otherwise UNAVAILABLE/timeout. This reserves route overhead within 60 seconds. Discovery alone never yields REPAIR_AVAILABLE.

Statuses distinguish REPAIR_AVAILABLE (verified ASK/ALLOW), NO_VERIFIED_REPAIR_WITHIN_BOUND (bounded miss, not impossibility), NO_VERIFIABLE_REPAIR (missing external fact), UNAVAILABLE (provider failure), STALE (state advanced). Original REJECT is never replaced by a repair-search failure. Captured verification may be persisted as an M2 evaluation for audit, but adopting the proposal requires a separate explicit normal evaluation. No action execution or automatic state mutation.

## Replay and presentation

Historical clarification/repair reads captured records only, no Qloo; live search and captured evidence remain distinct. UI sends no profile selector, inherits /api/state cookie path, exact origin, body deadline/size, expiry, process admission and persistent session operation ceiling. New APIs are semantic demo operations, not raw Qloo passthrough. Comparison, Stability-lite and existing graph projection remain unchanged. No CLI expansion. M3 requires independent scope/approval and is not implemented here.
