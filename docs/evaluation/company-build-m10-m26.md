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

| Milestone                                      | Status      | Evidence / current truth                                                                                                                                                                                                                                                                                                        | Remaining gate                                                                                                                                                           |
| ---------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M10 Correctness & Security Closure             | PASS        | One-sided commitments fail `INTEGRITY_ERROR`; legacy portable proofs blocked; MCP annotations differentiated; browser semantics/layout/focus repaired; pg connect-event race removed. Local: typecheck/build green, 833 passed + 26 real-PG skipped, 153/153 conformance, TasteBench 24 scenarios, npm audit 0 vulnerabilities. | None internal. Evidence: `92ea06c` Verify run 40653071081 green (PostgreSQL + 3 browsers); deployment `dpl_FwRNaZXQJBfCf4sbcXFC4r32GbnV` READY; hosted acceptance 10/10. |
| M11 Canonical Release Reconciliation           | PASS        | `main` stale; continuation is exact PR #15 lineage plus this branch. No stacked PR blindly merged.                                                                                                                                                                                                                              | Map ancestry, reconcile docs, establish one release lineage after M10 green.                                                                                             |
| M12 Production Identity & Infrastructure       | NOT_STARTED | Production still M5 at mandate start; canonical API/MCP/OAuth/A2A routes exist in code.                                                                                                                                                                                                                                         | Audit canonical metadata/origins/env separation and promote only a green release.                                                                                        |
| M13 Commercial Dependency & Privacy Foundation | NOT_STARTED | —                                                                                                                                                                                                                                                                                                                               | Qloo commercial/data/privacy diligence.                                                                                                                                  |
| M14 Category, Brand & Company OS               | NOT_STARTED | —                                                                                                                                                                                                                                                                                                                               | Company brand/site implementation audit and build.                                                                                                                       |
| M15 Product Experience & Control Plane         | NOT_STARTED | —                                                                                                                                                                                                                                                                                                                               | User/developer control-plane completion.                                                                                                                                 |
| M16 MCP Productization & Boundary App          | IN_PROGRESS | Public MCP behavior metadata hardened in M10.                                                                                                                                                                                                                                                                                   | Intent surface audit + interactive Authority Card/MCP App.                                                                                                               |
| M17 Real Ecosystem Commissioning               | NOT_STARTED | —                                                                                                                                                                                                                                                                                                                               | Real ChatGPT/OpenAI, Claude, REST, A2A hosted evidence.                                                                                                                  |
| M18 Distribution Launch                        | NOT_STARTED | —                                                                                                                                                                                                                                                                                                                               | Registry/directory publication surfaces and review packages.                                                                                                             |
| M19 Developer Platform                         | NOT_STARTED | —                                                                                                                                                                                                                                                                                                                               | SDK/docs/sandbox/golden path.                                                                                                                                            |
| M20 Commercialization & Billing                | NOT_STARTED | —                                                                                                                                                                                                                                                                                                                               | Plans/metering/self-serve billing.                                                                                                                                       |
| M21 Enterprise Trust & Operations              | NOT_STARTED | —                                                                                                                                                                                                                                                                                                                               | Trust Center/security/procurement/operations package.                                                                                                                    |
| M22 TasteBench & Defensibility                 | IN_PROGRESS | Dataset validates 24 scenarios; hash `0d30276bce61ba67158f305bf5340acc51f53ec58cc041159db6b774970bc11d`.                                                                                                                                                                                                                        | Required baseline expansion and production metrics.                                                                                                                      |
| M23 Open-Core / IP Moat                        | NOT_STARTED | —                                                                                                                                                                                                                                                                                                                               | License/dependency/IP/company diligence.                                                                                                                                 |
| M24 Judge & Fundraising Experience / Devpost   | NOT_STARTED | —                                                                                                                                                                                                                                                                                                                               | Judge Mode + exact Devpost/Qloo submission verification.                                                                                                                 |
| M25 Fundraising Readiness                      | NOT_STARTED | —                                                                                                                                                                                                                                                                                                                               | Investor materials/data room/metrics/fundraise plan.                                                                                                                     |
| M26 Final Company Freeze                       | NOT_STARTED | —                                                                                                                                                                                                                                                                                                                               | Exact production release + full hosted/integration/submission acceptance.                                                                                                |

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

## M10 continuation (session 2) — why CI was red and what changed

