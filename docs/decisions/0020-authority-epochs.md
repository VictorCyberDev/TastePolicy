# ADR 0020 — Authority epochs (M9 repair R2)

Status: accepted. Amends ADR 0017/0018 (status semantics).

## Problem

Proofs pointed at a status bit that mirrored the lease: ACTIVE → VALID, SUSPENDED → "suspended", other → INVALID, and a resumed lease set the bits back to VALID. A proof issued before a policy, state, override, grant or Passport change therefore became VALID again after a resume. It had been issued for authority that no longer existed, and was resurrected by a different authorization.

## Decision

**An authority epoch** is the span during which one exact authorization held. It is bound (cryptographically) to the candidate, the permitted actions, the situation, the Passport state hash, the policy version, the override set, the grant, and the lease revision that established it.

- The lease state machine carries `epoch = {n, rev}`. `n` is 1 for an ALLOW-issued lease, 0 while an ASK is pending, and increments on every approval and every resume. Anything that leaves `ACTIVE` ends the epoch. Returning to `ACTIVE` always starts a new one and needs a fresh evaluation (resume) or an explicit owner approval.
- Every attestation belongs to exactly one epoch (`attestations.epoch`, `epoch_commitment`).
- **Status is permanent.** Leaving `ACTIVE` sets every status entry of the lease to INVALID in the same transaction. The database function `set_status` refuses any change away from INVALID, and no longer writes SUSPENDED at all. So an ended epoch cannot come back by any route, including a bug in the application. A resumed lease receives new entries for new proofs only.
- `SUSPENDED` (2) remains in the status-list encoding because verifiers of other issuers may receive it, and it is still treated as not valid. When may SUSPENDED legitimately return to VALID? Only if the signed authority facts are identical across the pause. This issuer does not do that: it is conservative, so every pause permanently invalidates.
- **Commitment and unlinkability.** The commitment is a SHA-256 over the canonical authorization facts and never leaves the issuer. A proof carries `authority_epoch`, an HMAC-SHA-256 of `audience | commitment` truncated to 128 bits, keyed from the signing key by HKDF. It contains no raw identifier, differs per audience, and cannot be computed by a verifier. Two proofs for one audience in the same epoch carry the same value (the verifier already sees both).
- Verifiers must reject a proof without a well-formed `authority_epoch` (`EPOCH_MISSING`); conformance vector N36.

## Not changed

Random never-reused per-proof status index; `exp` clamp; replay table; audience binding; handoff (a handoff reuses the lease's own epoch, cannot widen the candidate, action, context or expiry, and `delegate_agent_id` is a label bound to the holder key, never a verified identity).

## Consequence

An agent whose lease was paused must resume and request a new proof; any proof it still holds is dead. That is the point.
