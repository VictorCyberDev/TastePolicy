# M8 ENFORCE — Preference Authority Leases

Design record: ADR 0016.

## For a person

`/account/leases` shows what agents may do right now. When your own rule says "ask me first", the agent can ask you one plain question: **Allow this once** (for 5 minutes to 4 hours) or **Not this time**. If TastePolicy is missing a fact (for example the price), you are not asked to approve anything: the fact is supplied and the choice is decided again. You can end any permission, or stop every agent at once. Each permission lets an agent recommend or add one choice to a draft. It never lets an agent buy, book or pay, and it pauses itself when something it relied on changes and TastePolicy can see the change: your taste information, your rules, a share, a temporary permission, or, if the agent tells TastePolicy what the choice and situation are now, the choice or situation itself (a changed price, for example). A change in the outside world that nobody tells TastePolicy about cannot be noticed, so agents are expected to verify and check in with the current choice before they rely on a permission.

## For an agent

| Step                                                 | REST (`/api/v1/…`) | MCP tool                       | Scope            |
| ---------------------------------------------------- | ------------------ | ------------------------------ | ---------------- |
| Ask for a lease after an ALLOW or ASK evaluation     | `lease`            | `tastepolicy_request_lease`    | `TASTE_EVALUATE` |
| Verify immediately before relying on it              | `lease-verify`     | `tastepolicy_verify_lease`     | `RECEIPT_READ`   |
| Check in before `checkpointDueAt`                    | `lease-checkpoint` | `tastepolicy_checkpoint_lease` | `TASTE_EVALUATE` |
| Resume after a pause with a **new** ALLOW evaluation | `lease-resume`     | `tastepolicy_resume_lease`     | `TASTE_EVALUATE` |
| Finish                                               | `lease-release`    | `tastepolicy_release_lease`    | `TASTE_EVALUATE` |

Rules an agent must follow:

- Treat `valid:true` as true only for the response you just received. Verification is uncacheable (`ttlMs:0`, `cacheable:false`); never reuse an earlier answer.
- `permitted` lists only `recommend` and `add_to_draft`. Anything else is not authorized by TastePolicy.
- Every ASK carries `ask: {kind, reasons, question}`. `AUTHORITY_CONFIRMATION` can be leased and waits for the person. `CLARIFICATION_REQUIRED` cannot: `lease` returns `CLARIFICATION_REQUIRED`; supply the fact, evaluate again, and lease only a fresh ALLOW (ADR 0019).
- `ASK_PENDING` means wait for the person; poll `lease-verify`. Never assume an answer.
- `SUSPENDED` includes the reasons (`STATE_CHANGED`, `POLICY_CHANGED`, `GRANT_UNAVAILABLE`, `OVERRIDE_ENDED`, `CHECKPOINT_OVERDUE`, `PASSPORT_UNAVAILABLE`). Run a new evaluation; only a new ALLOW resumes the lease.
- Lifetime 60 s–24 h (default 15 min). Approval can shorten it, never extend it.
- **Say what the choice is now.** A lease whose view has `commitmentRequired: true` is bound to one candidate and one situation. `lease-verify`, `lease-checkpoint` and `lease-resume` must present both: material (`candidate`, `context`), commitments (`candidateCommitment`, `contextCommitment`), or both for one field (recomputed and confirmed; disagreement is `INVALID_INPUT`). Leaving either out is `COMMITMENT_REQUIRED` (HTTP 428) with `missing: ["candidate"|"context"]`; the lease is neither relied on nor extended. A2A `GetTask` cannot present a choice and reports status only (`valid:false`, `unconfirmed:true`). Leases created before commitments existed carry none and keep the earlier behaviour.
- Idempotent by `idempotencyKey`. `expectedRev` on checkpoint detects concurrent changes (`LEASE_STATE_CONFLICT`).
- One live lease per agent, choice and situation.

Errors: `CLARIFICATION_REQUIRED` (a fact is missing; not approvable), `LEASE_NOT_FOUND` (also for leases belonging to someone else), `LEASE_NOT_PERMITTED` (REJECT or UNAVAILABLE decisions cannot be leased), `LEASE_STATE_CONFLICT`, `STATE_VERSION_CONFLICT` (the evaluation is stale), `COMMITMENT_REQUIRED` (candidate and/or context not presented), `COMMITMENT_MISMATCH` (resume presented a different choice than the fresh evaluation).

## Account operations (session only)

`lease-list`, `lease-approve` (fresh sign-in; `confirm: true` required; only for `AUTHORITY_CONFIRMATION`), `lease-decline`, `lease-revoke` (one lease or `passportRef` for all).

## Data

Migration `0007_preference_authority_leases.sql` (`platform_leases`, append-only `lease_events`). The database refuses lease extension, revival of a terminal lease and event edits. `npm run db:migrate:leases`.
