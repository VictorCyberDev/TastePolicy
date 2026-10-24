# ADR 0015 — Subjective policy control plane (M7)

Status: accepted for M7. Recorded before implementation.

## Problem

M6 lets an agent ask whether a choice fits a Passport. Today the answer depends on two things only: the Passport's state entries and one cultural evidence read. A person cannot say "this agent may only auto-approve cheap things", "my taste data is a year old, ask me again", or "for this week allow Japanese restaurants without asking", and cannot see what a rule change would have done to past answers.

## Decision

Add a policy layer around the **existing** evaluator. It never produces a decision from scratch. It takes the base `StateEvaluation` that M1–M5 already compute (`stateDecision`, unchanged) and may only apply the ordered steps below. A Passport with no policy returns the base decision byte-for-byte, so M1–M5 behaviour and replay integrity are unchanged.

### Evidence classes

Every state entry is classified by a fixed function of its `kind` and `constraint`:

| Class               | Source entries                              |
| ------------------- | ------------------------------------------- |
| `HARD_CONSTRAINT`   | `CONSTRAINT` (exclude candidate, max price) |
| `EXPLICIT_NEGATIVE` | `DURABLE_FEEDBACK`                          |
| `EXPLICIT_POSITIVE` | `EXPLICIT_LIKE`                             |
| `CONTEXTUAL`        | `CONTEXTUAL_PREFERENCE`                     |
| `EXPLORATION`       | `EXPLORATION_INTENT`                        |

Provider-derived cultural affinity is not state and is not an authorization class. It stays what it was: evidence read by the one evaluator. Qloo affinity never authorizes.

### Ordered application (precedence)

1. **Base decision** from `stateDecision`.
2. **Hard rules are final.** `USER_HARD_BLOCK`, `CONTEXT_CONSTRAINT` and `UNAVAILABLE` stop here. No later step, override or autonomy setting changes them. `UNAVAILABLE` is never turned into `REJECT` or `ALLOW`.
3. **Freshness.** If the policy sets a maximum age for a class and every `EXPLICIT_POSITIVE`/`CONTEXTUAL`/`EXPLORATION` entry that the base evaluation could rely on is older, an `ALLOW` becomes `ASK` with basis `STALE_EVIDENCE`.
4. **Autonomy ceiling.** Per agent, then per domain, then default: `OBSERVE` (never ALLOW), `CONFIRM_ABOVE_LIMIT` (ALLOW only when a priced action is at or under the limit), `AUTONOMOUS`. A ceiling can only lower `ALLOW` to `ASK` (`AUTONOMY_CEILING`).
5. **Temporary override.** A user-authored, expiring, revocable rule scoped to a candidate, context or domain. `ALLOW_THROUGH_ASK` turns `ASK` into `ALLOW` (basis `USER_TEMPORARY_OVERRIDE`); `ALLOW_THROUGH_CULTURAL_REJECT` additionally turns a cultural-policy `REJECT` into `ALLOW` and needs a separate explicit confirmation. Overrides cannot reach step 2 outcomes.

The order is deterministic and exposed in a decision `trace`. A conflict (for example an override that targets a hard-blocked candidate) is reported in the trace as ignored with the winning step named; it is never silently resolved.

### Progressive autonomy

Autonomy only changes by an explicit user act with a fresh session. The system may _suggest_ promotion from recorded history (for example N evaluations with no later override and no user correction) but never applies it. Lowering autonomy needs no fresh session.

### Simulation, counterfactuals and impact analysis

All three are the same pure function run on recorded inputs, so they cost no provider call and cannot drift from live behaviour:

- **Simulation**: re-decide one recorded evaluation under a draft policy.
- **Counterfactual**: for one outcome, list the single changes (override, ceiling change, freshness, price limit, removing a named constraint) that would flip it, each verified by re-running the function. Constraint removal is shown as a user action, never taken.
- **Impact analysis**: run a draft policy over the Passport's recorded evaluations; report counts by transition (`ALLOW→ASK` …) and the evaluations affected, bounded and paged.

### Versioning

Policies are immutable, numbered, hash-addressed documents per Passport with a pointer to the active version. Publishing a version records its predecessor. An evaluation records the policy version and trace that produced its final decision in a separate table, so the base evaluation and its replay check are untouched. Rolling back publishes the old document as a new version.

### Surfaces

- Account control plane: plain-language rules, autonomy by agent/domain, overrides with expiry, a preview that shows what changes before publishing, and history. THE BOUNDARY is used as the visual for where taste ends and permission begins.
- Developer inspector: the recorded trace of any evaluation the caller can read, step by step.
- API: `policy` (read active summary) for agents; authoring is account-session only.

## Not decided here

Group/delegate policies, policy sharing, scheduled autonomy, ML-based promotion. M8 consumes the policy version for leases.

## Security and privacy

Authoring requires a session, exact origin and, for loosening changes, a fresh sign-in. Credentials can only read the active summary. Policy documents contain no raw state entries or provider data. Traces contain rule identifiers, not private text.
