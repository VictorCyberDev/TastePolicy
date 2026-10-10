# Architecture overview

Phase 0 implements a single Next.js application, status homepage, health route, environment validation, safe error/logging utilities and design contracts. No product evaluation or provider integration exists.

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

The future flow is gateway → context/state → cultural evidence → explicit policy → auditable receipt. This flow is not implemented. Vercel is the hosting target; Supabase/PostgreSQL is future persistence. No database project is connected. One deployable modular monolith keeps hackathon execution reproducible; no distributed infrastructure is needed.
