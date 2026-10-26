# ADR 0025 — Candidate and context commitments

Status: accepted (final reconciliation).

## Problem

A lease fingerprint covered server-side facts (state hash, policy version, grant, overrides) but not the candidate or context the decision was about. "Same context key, different price" did not end authority, and a proof said nothing about which choice it spoke for.

## Decision

- **Material.** candidate = the recorded snapshot (`id`, `name`, `type`, optional `releaseYear`, `address`); context = the evaluator's whole context (`key`, `domain`, optional `price`). The context type has no occasion or party fields, so none are committed. Presentation (image URLs, display order, layout, copy) is never in either: it is not in the snapshot and normalization drops unknown fields.
- **Format.** RFC 8785 JSON Canonicalization, then `sha-256:` + base64url of SHA-256 over `tastepolicy/<kind>/v1\n<canonical>` (domain separation by kind). Portable vectors with hand-written canonical strings: `conformance/commitment-vectors-v1.json`.
- **Carried through** the evaluation response and receipt (`commitments`), the lease fingerprint and view, lease events, the epoch commitment, and the signed proof (selectively disclosable `candidate_commitment`, `context_commitment`). An "authority commitment" over decision, state, policy, agent and requested action exists as a function for audit; it is not put in proofs because a verifier cannot recompute it without private state.
- **Drift.** Verify and checkpoint accept the candidate and context as they are now (or their commitments). A mismatch suspends with `CANDIDATE_CHANGED` / `CONTEXT_CHANGED`. A malformed value is rejected, never ignored.
- **Honest limit.** The server cannot see the outside world. A change nobody presents is not detected. Public wording says "as far as TastePolicy is told".
- **Resume.** Only after a fresh ALLOW evaluated after the suspension, for the same agent, candidate id and context key; the fresh evaluation's commitments replace the old; a presented commitment that disagrees is `COMMITMENT_MISMATCH`. The ladder is recomputed from the fresh evaluation. Resuming starts a new epoch; earlier proofs stay invalid.
- **Verifier.** `expect` (candidate/context or commitments) makes the verifier require and compare: `COMMITMENT_NOT_DISCLOSED`, `CANDIDATE_COMMITMENT_MISMATCH`, `CONTEXT_COMMITMENT_MISMATCH`. An empty `expect` is refused. Without `expect` the result reports `commitments: NOT_CHECKED`: a valid proof then speaks for some choice, not necessarily this one.
