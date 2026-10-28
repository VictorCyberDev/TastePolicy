# Local load and contention probe

**Evidence class: LOCAL (controlled, synthetic).** Real PostgreSQL 16 on the same machine, real concurrent connections (pool of 16), the real services, the deterministic local provider (no Qloo calls). Source: `tests/realpg-load.test.ts`. Run with:

```
TASTEPOLICY_TEST_DATABASE_URL=postgres://… LOAD_REPORT=report.json npx vitest run tests/realpg-load.test.ts
```

Raw measurements from the run of 2026-10-25: `load-local-2026-10-25.json`.

| Scenario                            |   n | concurrency | p50 ms | p95 ms | max ms | per second |
| ----------------------------------- | --: | ----------: | -----: | -----: | -----: | ---------: |
| evaluate (distinct keys)            |  40 |           8 |    129 |    191 |    207 |         61 |
| evaluate (same key, 20 at once)     |  20 |          20 |    169 |    189 |    189 |        105 |
| lease verify                        | 100 |          16 |     65 |     82 |     84 |        229 |
| lease checkpoint (same lease)       |  40 |          16 |     79 |    120 |    126 |        166 |
| attestation verify (valid, dry run) | 100 |          16 |     21 |     76 |     81 |        556 |
| attestation verify (malformed)      | 200 |          16 |      0 |      1 |      1 |     44,056 |
| status list token                   | 100 |          16 |      2 |      9 |     12 |      3,857 |
| OAuth protected-resource metadata   | 200 |          16 |      1 |      1 |      5 |     14,954 |

## What was proven (correctness under contention)

- Twenty simultaneous evaluations with the same idempotency key persisted **exactly one** evaluation and all returned its reference.
- Forty concurrent checkpoints of one lease all succeeded without error or deadlock; a revoke issued in the middle of a burst of checkpoints left the lease REVOKED and nothing could extend it afterwards.
- Malformed proofs under concurrency were rejected cheaply with no server error.
- The shared limiter admits exactly its budget across instances (`tests/public-limit.test.ts`, `tests/realpg.test.ts`).

## Budgets (regression tripwires, not promises)

The test fails if p95 exceeds 8 s for evaluate or 5 s for lease verify / attestation verify. These are deliberately wide: CI runners vary, and the numbers above describe this code on a local database, not a hosted deployment with network latency, cold starts and a managed database.

## What this does not show

No production-scale claim. No measurement of Qloo latency (the provider is local and deterministic). No hosted measurement; see the R6 report for any hosted figures actually taken.
