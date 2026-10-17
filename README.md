# TastePolicy

**Cultural intelligence and authorization for autonomous agents.**

Public, open-source modular monolith for cultural authorization, built for the Qloo Agentic Hackathon and potential startup development.

## Current status

TastePolicy contains an experimental Qloo-backed cultural authorization vertical slice: five explicit signals → entity resolution → cross-domain discovery → specific SELECT_ENTITY evidence → deterministic ALLOW / ASK / REJECT → Cultural Receipt. **Milestone 1 live Qloo acceptance passed** on the exact reviewed head documented in [the final acceptance report](docs/evaluation/milestone-1-live-acceptance-2026-10-13.md). Thresholds remain experimental and are not human-calibrated. No production mock fallback exists. This repository foundation alone does not establish hackathon eligibility; verify official rules before submission.

M1.5R adds Judge Mode and verified demo presentation; M1.6 adds proof surfaces and bounded local agent interoperability. M2 implements PostgreSQL-backed Taste State, ContextGraph and scoped feedback. M2.5 adds deterministic clarification and bounded candidate-substitution Counterfactual Repair. Hosted persistence and live M2.5 Qloo smoke remain environment-blocked; implementation and fixture-based verification do not establish those operational proofs.

## Local setup

Use Node.js 24 LTS and npm (see `.nvmrc` and `package-lock.json`).

