# M6–M9 system freeze — evidence index

Tested tree: branch `m9-interoperable-preference-authorization-network` (stack: M6 `889400a` → M7 `0c9c07d` → M8 `49e5d99` → M9). The exact final SHA and its CI/deployment results are recorded in PR #14 and the final report, because a commit cannot contain its own hash.

## Gates run on the final tree

| Freeze item                                                 | Result                                                                                                                                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entire historical + M6–M9 unit/integration suite (43 files) | 713 pass; 1 known load-sensitive timeout (`tests/trajectory.test.ts` "filesystem close/reopen", 5 s default; fails on the base branch too, passes in some local runs and in CI; never modified) |
| M1–M5 regressions                                           | none: TasteBench `REPORT_RECONCILED`, contract and validate pass, all M1–M5 suites green                                                                                                        |
| Migration chain 0001→0008 from empty                        | applied by every database test fixture (PGlite); scripts `db:migrate`…`db:migrate:attestations` map to the same files; hosted database not exercised                                            |
| Clean bootstrap                                             | CI runs `npm ci` + verify + e2e on a fresh runner for every head                                                                                                                                |
| Production build                                            | pass                                                                                                                                                                                            |
| Browser acceptance                                          | 101 Playwright tests (consumer journey, account, rules, leases, verify, inspector, mobile light/dark, keyboard, reduced motion)                                                                 |
| Accessibility                                               | axe-core WCAG 2.1 A/AA on `/account/rules`, `/account/inspector`, `/account/leases`, `/verify`, light and dark: 0 violations (rule coverage asserted). No assistive-technology or human audit   |
| Responsive                                                  | 390 px no-horizontal-overflow checks on all four pages, light and dark                                                                                                                          |
| Dependency audit                                            | `npm audit` and `npm audit --omit=dev`: 0 vulnerabilities                                                                                                                                       |
| Secret scan                                                 | regex scan of all tracked files for key/token/private-key patterns: none. (GitHub's secret-scanning tool was not run: it requires sending file contents to an external service.)                |
| Bundle scan                                                 | `.next/static` contains no secret variable names, private-key markers or credential-shaped strings; no client component imports server-only code                                                |
| Public docs check                                           | 93 Markdown files, 0 broken relative links                                                                                                                                                      |
| SDK example                                                 | `examples/platform-client.mjs` shape and the SDK/sandbox exercised by tests (the script itself needs a live server and credential)                                                              |
| MCP example                                                 | official MCP client, both protocol eras, 12 tools, lease and attestation round trips                                                                                                            |
| A2A example                                                 | official `@a2a-js/sdk` client round trip; cross-surface conformance                                                                                                                             |
| OpenAI / Claude / Gemini examples                           | configurations validated against the live tool names and endpoint shapes; **no vendor model-driven run** (no vendor credentials)                                                                |
| Runtime lease demo and cross-agent attestation demo         | `tests/demo-scenario.test.ts`: rules → ASK → approval → lease → proof → handoff → verification → revocation, on real SQL                                                                        |
| Conformance                                                 | 35 attestation vectors pass strict; cross-surface decision conformance passes                                                                                                                   |

## Security reviews

Independent reviews of the M6 surfaces and of the M9 attestation code: findings and resolutions in `m6-connect-review.md` and `m9-verify-review.md`.

## Open items (unchanged from the architecture report §42)

Hosted persistence/auth/issuer proof; OAuth authorization server and hosted-connector routes; vendor model-driven runs; official MCP/A2A conformance suites; metrics and load testing; push revocation; merge into `main`, which first requires the Win Gate (PR #11).