- Prior CI runs 123–128 on PR #16 were red only at `npm run test:e2e`; format, lint, typecheck, 859 tests, build, conformance and TasteBench steps were green.
- Reproduced locally with PostgreSQL 16 and all three Playwright engines. The remaining defect was WebKit mobile horizontal overflow in the M5 subjects panel (`subjects.spec.ts` "mobile keyboard … long labels", dark and light): WebKit counts a `<select>`'s longest `<option>` as scrollable overflow of its parent `<label>` (document `scrollWidth` 1540 vs 390) although every element box was within the viewport. Fixed with `overflow: clip` on `.subjects-panel label`; verified by injecting alternatives (`select{overflow:hidden}`, `contain:inline-size`, `option` ellipsis all failed; label clip passed).
- Local gate after the fix: Prettier PASS, ESLint 0 errors (1 pre-existing `no-img-element` warning), typecheck PASS, Vitest 859/859 with real PostgreSQL (0 skipped), build PASS, Playwright chromium 138/138, firefox 138/138, webkit 138/138, `npm audit --audit-level=high` clean.
- M10 stays IN_PROGRESS until exact-SHA PR CI is green and a READY exact-SHA deployment plus hosted auth proof are recorded.

## M10 hosted evidence (exact SHA `92ea06c729cef8cfd10bb2dd377d3cf512252609`)

- CI: Verify run `40653071081` — success (format, lint, typecheck, 859 tests with real PostgreSQL, build, conformance 153/153, TasteBench, Playwright chromium/firefox/webkit).
- Deployment: `dpl_FwRNaZXQJBfCf4sbcXFC4r32GbnV` READY (preview, Neon-backed).
- `scripts/acceptance/hosted-acceptance.mjs` against the stable branch alias `https://tastepolicy-git-m10-m26-company-build-start-up16.vercel.app`: 10 passed / 0 failed / 0 skipped — ready 200 (database up, migrations current, auth up, attestation up), discovery, MCP 401 challenge, fresh account sign-up + sign-in on the pooled Neon connection (proves the search-path repair), developer credential on REST and MCP, full OAuth 2.1 flow including refresh rotation and reuse detection, credential revocation, attestation verifier.
- Origin note: Better Auth trusts only the configured `BETTER_AUTH_URL` origin, so per-deployment URLs (`tastepolicy-<hash>-…vercel.app`) correctly refuse sign-up with 401; acceptance must target the stable alias. This is the M12 canonical-origin item.
- Script corrections (not product changes): hosted runs use an https redirect URI (hosted issuers refuse loopback by design) and accept 401 `invalid_token` as the post-reuse-revocation answer.
- Not claimed: no repository-configured secret scanner exists; no secret-scan PASS. Load tests remain local-only (M26).

## M11 refreshed state — 2026-10-28

- Clean checkout at `06a0cda8dd75ed5de312ee3ec3bd8421532a3184`; no newer remote company-build work found.
- Verify 40655120408 on this exact head: success. M10 is PASS.
- Main remains `35ceed937ef0bebb88b200af6f21bcc362210cb8`; divergence 0 main-only / 115 candidate-only.
- Seven stacked tips and full tree comparison recorded in `m11-lineage.json`; feature/migration review in `m11-release-reconciliation.md`.
- PR #16 retargeted to main and body reconciled. Main merge and post-merge CI remain pending.
- Vercel current production deployment is `dpl_D9andrjTo99phqAWCJJpKVRyNcm6` on M5, READY. The earlier baseline deployment ID is historical. Project domains include `tastepolicy.vercel.app`. Production environment inventory is empty; working M10 variables are preview-branch scoped.
- Requirement coverage is tracked in `company-build-coverage.json`; unknown/unexecuted work stays NOT_STARTED, never inferred PASS.

## M11 merge and M12 commissioning — 2026-10-28

