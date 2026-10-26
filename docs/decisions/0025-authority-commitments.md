# ADR 0025 — Candidate and context commitments

Status: accepted (final reconciliation).

## Problem

A lease fingerprint covered server-side facts (state hash, policy version, grant, overrides) but not the candidate or context the decision was about. "Same context key, different price" did not end authority, and a proof said nothing about which choice it spoke for.

## Decision

- **Material.** candidate = the recorded snapshot (`id`, `name`, `type`, optional `releaseYear`, `address`); context = the evaluator's whole context (`key`, `domain`, optional `price`). The context type has no occasion or party fields, so none are committed. Presentation (image URLs, display order, layout, copy) is never in either: it is not in the snapshot and normalization drops unknown fields.
- **Format.** RFC 8785 JSON Canonicalization, then `sha-256:` + base64url of SHA-256 over `tastepolicy/<kind>/v1\n<canonical>` (domain separation by kind). Portable vectors with hand-written canonical strings: `conformance/commitment-vectors-v1.json`.
- **Carried through** the evaluation response and receipt (`commitments`), the lease fingerprint and view, lease events, the epoch commitment, and the signed proof (selectively disclosable `candidate_commitment`, `context_commitment`). An "authority commitment" over decision, state, policy, agent and requested action exists as a function for audit; it is not put in proofs because a verifier cannot recompute it without private state.
- **Drift.** Verify and checkpoint accept the candidate and context as they are now (or their commitments). A mismatch suspends with `CANDIDATE_CHANGED` / `CONTEXT_CHANGED`. A malformed value is rejected, never ignored.
- **Omission fails closed.** A lease issued with commitments (`commitmentRequired: true` in its view) is bound to one candidate and one situation. Verify, checkpoint and resume must present both (material, commitments, or both when they agree). Leaving either out is `COMMITMENT_REQUIRED` (HTTP 428, `missing: ["candidate"|"context"]` on REST, SDK, MCP and A2A) and the lease is neither relied on nor extended. A lease created before commitments existed has no commitments and keeps the previous behaviour. The A2A `GetTask` poll cannot present a choice, so for a commitment-aware lease it reports status only (`valid: false`, `unconfirmed: true`, no permitted actions).
- **Honest limit.** The server cannot see the outside world: it compares what the relying agent presents, and it cannot know the agent presented what is really true. Public wording says "as far as TastePolicy is told".
- **Resume.** Only after a fresh ALLOW evaluated after the suspension, for the same agent, candidate id and context key; the fresh evaluation's commitments replace the old; a presented commitment that disagrees is `COMMITMENT_MISMATCH`. The ladder is recomputed from the fresh evaluation. Resuming starts a new epoch; earlier proofs stay invalid.
- **Verifier.** `expect` (candidate/context or commitments) makes the verifier require and compare: `COMMITMENT_NOT_DISCLOSED`, `CANDIDATE_COMMITMENT_MISMATCH`, `CONTEXT_COMMITMENT_MISMATCH`. An empty `expect` is refused. Without `expect` the result reports `commitments: NOT_CHECKED`: a valid proof then speaks for some choice, not necessarily this one.
