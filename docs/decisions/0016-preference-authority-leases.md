# ADR 0016 — Preference Authority Leases (M8)

Status: accepted for M8. Recorded before implementation.

## Problem

An evaluation answers one question at one moment. An agent that gets ALLOW will keep acting for minutes or hours while the person's taste data, rules, shares and permissions may change. An ASK today ends the conversation: there is nowhere for the person to answer and let the agent continue. Nothing records, after the fact, what authority was live when.

## Decision

A **lease** is a short-lived, revocable, auditable record that the cultural continuation actions of one decision remain permitted for one agent, one exact candidate and one situation, as long as nothing the decision relied on has changed. A lease is **not** a credential, a purchase authority or a booking token. It permits exactly what `continuation.permitted` of its decision already permitted (`recommend`, `add_to_draft`), and it never names execution.

### States (pure machine, `src/lib/lease/machine.ts`)

`ASK_PENDING → ACTIVE ⇄ SUSPENDED`, terminal `DECLINED`, `REVOKED`, `EXPIRED`, `RELEASED`. Only the owner approves; only a fresh evaluation resumes. Terminal states never leave. Replaying the stored events always rebuilds the stored state, and a mismatch is an integrity error.

### Where leases come from

- An evaluation whose **final** decision (policy applied) is `ALLOW` can be leased: the lease starts `ACTIVE`.
- **Amended by ADR 0019.** Only an `ASK` of kind `AUTHORITY_CONFIRMATION` can be leased; a `CLARIFICATION_REQUIRED` cannot. An evaluation whose final decision is an authority-confirmation `ASK` can be leased: the lease starts `ASK_PENDING`, the owner sees one plain question and approves or declines. Approval needs a fresh sign-in, can only shorten the lifetime, and is refused if the Passport state changed since the question (the person would be approving something that no longer exists).
- `REJECT` and `UNAVAILABLE` cannot be leased. UNAVAILABLE is not a rejection and is not a permission.

### Fingerprint and drift

At issue a lease records the Passport state hash, the policy version, the grant used, and the temporary overrides the decision relied on. Drift is computed, never guessed, by comparing that fingerprint with current facts: `STATE_CHANGED`, `POLICY_CHANGED`, `GRANT_UNAVAILABLE`, `OVERRIDE_ENDED`, `PASSPORT_UNAVAILABLE`, and `CHECKPOINT_OVERDUE`. Drift suspends; it never silently continues. A suspended lease resumes only when a **new evaluation** under the new fingerprint is `ALLOW` for the same agent, candidate and situation.

### TTL and checkpoints

Lifetime 60 s to 24 h (default 15 min); checkpoint interval at most the lifetime (default 5 min). The agent must checkpoint before the due time or the lease is treated as suspended. Expiry and overdue checkpoints are applied lazily on read, so nothing depends on a background job.

### Revocation propagation

Verification is authoritative and uncacheable (`ttlMs: 0`, `cacheable: false`). Because drift is recomputed on every verify and checkpoint, revoking a grant, ending an override, publishing a policy or changing state takes effect on the next call, with no propagation delay and no stale cache. The owner can revoke one lease or all leases for a Passport at once. Deleting a Passport removes its leases; verification of a missing lease answers invalid. Push webhooks are not part of M8; agents must verify before relying on a lease and at every checkpoint.

### Concurrency and replay

A unique index allows one live lease per (Passport, caller, agent, candidate, situation). Mutations lock the row and accept an optional `expectedRev`. Requests are idempotent by key. The event log is append-only; rows for status are a projection that must equal a replay.

### Audit

`lease_events` records every transition with actor (agent, owner, system), reason codes and time. Reasons are codes, never free text from the agent.

## Not decided here

Leases as portable proofs for third parties (M9 attestations), delegation of leases between agents (M9 handoff), push notification, multi-candidate leases.

## Security and privacy

Credentials request, verify, checkpoint, resume and release their own leases under the same scopes as evaluate/receipt (`TASTE_EVALUATE`, `RECEIPT_READ`); no new credential scope. Owner actions (list, approve, decline, revoke) are session-only. Lease references are 192-bit random. A lease reveals nothing about state beyond the decision already returned to that caller.