- Reconciliation documentation head `d5f414df72a62462860e8adf2422a33e198b1d83` passed full Verify 40669081100, including real PostgreSQL and Chromium/Firefox/WebKit.
- PR #16 merged with expected-head protection into main at `c8da03c766c05e7f7d15ed618ba542d20dab232c`. Main Verify 40700068412 is running; superseded PRs remain open until that succeeds.
- Production deployment `dpl_CTk3Vr9drAKM87SM3EDJ1YNXCqQa` is READY on this exact main SHA, target production, canonical alias `https://tastepolicy.vercel.app`.
- Production Neon branch `br-little-king-za6unmfo`, database `tastepolicy_production`, separate owner `tastepolicy_production_owner`; preview database is unchanged. Ten production-scoped variables configured, with distinct auth and signing secrets. No secret values appear in git or this ledger.
- Existing hosted database ledger was independently queried: migrations 0001–0011 present with expected checksums. Production bootstraps a new empty database through the build migrator.
- M12 implementation now centralizes origin validation and rejects mixed/unsafe identities, adds an exact operator-configured OpenAI challenge route (404 until a real token is supplied), and makes readiness compare every migration checksum. `CUSTOM_DOMAIN_MIGRATION.md` covers identity transition and rollback.
- Focused origin/OAuth/issuer/readiness/migration tests: 16/16 PASS locally. Full M10 tree tests: 833 PASS, 26 real-PG skipped locally; two-worker rerun passed after default-worker timeout failures. No timeout was increased or assertion removed.
- Production hosted acceptance is currently running. Real Qloo evaluation, independent A2A/SDK and full product acceptance remain unclosed; M12 stays IN_PROGRESS.
- Qloo commercial inquiry SENT to published sales@qloo.com; Gmail id/thread `1a181f9bde4b46d0`. No commercial permission or pricing has been obtained. See `docs/company/qloo-commercial-and-data.md` and vendor register. Only that response/permission stage is BLOCKED_EXTERNAL; retention enforcement and privacy hardening remain internal work.
- Work browser observations: ChatGPT is at a login/sign-up dialog; Claude redirects to `/login`. Neither service is signed in in this browser. Real connector creation, invocation and publisher identity remain unexecuted. No API simulation is claimed as assistant commissioning.
- Devpost project `1474261` / `tastepolicy` is published, but returned Qloo entry `submitted_at` is null; do not infer final submission. Its website is a stale deployment-specific preview, and video_url is null. Qloo submissions remain open through 2026-10-31 03:45 UTC; the current official requirements do not require a video. Update after production acceptance.

### M11 exit — PASS

Main `c8da03c766c05e7f7d15ed618ba542d20dab232c` Verify 40700068412 completed success. PRs #10–#15 are closed/superseded (PR #11 closed through canonical merging). One merged lineage defines the product. M11 PASS; no sequential stacked merges were used.

### M12 fresh production evidence

- Canonical `https://tastepolicy.vercel.app`, production deployment `dpl_CTk3Vr9drAKM87SM3EDJ1YNXCqQa`, exact main `c8da03c766c05e7f7d15ed618ba542d20dab232c`.
- `hosted-acceptance.mjs`: 10 PASS / 0 FAIL / 0 SKIP. Includes fresh auth, developer REST/MCP credential, OAuth PKCE/consent/resource binding, refresh rotation/reuse detection, credential revocation, issuer/verifier and discovery.
- `production-qloo.mjs`: LIVE resolve/discover/evaluate PASS, including real Qloo provenance and a Cultural Receipt. Public anchors only; commercial permission is not inferred. Evidence `m12-production-qloo.json`.
- `production-authority.mjs`: 8/8 LIVE PASS: fresh signup/signin, real Qloo Passport, fresh key, SDK Passport and evaluation, A2A completed task, export and disposable-account deletion with post-deletion credential 401. Evidence `m12-production-authority.json`. Test account removed; no credentials saved.
- Centralized origin/checksum readiness/OpenAI challenge implementation is local pending exact-head CI/deployment. M12 remains IN_PROGRESS until that implementation is merged and accepted on production. The challenge route is not domain verification without a real platform token.
- M14 company pages and dedicated auth entry are in progress. The engineering demo moves to `/demo`; tests follow that explicit route. New company UI must pass build, browser, responsive and accessibility gates before release.

### M12–M19 implementation checkpoint (not final freeze)

