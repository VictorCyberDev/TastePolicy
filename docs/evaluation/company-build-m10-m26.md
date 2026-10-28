# TastePolicy Company Build M10–M26 Execution Ledger

**Category:** Subjective Authority Infrastructure for AI agents  
**Execution branch:** `m10-m26-company-build`  
**Authoritative predecessor:** `m6-m9-final-reconciliation@9185e44507bd3f7e27dd989e9068e190075b0890`  
**Opened:** 2026-10-28  
**Rule:** no milestone becomes `PASS` until its explicit exit gate is evidenced at an exact SHA.

## Baseline truth

- `main` began this mandate at `35ceed937ef0bebb88b200af6f21bcc362210cb8` (M5), while the most advanced continuation was PR #15 / `m6-m9-final-reconciliation@9185e44507bd3f7e27dd989e9068e190075b0890`.
- Verify run `40333162539` on `9185e445...` was red: Chromium account-status ambiguity, two WebKit mobile-overflow failures, and one WebKit focus flake. Its 859-test suite and 153 conformance checks otherwise passed.
- Vercel preview `dpl_987Si3g5HZnoRptMxTqCa3UezYsH` was READY for `9185e445...`; production remained on `35ceed937...` via `dpl_DbrgUZuothVugydBUoApz325N8ue`.
- Neon project `holy-heart-68306654` / branch `br-shiny-fire-zaga6tg6` stores Better Auth tables in `tastepolicy`; the database-role default has been set to `tastepolicy, public` to remove the hosted connection race.

## Milestones

| Milestone | Status | Evidence / current truth | Remaining gate |
|---|---|---|---|
| M10 Correctness & Security Closure | IN_PROGRESS | One-sided commitments fail `INTEGRITY_ERROR`; legacy portable proofs blocked; MCP annotations differentiated; browser semantics/layout/focus repaired; pg connect-event race removed. Local: typecheck/build green, 833 passed + 26 real-PG skipped, 153/153 conformance, TasteBench 24 scenarios, npm audit 0 vulnerabilities. | Exact-SHA PR CI must prove real PostgreSQL and Chromium/Firefox/WebKit green; hosted fresh-auth proof required. |
| M11 Canonical Release Reconciliation | IN_PROGRESS | `main` stale; continuation is exact PR #15 lineage plus this branch. No stacked PR blindly merged. | Map ancestry, reconcile docs, establish one release lineage after M10 green. |
| M12 Production Identity & Infrastructure | NOT_STARTED | Production still M5 at mandate start; canonical API/MCP/OAuth/A2A routes exist in code. | Audit canonical metadata/origins/env separation and promote only a green release. |
| M13 Commercial Dependency & Privacy Foundation | NOT_STARTED | — | Qloo commercial/data/privacy diligence. |
| M14 Category, Brand & Company OS | NOT_STARTED | — | Company brand/site implementation audit and build. |
| M15 Product Experience & Control Plane | NOT_STARTED | — | User/developer control-plane completion. |
| M16 MCP Productization & Boundary App | IN_PROGRESS | Public MCP behavior metadata hardened in M10. | Intent surface audit + interactive Authority Card/MCP App. |
| M17 Real Ecosystem Commissioning | NOT_STARTED | — | Real ChatGPT/OpenAI, Claude, REST, A2A hosted evidence. |
| M18 Distribution Launch | NOT_STARTED | — | Registry/directory publication surfaces and review packages. |
| M19 Developer Platform | NOT_STARTED | — | SDK/docs/sandbox/golden path. |
| M20 Commercialization & Billing | NOT_STARTED | — | Plans/metering/self-serve billing. |
| M21 Enterprise Trust & Operations | NOT_STARTED | — | Trust Center/security/procurement/operations package. |
| M22 TasteBench & Defensibility | IN_PROGRESS | Dataset validates 24 scenarios; hash `0d30276bce61ba67158f305bf5340acc51f53ec58cc041159db6b774970bc11d`. | Required baseline expansion and production metrics. |
| M23 Open-Core / IP Moat | NOT_STARTED | — | License/dependency/IP/company diligence. |
| M24 Judge & Fundraising Experience / Devpost | NOT_STARTED | — | Judge Mode + exact Devpost/Qloo submission verification. |
| M25 Fundraising Readiness | NOT_STARTED | — | Investor materials/data room/metrics/fundraise plan. |
| M26 Final Company Freeze | NOT_STARTED | — | Exact production release + full hosted/integration/submission acceptance. |

## M10 validation before repository handoff

- `npm run format:check`: PASS.
- `npm run lint`: PASS with one pre-existing `next/no-img-element` performance warning; no lint errors.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- Focused commitment/MCP/attestation suite: 36/36 PASS.
- Full local Vitest: 833 passed / 26 skipped (859 total); skips are the real-PostgreSQL suite because the source sandbox had no PostgreSQL service.
- `npm run conformance:compatible`: 153/153 PASS.
- TasteBench: 24 scenarios valid; contract run `d748bed7-f8dd-42f3-8949-068dfc6f7f15`, semantic hash `b17737a826842ffe98a4c9519dfab57d08f0706a92f9865928bd1cdf6eba1161`, report reconciled. Human evaluation and generic-LLM/Qloo baseline environments remain explicitly blocked, not fabricated.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- No repository-configured secret scanner was found in `.github`, `package.json`, or `scripts`; no secret-scan PASS is claimed.
- Local Playwright execution was tooling-blocked because the clean Vercel sandbox lacks `apt-get`; GitHub Actions is the authoritative browser gate and installs Playwright OS dependencies itself.

## M10 infrastructure change outside git

Executed on Neon production database role:

`ALTER ROLE tastepolicy_owner IN DATABASE tastepolicy SET search_path TO tastepolicy, public;`

`pg_db_role_setting` confirmed the exact role/database setting. Fresh hosted auth behavior still requires end-to-end proof before M10/M12 PASS.
