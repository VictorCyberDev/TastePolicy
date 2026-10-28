# TastePolicy Canonical Architecture v4

Status: **AUTHORITATIVE for M6–M9.** Supersedes [v3](canonical-architecture-v3.md) where v3 says M7–M9 are "future, not authorized". M1–M5 contracts, the Win Gate and the Qloo contract remain as accepted. The detailed account is the [M6–M9 Architecture Report](m6-m9-architecture-report.md).

## One sentence

TastePolicy is a user-controlled, interoperable, runtime-aware and verifiable **Subjective Authority Layer**: it decides, per person, whether an autonomous agent is _justified in making a subjective choice for them_, and can later prove that decision to a third party without exposing the person.

> An agent may know me. An agent may technically be capable of acting. Neither fact automatically means it is justified in making a subjective choice for me. TastePolicy governs that boundary.

## Layers

| Layer               | Milestone | What it is                                                                                                                                              | Where                                         |
| ------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Cultural evidence   | M1–M4     | Qloo-derived affinity evidence, receipts. Evidence, never authorization                                                                                 | `src/server/qloo`, `src/server/taste`         |
| One evaluator       | M1–M5     | `stateDecision` over state + context + cultural evidence → ALLOW / ASK / REJECT / UNAVAILABLE                                                           | `src/server/state/policy.ts`                  |
| Passport and access | M6        | Private Passport, opaque `passportRef`/`subjectRef`, grants, scoped hashed credentials                                                                  | `src/server/platform/service.ts`              |
| Interop surfaces    | M6        | REST + OpenAPI, SDK, remote MCP, A2A 1.0, sandbox; one contract, one error catalog                                                                      | `src/lib/platform/contracts.ts`, `gateway.ts` |
| Policy              | M7        | Ordered precedence around the evaluator: hard rules → freshness → autonomy ceiling → temporary override; versioned; simulation, counterfactuals, impact | `src/lib/policy`, `policy-service.ts`         |
| Leases              | M8        | Short, revocable, auditable authority for one choice; drift, checkpoints, ASK resume; replayable state machine                                          | `src/lib/lease`, `lease-service.ts`           |
| Account linking     | M6        | OAuth 2.1 AS for hosted assistants (PKCE, CIMD/DCR, consent, audience-bound tokens); developer keys unchanged                                           | `oauth-service.ts`, ADR 0022                  |
| Attestations        | M9        | SD-JWT proofs of a lease; status lists; hosted and library verifiers; conformance vectors                                                               | `src/lib/attest`, `attest-service.ts`         |

Each layer wraps the one below. There is no second evaluator, and no layer can make an answer more permissive than the layer below except by an explicit, expiring act of the person.

## Hard rules (unchanged and enforced in code and tests)

1. Qloo affinity is not authorization.
2. ALLOW never means purchase, payment, booking, messaging, legal, account or private-data authority.
3. UNAVAILABLE is not REJECT, and policy, leases and attestations never convert one into the other.
4. A Passport reference is not a credential.
5. No paid model call sits in an authorization path.
6. Hard user rules (blocks, limits) are final against every later step.
7. Migrations after M6 are additive (0006–0008).

## Authority flow

```
agent → evaluate → [policy: ceiling/freshness/override] → ALLOW | ASK | REJECT | UNAVAILABLE
   ALLOW → lease;  ASK{AUTHORITY_CONFIRMATION} → lease waits for the person;  ASK{CLARIFICATION_REQUIRED} → no lease: supply the fact, evaluate again
   lease → verify / checkpoint (drift ⇒ SUSPENDED; resume = fresh ALLOW = new authority epoch)
   ACTIVE lease → attestation (SD-JWT, audience-bound, minimal disclosure, epoch reference, status index; leaving ACTIVE invalidates the epoch's proofs for good)
   third party → verify offline + status list (≤ ttl) | hosted verifier
```

## Not authorized

M10 and anything not named above. Merging the stack into `main` requires the Win Gate (PR #11) to land first and is a decision outside this document.