- Company homepage, product/developer shells, pricing, docs, integrations, security, trust, versioned privacy/terms, support, status, login/signup and guided dashboard implemented. Original engineering harness remains `/demo`. Boundary SVG/PNG assets, favicon and social image authored; no purchased assets or invented company claims.
- New guided onboarding explicitly resolves/reviews five public Qloo identities, creates a private Passport and issues a scoped one-time developer key. Organization/project/environment and billing enrollment are still unfinished; M15 is not PASS.
- Local production webpack build PASS; full Vitest 838 PASS / 26 real-PostgreSQL SKIP (864 total). Local Chromium company checks 7/7 PASS: 18 routes across phone/tablet/desktop, four illustrative decisions, keyboard, axe light/dark, reduced motion, honest auth failure, guided onboarding. Synthetic UI tests are not live user commissioning. Exact-head GitHub CI with PostgreSQL and all three engines remains required.
- MCP Apps resource bundled with pinned official SDK 2.0.4, scoped receipt inspection, accessible JSON/text fallback and explicit execution exclusions. Per-operation output schemas and conservative behavior annotations audited in `docs/company/mcp-tool-audit.md`. MCP resource tests PASS. No real ChatGPT/Claude UI use is claimed.
- SDK 0.2.0 ESM/declarations built and packed. Clean consumer installed the tarball and verified main/sandbox/attest exports plus sandbox client transport. npm authentication returned ENEEDAUTH; package is not published and scope ownership is unverified.
- Official MCP Registry publisher v1.8.6 accepted `server.json`. OIDC publication workflow waits for successful main push Verify and exact ready production revision. Registry registration is not yet claimed.
- Gitleaks v8.30.1 source and full 128-commit history scans PASS. Generated build/dependency directories are excluded; only JWT findings in the public ephemeral-key conformance-vector file are exempted. Other secret rules still apply to that file. Added pinned/checksummed CI secret scanning. npm audit reported zero vulnerabilities; regenerated CycloneDX SBOM.
- ChatGPT Google authentication stopped at a rejected password. Password values were never read into chat, logs or source. Secure browser handoff preserved. No connector, scan, invocation, directory submission or publisher verification is claimed. Independent work continues.

### Company release and M12 production exit — PASS

- PR #17 merged with expected-head protection at main `833fb722289911009431dd7d41237bb361a003c7` after exact-head Verify 40711555241, Secret scan 40711554869 and fresh preview Hosted acceptance 40711555197 all succeeded.
- New main Verify 40750769872 and Secret scan 40750770950 completed success. Production deployment `dpl_7jdUcCNd4yoN3VG2dfK7FpFDRHE1` is READY, target production, canonical `https://tastepolicy.vercel.app`.
- Outside-Vercel production Hosted acceptance 40752703012 passed: 12/12 auth/OAuth/discovery/verifier/credential checks including cleanup, a live Qloo resolve/discover/receipt probe, and 8/8 installed SDK/A2A/enrollment/export/deletion checks. Evidence: `m12-production-main-833fb72.json`.
- Centralized origin validation, full migration-checksum readiness, company pages, guided onboarding, MCP Apps resource and packaged SDK now exist on canonical production. OpenAI challenge serving still returns 404 without the platform's exact token; no domain verification is inferred.
- M12 PASS. This closes production identity/commissioning, not real ChatGPT/Claude use, paid billing or final company acceptance.

### M18 official MCP Registry — PUBLISHED

- GitHub OIDC publisher run 40752927856 succeeded for `io.github.VictorCyberDev/tastepolicy@0.2.0`.
- Independently fetched the public registry API record and compared it exactly with `server.json`: official status `active`, latest=true, publishedAt `2026-10-28T19:17:22.275916Z`. Stable remote URL is `https://tastepolicy.vercel.app/api/mcp`.
- Public evidence: `m18-mcp-registry-publication.json`. OpenAI and Claude directory states remain separate and unsubmitted. Official MCP registry publication does not establish approval by either assistant platform.

### M15 / M20 / company material continuation

- Local additive migration 0012 adds owner workspaces, projects, environments, agent registration, immutable credential/agent/environment bindings, separate live and internal-sandbox subscriptions, and simulated invoice events. No older migration changed.
- A bound key cannot rename its agent for an evaluation or lease. Revoking a registered identifier atomically ends matching live leases, invalidates their proof status entries and revokes bound credentials. The identifier remains revoked across the owner's application environments. Existing unbound credentials retain their explicitly broader account scope.
- Owner inspection includes actual captured decision counts, ASK rate, latest receipt, recorded lease states, active policy version and issued-proof counts. Counts do not establish current execution authority, provider reachability or customer traction.
- Live plans remain Free. The internal billing simulator explicitly records no charge and no live entitlement change. This is not a commissioned payment-provider sandbox; metering/paid-provider/entitlement requirements remain open.
- Focused ownership, replay, binding, revocation/proof invalidation, sandbox separation and deletion tests pass. Full local suite: 845 PASS / 26 real-PostgreSQL SKIP. Browser binaries were absent after the environment restart; exact-head CI remains the three-engine authority for this next change.
- Updated pricing research, 665-package dependency/IP inventory, licensing/contributor policy, security operations/procurement notes and investor package are drafts pending release reconciliation. The twelve-slide editable deck was rendered and visually checked; a missing image in the first candidate was repaired. No traction, company incorporation, certification or commercial permission is invented.
- Claude email sign-in advanced to the email-verification step. The secure code checkpoint remains pending; no secret code was read from Gmail or printed. ChatGPT sign-in is still incomplete. No real assistant tool invocation is claimed.
