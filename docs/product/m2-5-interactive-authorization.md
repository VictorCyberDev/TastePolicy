# M2.5 — Interactive authorization

TastePolicy can ask one structured clarification about a captured ASK or search one bounded candidate substitution for an original M2 REJECT. This layer wraps accepted M1/M2 truth; it does not change Qloo contracts, affinity, thresholds, Cultural Receipt v1, state policy, graph hashes, Stability-lite or the local agent interface. See [ADR 0007](../decisions/0007-interactive-authorization.md).

## Clarification

The pure planner reads the owned evaluation, immutable state snapshot and optional prior answer. It returns one decision-relevant factor: PRICE_REQUIRED, PRICE_CURRENCY_REQUIRED or CULTURAL_BORDERLINE. Missing price precedes currency mismatch, then borderline cultural ASK; stable constraint ID breaks ties. No probabilistic information-gain claim. No Qloo request or preference mutation.

Money answers require a finite nonnegative amount up to 1,000,000 and the requested three-letter currency; UNKNOWN preserves uncertainty. No FX conversion. Disposition answers are ACCEPTABLE, UNACCEPTABLE or STILL_UNSURE. They resolve only cultural ASK after independent hard/context constraints are satisfied. Human acceptance yields interaction-scoped ALLOW; rejection yields interaction-scoped REJECT; uncertainty stays ASK. Original cultural ASK remains in the unchanged receipt, never relabeled provider ALLOW.

The `interactive-authorization-v1` envelope includes original evaluation, plan, explicit answer, answered context, final decision, state hash/version, captured evidence reference, parent clarification ID and timestamp/request provenance. Price completion followed by borderline clarification is an explicit parent chain. Answers are not feedback and create no Taste State entry/version. Exploration permission is not implemented.

## Repair and minimum change

Only an original M2 REJECT is eligible. Minimum change means one structural proposal field: candidate identity. This is not global optimization or preference similarity distance. Profile, state version/hash, action SELECT_ENTITY, domain, context and all applicable constraints stay fixed. Original rejection remains visible, including when repair fails.

Discovery reuses five explicit reviewed signals and the existing target-domain service. Candidates are ordered by normalized discovery rank then entity ID, not cross-request affinity; original and independently excluded identities are skipped. Verify at most one eligible candidate through existing candidate-specific evaluateAction and stateDecision. Discovery score alone cannot authorize repair. Only verified ASK or ALLOW produces REPAIR_AVAILABLE. Explicit adoption runs a separate ordinary M2 evaluation with the preserved version/context; it is not execution permission.

The same provider instance handles two discovery calls plus two candidate-specific verification calls: maximum FOUR under the unchanged transport ceiling of five. No retries or search loop. Verification starts only if two full 15-second provider windows plus one second overhead remain within the existing 55-second operation budget. The route reserves 60 seconds. Slow discovery returns unavailable rather than starting unsafe extra work.

Statuses:

| Status                          | Meaning                                                                |
| ------------------------------- | ---------------------------------------------------------------------- |
| REPAIR_AVAILABLE                | One substitution verified ASK/ALLOW under unchanged rules.             |
| NO_VERIFIED_REPAIR_WITHIN_BOUND | No qualifying repair in this small search; not proof of impossibility. |
| NO_VERIFIABLE_REPAIR            | A necessary external fact cannot be responsibly established.           |
| UNAVAILABLE                     | Provider/mandatory evidence failure; not a new REJECT.                 |
| STALE                           | State advanced; explicit fresh evaluation required.                    |

No authoritative replacement-price source exists. Original candidate price cannot transfer. An original price context or applicable maximum-price requirement returns NO_VERIFIABLE_REPAIR with a condition; replacement-specific price constraints are checked too. No commercial price is invented.

## Persistence and protected operations

Run `npm run db:migrate` once for a new dedicated database, then `npm run db:migrate:interactive` once to apply 0002. An existing M2 database needs only the second command. Neither migration is an automatic startup task or an idempotent repeatable migration runner. No existing hosted database is modified by local testing.

`ClarificationRepository` and `RepairRepository` are transaction-scoped PostgreSQL interfaces. Composite foreign keys bind each record to profile/evaluation/version; parents bind the same root/version; verification links a real same-profile/version M2 receipt. Unique profile/idempotency keys and immutable records complement M2 lineage constraints. RLS and revoked PUBLIC access deny browser table access. SQL tests execute both migrations and production repository SQL in development-only PGlite, not a production fallback.

POST `/api/state/interactive/{plan,answer,repair,replay-clarification,replay-repair}` uses the existing HttpOnly profile-bound cookie capability, expiry, exact origin checks, bounded body read and process admission guard. Clients supply evaluation IDs, not profile/session selectors. Answer/repair use expectedStateVersion and idempotencyKey. Same-key/same-payload success replays before stale checking/provider construction; changed payload conflicts. New stale answers conflict; stale repair reports STALE. No automatic rebase. Historical replay is captured only and makes zero Qloo requests.

Session/profile locks serialize this bounded demo. Answer/result and repair/evidence/verification writes are atomic. A DB rollback cannot undo external calls; exactly-once provider delivery after crash/rollback is not claimed. Repair checks capability expiry again before committing. Hosting and native multi-client lock contention require separate operational proof.

## Limits

No new live Qloo or remote persistence claim follows from fixtures or preview deployment. Synthetic browser responses are visibly labeled test data. Production has no fixture, PGlite or memory fallback. Query-relative aggregate affinity is not individual confidence. Thresholds remain experimental: >0.80 ALLOW, 0.50–0.80 inclusive ASK, <0.50 REJECT.

No durable learning from clarification, no constraint weakening, no LLM, no execution, no M3/TasteBench/Trajectory/Proxy or SDK/MCP expansion. Native multi-client PostgreSQL, live provider smoke and public UX under hosted persistence remain environmental verification targets.