```sh
git clone https://github.com/VictorCyberDev/TastePolicy.git
cd TastePolicy
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. `GET /api/health` returns `{"status":"ok","service":"tastepolicy"}` plus a generated request ID.

## Environment contract

No credential is required to boot or run CI. Without Qloo credentials the UI reports Qloo not configured and cannot invent results. `NODE_ENV` is managed by Next.js; if provided it must be development/test/production. Optional `NEXT_PUBLIC_APP_URL` is a valid HTTP(S) canonical URL without embedded credentials. Optional `SUPABASE_URL` is validated when present. Blank optional values mean absent.

QLOO_API_KEY is a **server-only** secret. OPENAI_API_KEY and SUPABASE_SERVICE_ROLE_KEY remain future unused server-only secrets. NEXT_PUBLIC_SUPABASE_ANON_KEY is a future public browser credential; it does not grant service-role privileges. Qloo is called only from server routes after user requests. Missing configuration returns explicit unavailable states. Never send the object exported by `src/lib/env/server.ts` to a browser. Next.js server-only import guards enforce this boundary.

## Qloo setup and canonical demo

Request a key through the [current hackathon guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide) ([request form](https://forms.gle/zz12orkLHTAneLGz6)). Store it privately in .env.local as QLOO_API_KEY. Set QLOO_API_BASE_URL=https://hackathon.api.qloo.com for a hackathon key, following your credential email. No staging fallback. Do not commit the file or supply credentials to CI.

Before Insights/evaluation, inspect actual wire affinity semantics and set QLOO_AFFINITY_SCALE=unit or percent explicitly. Conflicting documentation is described in [provider review](docs/architecture/qloo-contract-review.md). Missing scale fails closed, not guessed. Restart the development server after environment changes.

The identity-reviewed canonical profile is Nils Frahm (artist), Perfect Days (2023 movie), Muji (brand), Piranesi (book), and Severance (TV show). Place is the selected live demonstration target; the UI also supports destination and brand. The UI requires explicit selection from real Qloo matches. A candidate-specific query supplies affinity for SELECT_ENTITY. [Policy v1](docs/product/policy-v1.md): ALLOW >0.80, ASK 0.50–0.80, REJECT <0.50. These experimental thresholds remain unchanged; the bounded live sample does not scientifically calibrate them. Provider failure or missing required evidence is unavailable, never REJECT. The event-host unit affinity scale and explainability wire format were verified in the bounded live acceptance, preserving complete/partial/unavailable states. The production-build browser flow and committed verifier both passed; see the [final acceptance report](docs/evaluation/milestone-1-live-acceptance-2026-10-13.md).

For live verification, start npm run dev and run npm run verify:qloo in another terminal. The runner stops on unavailable/ambiguous identities, probes destination/place/brand, samples high/median/low discovery candidates, evaluates three distinct candidates and repeats one evaluation. It validates receipts and reports PARTIAL_LIVE_PROOF unless the technical checks and a separate sanitized human review record pass. See [live verification](docs/evaluation/milestone-1-live-verification.md). CI uses clearly labeled synthetic test fixtures; production never does.

## Commands

```sh
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run test
npm run test:unit
npm run format
npm run format:check
npm run verify
npm run verify:qloo # live only; running local app and configured Qloo required
# Run after build; starts its own production server on port 3000:
npx playwright install --with-deps chromium
npm run test:e2e
```

`verify` checks formatting, ESLint, strict TypeScript, Vitest and production build. Playwright separately exercises the production homepage, mobile layout, dark mode, health response, headers and browser errors. CI runs both without external secrets. Keep port 3000 free for E2E.

## Architecture

Single Next.js App Router application with React, Tailwind and strict TypeScript. `src/app` holds presentation/HTTP entry points; `src/components` shared UI; `src/features/demo` the interactive demo; `src/lib` configuration, errors and safe logging; `src/server` Qloo transport/normalization, signal verification, policy, receipts, PostgreSQL repositories, state and interactive orchestration; `src/types` normalized contracts. M2 implements immutable persistent Taste State, scoped feedback and deterministic ContextGraph projections. M2.5 wraps captured evidence with structured clarification and bounded candidate repair; neither silently learns preferences from answers. See [architecture](docs/architecture/overview.md) and [ADRs](docs/decisions/0001-modular-monolith.md).

## Deployment

Ready for Vercel: import this repository, select Next.js, use Node 24, npm ci and npm run build. No provider credentials are needed to build or boot; live cultural evaluation requires server-only Qloo configuration, and persistent/interactive operations require a dedicated server-only DATABASE_URL plus migrations 0001 and 0002. Optionally set NEXT_PUBLIC_APP_URL to the resulting canonical URL. The isolated TastePolicy Vercel project is linked. The historical M1 deployment record reported a ready preview at https://tastepolicy.vercel.app. This is deployment infrastructure status, not independently verified runtime functionality or live Qloo proof. The initial deployment attempt hit the free daily quota; a later Git-triggered deployment reported ready. No billing or unrelated project changes were made. Dedicated hosted persistence and live M2.5 Qloo smoke have not been verified by this implementation; a ready preview does not establish either. See SECURITY.md before provisioning integrations.

## Limitations

Long-term taste learning, population-validated TasteBench findings, calibrated scientific preference accuracy, TasteTrajectory, TasteProxy, group authorization, public production SDK/MCP, real authentication, payments, autonomous execution and an enterprise control plane remain future/unimplemented. M2.5 implements only bounded candidate-substitution Counterfactual Repair: one proposal field, at most one candidate verified, no global optimization, arbitrary multi-field repair or globally minimal recommendation claim. Clarification is interaction-scoped, not persistent learning. Multiple applicable maximum-price currencies cannot be represented simultaneously by the single-price context; without FX, planning returns NO_ACTIONABLE_CLARIFICATION and preserves unresolved ASK. No scientific threshold validation, generalized recommendation superiority or production-scale reliability is claimed. Live identity, unit-scale, candidate evidence and explainability semantics were verified for the bounded event contract; broader empirical calibration remains pending. No demographic identity is used to manufacture taste. Process admission limits are local; persistent demo sessions also enforce the M2 operation ceiling. Request bodies have a total three-second read deadline, real provider instances permit at most five calls per HTTP request, upstream calls use the verified bounded 15-second provider deadline without retries, and the live verifier paces operations across the observed five-requests-per-second event limit. Use platform deployment protection and quota monitoring before exposing a credentialed demo; these limits do not protect the full Qloo account.

## Milestone journey

Milestone 1 is merged. **M1.5R — Verified Demo Reconciliation** adds judge-facing presentation, accessibility and the verified demo experience over the merged M1 foundation. **M1.6 — Proof & Interoperability**, **M2 — Persistent Taste State + ContextGraph + scoped feedback** and **M2.5 — Interactive Authorization** provide the implemented surfaces documented below. M3 adds isolated evaluation infrastructure; M4 and subsequent milestones remain future work requiring separate authorization. The authoritative product architecture and milestone sequence live in [Canonical Architecture & Milestone Journey v2](docs/architecture/canonical-architecture-v2.md).

## License

Apache License 2.0. See [LICENSE](LICENSE). Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md).

## Historical bounded live investigation

Event-host authentication, five Material & modern identities, three discovery domains and three candidate-specific responses were observed. Lookup/explanation readers were repaired from actual wire data. Application requests timed out, and the live verifier remained PARTIAL_LIVE_PROOF within the 25-attempt ceiling. That initial attempt was not completed acceptance. Read [actual observations and limits](docs/evaluation/milestone-1-live-verification.md); that historical run did not authorize a merge. PR #1 subsequently merged after acceptance and review. At that historical presentation checkpoint, M2 was outside the authorized scope; its later implementation is documented separately below.

The transport closure run subsequently resolved all five canonical signals through the real application with the bounded 15-second/two-concurrent repair. That historical attempt then hit the provider's per-second rate limit and stopped. A later bounded continuation identified the five-requests-per-second event limit, added verifier-only pacing without retries, completed discovery/evaluation/receipt/repeat/browser checks, and reached `LIVE_ACCEPTANCE_PASSED`. See the [historical investigation](docs/evaluation/milestone-1-live-verification.md) and [final acceptance report](docs/evaluation/milestone-1-live-acceptance-2026-10-13.md).

## Verified demo reconciliation and Judge Mode

The working demo now separates cultural signals, Qloo evidence, a specific agent proposal and cultural-policy evaluation. **Load Judge Mode** resets five reviewed concept names and selects place; it does not call Qloo, select entity IDs or precompute a decision. Resolve through the real server and explicitly review each identity before discovery/evaluation. ALLOW concerns experimental cultural policy, never purchasing, booking, spending or legal authority. Affinity remains query/context-relative aggregate evidence, not preference probability.

Successful current server evidence is labeled LIVE QLOO. Historical evidence must be labeled RECORDED LIVE EVIDENCE; intercepted test screenshots say SYNTHETIC TEST DATA; missing required evidence is UNAVAILABLE. Production has no synthetic fallback. Human-readable receipts expose existing evidence, experimental thresholds, provenance and versions alongside unchanged JSON.

See the [18-file reconciliation matrix](docs/reconciliation/m1-5r-matrix.md), [presentation review](docs/submission/m1-5r-ux-review.md), [submission narrative](docs/submission/readiness.md), [demo scripts](docs/submission/demo-script.md), [profile shortlist](docs/submission/demo-seeds.md), [video plan](docs/submission/video-storyboard.md) and [bounded smoke handoff](docs/submission/live-operations.md). M1.5R is complete. M1.6 adds the proof and local interoperability surfaces documented below. M2 adds the separately documented persistent-state foundation; later milestones still require separate scope approval and verification.

## Proof and local agent interoperability

M1.6 adds a Signature Cultural Authorization Receipt and an optional **Why does TastePolicy matter?** disclosure after evaluation. Capability Comparison uses the same proposal/evidence to show what the agent, Qloo and TastePolicy each contribute; it is not a benchmark. Stability-lite replays captured policy input three times and reports exact policy-boundary margins, not confidence or provider robustness. No additional Qloo request is made by these proof panels.

The local JSON adapter exposes evaluateTasteAction, explainTasteDecision and checkDecisionStability over the existing application services. `npm run --silent agent < examples/agent-proposal.json` submits one bounded proposal using private process-side configuration. There is no new public API, MCP, LLM, persistence or execution permission. Captured receipt operations require explicit recorded/synthetic labeling. See [M1.6 contracts and methodology](docs/product/m1-6-proof-interoperability.md).

## Persistent Taste State and scoped feedback

M2 adds PostgreSQL-backed immutable state versions, protected temporary demo profiles, scoped structured feedback, deterministic context-policy precedence, state-linked receipt envelopes and ContextGraph inspection. Qloo evidence does not automatically become user preference. The existing M1 receipt, policy, provider and M1.6 CLI/proof contracts remain unchanged.

Configure an optional server-only `DATABASE_URL` for a dedicated TastePolicy database and run `npm run db:migrate`. Without it, M2 explicitly reports persistence unavailable; no mock fallback is used. Run `npm run test:database` for real PostgreSQL-compatible SQL tests and schedule `npm run db:purge` for expired demo data. See [M2 contracts, security and limitations](docs/product/m2-persistent-state.md) and [design ADR](docs/decisions/0006-persistent-state-boundary.md). M2.5 adds separately scoped interactive authorization, documented below.

## M2.5 — Interactive authorization

Captured ASK can produce one deterministic structured clarification. Original M2 REJECT can request a bounded, policy-preserving candidate substitution with candidate-specific verification. Explicit answers stay interaction-scoped; Taste State and Cultural Receipt v1 remain unchanged. Repair requires explicit adoption, not autonomous execution.

Apply `npm run db:migrate:interactive` once after the M2 migration on a dedicated database. Without persistence/provider configuration, operations report unavailable; there is no production fixture fallback. See [contracts, limits and operations](docs/product/m2-5-interactive-authorization.md), [ADR 0007](docs/decisions/0007-interactive-authorization.md) and [verification evidence](docs/evaluation/m2-5-implementation-review.md). M3 is documented below; M4 remains future work requiring separate authorization.

## M3 — TasteBench

TasteBench is isolated, offline-first authorization evaluation infrastructure, outside every production authorization path. It imports accepted services without changing policy or thresholds. The committed dataset contains **synthetic engineering contract cases**, not human taste ground truth. Human annotation and genuine external baseline export/import workflows are available; no human evaluation or generic-AI/LLM+Qloo comparison has been run by this implementation.

Run `npm run tastebench:validate`, then `npm run tastebench:contract -- .tastebench/my-run` and `npm run tastebench:report -- .tastebench/my-run`. Output directories must be new and are ignored by Git. See [M3 operations](docs/product/m3-tastebench.md), [predeclared methodology](docs/evaluation/tastebench-methodology.md), [ADR 0008](docs/decisions/0008-tastebench-methodology.md) and [first-run evidence](docs/evaluation/tastebench-first-run.md). No composite score, scientific significance or benchmark superiority is claimed. M4/TasteTrajectory remains unimplemented.
