# TastePolicy

**Cultural intelligence and authorization for autonomous agents.**

Milestone 1 — Qloo Cultural Intelligence Vertical Slice. Public, open-source modular monolith for a Qloo Agentic Hackathon submission and potential startup.

## Current status

TastePolicy contains an experimental Qloo-backed cultural authorization vertical slice: five explicit signals → entity resolution → cross-domain discovery → specific SELECT_ENTITY evidence → deterministic ALLOW / ASK / REJECT → Cultural Receipt. **Milestone 1 live Qloo acceptance passed** on the exact reviewed head documented in [the final acceptance report](docs/evaluation/milestone-1-live-acceptance-2026-10-13.md). Thresholds remain experimental and are not human-calibrated. No production mock fallback exists. This repository foundation alone does not establish hackathon eligibility; verify official rules before submission.

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

Single Next.js App Router application with React, Tailwind and strict TypeScript. `src/app` holds presentation/HTTP entry points; `src/components` shared UI; `src/features/demo` the interactive demo; `src/lib` configuration, errors and safe logging; `src/server` Qloo transport/normalization, signal verification, policy and receipts; `src/types` normalized contracts. Planned persistent systems remain design intentions. See [architecture](docs/architecture/overview.md) and [ADRs](docs/decisions/0001-modular-monolith.md).

## Deployment

Ready for Vercel: import this repository, select Next.js, use Node 24, npm ci and npm run build. No provider credentials are needed. Optionally set NEXT_PUBLIC_APP_URL to the resulting canonical URL. The isolated TastePolicy Vercel project is linked. PR #1’s Vercel bot now reports a ready preview at https://tastepolicy.vercel.app. This is deployment infrastructure status, not independently verified runtime functionality or live Qloo proof. The initial deployment attempt hit the free daily quota; a later Git-triggered deployment reported ready. No billing or unrelated project changes were made. No database is connected. See SECURITY.md before future integrations.

## Limitations

No persistent personalization, long-term learning, ContextGraph, counterfactuals, TasteTrajectory, TasteProxy, full TasteBench, public SDK/MCP, authentication, payments or autonomous execution are implemented yet. No scientific threshold validation, generalized recommendation superiority or production-scale reliability is claimed. Live identity, unit-scale, candidate evidence and explainability semantics were verified for the bounded event contract; broader empirical calibration remains pending. No demographic identity is used to manufacture taste. Request quotas are process-local only. Request bodies have a total three-second read deadline, real provider instances permit at most five calls per HTTP request, upstream calls use the verified bounded 15-second provider deadline without retries, and the live verifier paces operations across the observed five-requests-per-second event limit. Use platform deployment protection and quota monitoring before exposing a credentialed demo; these limits do not protect the full Qloo account.

## Next milestone

Milestone 1 is merged. This branch implements **M1.5R — Verified Demo Reconciliation** for independent guide review, followed by **M1.6 — Proof & Interoperability**, then **M2 — Persistent Taste State + ContextGraph + scoped feedback**. The authoritative product architecture and milestone sequence live in [Canonical Architecture & Milestone Journey v2](docs/architecture/canonical-architecture-v2.md).

## License

Apache License 2.0. See [LICENSE](LICENSE). Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md).

## Historical bounded live investigation

Event-host authentication, five Material & modern identities, three discovery domains and three candidate-specific responses were observed. Lookup/explanation readers were repaired from actual wire data. Application requests timed out, and the live verifier remained PARTIAL_LIVE_PROOF within the 25-attempt ceiling. That initial attempt was not completed acceptance. Read [actual observations and limits](docs/evaluation/milestone-1-live-verification.md); that historical run did not authorize a merge. PR #1 has since merged after acceptance and review; M2 is not authorized by this presentation pass.

The transport closure run subsequently resolved all five canonical signals through the real application with the bounded 15-second/two-concurrent repair. That historical attempt then hit the provider's per-second rate limit and stopped. A later bounded continuation identified the five-requests-per-second event limit, added verifier-only pacing without retries, completed discovery/evaluation/receipt/repeat/browser checks, and reached `LIVE_ACCEPTANCE_PASSED`. See the [historical investigation](docs/evaluation/milestone-1-live-verification.md) and [final acceptance report](docs/evaluation/milestone-1-live-acceptance-2026-10-13.md).

## Verified demo reconciliation and Judge Mode

The working demo now separates cultural signals, Qloo evidence, a specific agent proposal and cultural-policy evaluation. **Load Judge Mode** resets five reviewed concept names and selects place; it does not call Qloo, select entity IDs or precompute a decision. Resolve through the real server and explicitly review each identity before discovery/evaluation. ALLOW concerns experimental cultural policy, never purchasing, booking, spending or legal authority. Affinity remains query/context-relative aggregate evidence, not preference probability.

Successful current server evidence is labeled LIVE QLOO. Historical evidence must be labeled RECORDED LIVE EVIDENCE; intercepted test screenshots say SYNTHETIC TEST DATA; missing required evidence is UNAVAILABLE. Production has no synthetic fallback. Human-readable receipts expose existing evidence, experimental thresholds, provenance and versions alongside unchanged JSON.

See the [18-file reconciliation matrix](docs/reconciliation/m1-5r-matrix.md), [presentation review](docs/submission/m1-5r-ux-review.md), [submission narrative](docs/submission/readiness.md), [demo scripts](docs/submission/demo-script.md), [profile shortlist](docs/submission/demo-seeds.md), [video plan](docs/submission/video-storyboard.md) and [bounded smoke handoff](docs/submission/live-operations.md). M1.6/M2 are not implemented or authorized by this milestone.
