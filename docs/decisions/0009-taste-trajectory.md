# ADR 0009 — TasteTrajectory v1

Recorded before runtime implementation against accepted main c6b29e66d530fde4a9eaaf8d6774ca3a03b23fa7. Canonical architecture v2 and accepted M1–M3 contracts remain authoritative.

## Intent and current position

An EXPLORATION_INTENT is a USER-attributed, context-scoped state entry containing one reviewed, server-resolved brand/destination/place target and CONSERVATIVE/BALANCED/OPEN tolerance. Creating it inserts immutable state N+1 and a mutation record in the same transaction as the trajectory intent. Removing it uses the existing explicit REMOVE mutation; missing/expired intent stops new planning until the user creates a new intent. Targets cannot equal any of the five original EXPLICIT_LIKE identities. Intent is not preference and never contributes an authorization signal. Current position is an immutable state version/hash, its five explicit anchors and applicable context/constraints/feedback, never coordinates or an embedding.

Identity review uses a separate bounded resolve operation returning normalized matches, followed by explicit user selection and server identity lookup on creation. Browser names are not authoritative. Context is fixed for a trajectory; candidate-specific price cannot be transferred. Changing context/target/tolerance requires a new explicit intent. No inferred goal or demographics.

## Bridge heuristic and provider budget

Sort the five original anchors by entity ID. Q1–Q5 each replace exactly one distinct anchor with the target: T2345, 1T345, 12T45, 123T5, 1234T. All five IDs in each query are distinct UUIDs. Invoke the existing provider infer contract directly, once per query, on one provider instance. No entities lookup, candidate evaluation, retry or recursive search occurs during planning. Five concurrent bounded infer calls fit the existing per-call deadline and unchanged transport ceiling of five; all results must succeed. Provider failure yields TRAJECTORY_UNAVAILABLE, never partial 4/5 support. Identity verification is a separate operation.

Support is distinct query membership count (1–5). Preserve each query's normalized evidence, original affinity, rank, explainability and provenance without averaging scores. Exclude target, all anchors, unsupported types and independently blocked candidates using accepted state policy. Order by support descending, best rank ascending, stable entity ID ascending. Reject inconsistent identities/ranks/provenance rather than guessing. This is an operational discovery heuristic, not cultural distance, probability, confidence or predicted individual liking.

STRICT requires support >=4, MODERATE >=2, BROAD >=1. CONSERVATIVE permits STRICT, BALANCED permits through MODERATE, OPEN permits through BROAD. Start STRICT unless a broader allowed level is explicitly selected. TOO_SAFE moves at most one allowed level wider, ABOUT_RIGHT preserves breadth, TOO_ADVENTUROUS moves one stricter, STOP_EXPLORING terminates. Empty plans remain NO_BRIDGE_AT_CURRENT_BREADTH; no automatic widening. Feedback changes trajectory events only, never Taste State or thresholds.

## Authorization and completion

All discovered candidates begin UNVERIFIED. Separate explicit evaluation reuses TasteStateService.evaluate, with all five ORIGINAL user anchors, the current immutable state and fixed context; the mixed discovery sets never enter authorization. No new policy or thresholds. ALLOW is a policy-authorized exploration step. ASK is STRETCH — CLARIFICATION REQUIRED; existing M2.5 handles answers and only a linked same-profile/version/evaluation final ALLOW can authorize the step. REJECT and UNAVAILABLE cannot be selected as authorized steps. The original receipt remains unchanged. Every adoption is an explicit immutable event referencing the persisted evaluation and optional clarification.

Evaluate the target separately through the same path. Target ALLOW exposes DIRECT_TARGET_AVAILABLE and suppresses unnecessary bridge planning for that current state/context. Explicit target selection completes the trajectory, not a booking, purchase, visit or proof of enjoyment. ASK requires accepted clarification, REJECT remains currently rejected, UNAVAILABLE means evidence unavailable. No spending/legal/account/private-data/physical-execution authority.

## Persistence, concurrency and replay

A separate TrajectoryRepository is composed into the existing transaction-scoped store. Migration 0003 adds intent, generation, candidate and event tables; earlier migrations remain unchanged. Composite FKs enforce profile/trajectory/state/generation/candidate/evaluation/clarification ownership. Captured generations, candidates and events are insert-only with update rejection, deny-by-default RLS and revoked PUBLIC privileges. Profile deletion cascades. Bounded normalized JSON only, no prompts/raw provider payloads/PII.

Reuse the existing hashed HttpOnly expiring demo capability, exact origin/JSON/body limits and operation admission. Lock session then profile. Check operation-scoped idempotency before stale checks or provider construction. Same canonical payload/key returns the original completed record; changed payload conflicts. Planning commits captured queries, deterministic candidate projection and idempotency result atomically. Feedback/event writes are atomic. Expiry is checked again after provider work. No exactly-once external delivery claim: rollback or crash before commit can repeat provider calls on an explicit retry. Native multi-client/remote persistence needs separate environmental validation.

A state advance makes the generation STALE. Explicit refresh plans against a new state/hash while preserving target/context/tolerance; no silent rebase. Historical replay loads the original state and captured queries, recomputes membership/order/breadth/hash and validates persisted candidates plus linked statuses/events without provider construction. Integrity mismatch fails closed. Captured operations are labeled CAPTURED, never live.

## Scope and privacy

Trajectory-local feedback is separate from accepted explicit persistent feedback. No hidden durable learning, target promotion, constraint removal, affinity aggregation, graph-v1 changes or benchmark dataset changes. Existing 24-hour profile expiry/purge covers all trajectory records. No new production dependency, authentication, MCP, SDK or autonomous action. M5 TasteProxy, another person's taste and group aggregation remain out of scope.

## Single active trajectory lifecycle

Each demo profile has at most one active exploration direction. Under the existing session/profile transaction locks, creation first replays a successful original idempotency key, then rejects ACTIVE_TRAJECTORY_EXISTS if any owned trajectory's exploration-intent signal remains in current state without a TRAJECTORY_STOPPED or TARGET_SELECTED event. This guard precedes provider construction, target lookup, quota consumption and state writes. A stale trajectory still occupies the slot. Explicit intent REMOVE releases it without requiring STOP as well.

STOP and completed TARGET_SELECTED are permanent terminal events for active-slot purposes. A later unrelated state version cannot resurrect a completed trajectory; historical authorization remains bound to its recorded state/context. A new trajectory requires a distinct explicit creation request. No mutable active flag or migration change is introduced.
