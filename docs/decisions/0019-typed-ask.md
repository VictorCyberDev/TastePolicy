# ADR 0019 — Typed ASK: authority confirmation vs. clarification (M8 repair R1)

Status: accepted. Amends ADR 0016 ("Where leases come from").

## Problem

ADR 0016 let any `ASK` become an `ASK_PENDING` lease that the owner could approve with one click. That conflated two different situations:

1. The decision is **settled** and the owner's own rule says "ask me first" (autonomy `OBSERVE`, or a known price above the owner's limit).
2. A **fact is missing** (the price, the occasion, fresh evidence). Nothing can be decided yet.

Approving case 2 would let a person authorize a choice that TastePolicy has not been able to evaluate: the owner would be asked to say yes to something that might violate their own hard rule once the price is known. That is a bypass of the evaluator, not an authority confirmation.

## Decision

`ASK` is typed deterministically from the recorded decision basis and rules. No model is involved (`src/lib/lease/ask.ts`).

| Kind                     | When                                                                                                                                                          | Can become a lease?                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `AUTHORITY_CONFIRMATION` | basis `AUTONOMY_CEILING` and every rule is `AUTONOMY:OBSERVE` or `AUTONOMY:ABOVE_LIMIT`                                                                       | Yes: `ASK_PENDING`; the owner may allow this exact choice once, for a bounded time         |
| `CLARIFICATION_REQUIRED` | everything else: `UNRESOLVED_CONTEXT` (`REQUIRED_PRICE:*`), `AUTONOMY:PRICE_UNKNOWN`, `STALE_EVIDENCE`, cultural ASK, any rule not listed above (fail closed) | **No.** `lease` returns `CLARIFICATION_REQUIRED`; nothing is created for anyone to approve |

The default is the conservative one: an unknown reason is a clarification.

### Contract

Every authorization response with `decision: "ASK"` carries `ask: { kind, reasons[], question }`. `unresolvedFactors` is unchanged. A lease view carries the same `ask` (null for ALLOW-started leases).

### Machine

`ISSUED` with `decision: ASK` is only legal with `ask.kind = AUTHORITY_CONFIRMATION`; `APPROVED` is only legal from an `ASK_PENDING` lease of that kind. The state machine therefore refuses the transition even if a caller bypasses the service. `APPROVED` events record the exact scope the owner allowed (candidate, situation, permitted actions).

### Approval (owner, session only)

`lease-approve` requires, in one transaction: a recent sign-in; `confirm: true` (explicit, no default); an `ASK_PENDING` lease of kind `AUTHORITY_CONFIRMATION`; that the stored decision still classifies the same way with the same reasons; and no drift of the Passport state hash, policy version, grant or Passport validity. It can shorten, never extend, the lifetime. It writes no Passport state and no policy: approval is a recorded authority event, not a preference change.

### Clarification path

The agent (or person) supplies the fact → the choice is evaluated again → only a fresh `ALLOW` can be leased. A fresh evaluation under a hard rule becomes `REJECT`, which cannot be leased.

### UX

Confirmation: "Your rule says to ask you before your agent continues." with **Allow this once** / **Not this time**. Clarification: "TastePolicy needs one fact before it can decide." with the exact question and no approve control.

## Consequences

- Existing integrations that leased every ASK now get `CLARIFICATION_REQUIRED` for missing facts. This is intended and documented as a breaking behavior change of the unmerged M8 draft.
- The sandbox models both kinds (candidate names containing `CLARIFY` produce a clarification).
- Epoch semantics for proofs issued from leases are handled separately (ADR 0020, R2).
