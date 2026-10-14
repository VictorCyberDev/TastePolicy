# Architecture overview

Milestone 1 implements an experimental Qloo-backed cultural authorization slice on the Phase 0 modular monolith. Implementation is tested and **live Qloo acceptance passed** on the exact reviewed M1 head. The bounded event contract established real entity resolution, cross-domain discovery, candidate-specific evidence, unit affinity scale, explainability handling, deterministic repeat behavior, Cultural Receipts and an unmocked production-build browser flow. Thresholds remain experimental rather than human-calibrated. See the [historical live investigation](../evaluation/milestone-1-live-verification.md) and [final acceptance report](../evaluation/milestone-1-live-acceptance-2026-10-13.md).

## Implemented flow

Client UI submits five queries to /api/demo/resolve. The server-only Qloo adapter searches entities; the user explicitly chooses identities. /api/demo/discover re-verifies five IDs via Qloo /entities, requires multiple domains, then requests cross-domain Insights. /api/demo/evaluate independently verifies the candidate ID and sends a separate candidate-filtered Insights request. Normalized successful evidence feeds the deterministic policy; receipt construction records identity, inputs, provenance, score scale and thresholds. Failures are non-decisions.

Transport (qloo/client.ts) owns fixed-origin HTTP, key header, timeout/body bounds and safe error states. Adapter normalization owns provider schemas. Taste service owns five-distinct-ID, multi-domain, resolved-entity and separate-candidate invariants even for direct callers. Generic validation sits in src/lib/validation.ts. Policy normalization/thresholds/evaluate owns inspectable decisions. Receipts owns versioned machine-readable evidence, validates consistency and snapshots allowlisted nested inputs. UI only presents normalized server results, never raw HTML or provider credentials. Test doubles stay in tests; no production fallback exists.

See [Qloo contract review](qloo-contract-review.md), [policy v1](../product/policy-v1.md), [final live acceptance](../evaluation/milestone-1-live-acceptance-2026-10-13.md) and the [canonical architecture journey](canonical-architecture-v2.md).

## Future responsibilities

| Module                | Responsibility                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------- |
| Qloo Adapter          | Cultural inference only; injected server-side adapter with normalized results/errors.         |
| Taste State           | TastePolicy-owned longitudinal pseudonymous preference state.                                 |
| ContextGraph          | Known, inferred, rejected, contextual and exploratory cultural relationships with provenance. |
| Policy Engine         | Deterministic or explicitly defined, inspectable ALLOW / ASK / REJECT evaluation.             |
| Cultural Receipts     | Auditable evidence explaining how an evaluation was reached.                                  |
| Counterfactual Engine | Minimum change required to improve cultural alignment.                                        |
| TasteTrajectory       | Cultural exploration/navigation.                                                              |
| TasteBench            | Reproducible evaluation and benchmark system; no results exist yet.                           |
| Agent Gateway         | Future API / SDK / MCP boundaries.                                                            |

“Qloo understands culture.
TastePolicy maintains preference state.
The policy engine evaluates actions.
The LLM may assist interpretation/orchestration but must not silently become the source of truth.”

## Dependency direction

Presentation/HTTP entry points call orchestration, which depends on domain contracts and injected adapters. Domain types do not import framework, provider SDK or persistence models. Vendor payloads terminate at adapters. Missing services return explicit unavailable states, never fabricated success.

The larger canonical flow is agent gateway → evaluation orchestration → persistent Taste State/action context → Qloo cultural evidence → explicit policy + bounded stability analysis → ALLOW / ASK / REJECT / UNAVAILABLE → Cultural Authorization Receipt → Agent Continuation Contract. Milestone 1 implements only the stateless explicit-signal selection slice. Vercel is the hosting target; Supabase/PostgreSQL remains future persistence. No database project is connected. One deployable modular monolith keeps hackathon execution reproducible; no distributed infrastructure is needed. See [Canonical Architecture & Milestone Journey v2](canonical-architecture-v2.md).
