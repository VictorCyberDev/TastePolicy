# Final acceptance matrix

Candidate: branch `m6-m9-final-reconciliation` (PR 15) on the M9 tip. Statuses: PASS, PARTIAL, BLOCKED_EXTERNAL, BLOCKED_HUMAN, NOT_APPLICABLE. Evidence kinds: CI (GitHub Actions `Verify`, green on the head), LOCAL (this repository's tests incl. real PostgreSQL 16 and a clean clone), CONTROLLED (synthetic, agent-to-agent inside the repository). Nothing here is HOSTED or LIVE.

## M6 — Connect

| Capability                                              | Status        | Evidence                                                                                       |
| ------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------- |
| Passport (opaque refs, subjectRef/profileId separation) | PASS          | `platform.test.ts`, CI                                                                         |
| Auth (Better Auth sessions, recent-auth gates)          | PASS          | `platform.test.ts`, `realpg-m6.test.ts`                                                        |
| Grant                                                   | PASS          | `platform.test.ts`, `subjects.test.ts`                                                         |
| Credential (hashed, scoped, expiring, rotatable)        | PASS          | `platform.test.ts`                                                                             |
| REST                                                    | PASS          | `platform.test.ts`, `attest-routes.test.ts`                                                    |
| OpenAPI                                                 | PASS          | `openapi.test.ts`                                                                              |
| SDK                                                     | PASS          | `sdk-sandbox.test.ts`; in-repo only, not published to npm                                      |
| MCP                                                     | PASS          | `mcp.test.ts` (official client library); not tested inside a hosted assistant                  |
| OAuth 2.1                                               | PASS          | `oauth.test.ts`, `oauth-routes.test.ts`, `realpg-m6.test.ts`; local authorization server only  |
| A2A                                                     | PASS          | `a2a.test.ts`, `a2a-authority.test.ts` (CONTROLLED agent-to-agent); no third-party A2A product |
| Sandbox                                                 | PASS          | `sdk-sandbox.test.ts`                                                                          |
| Conformance                                             | PASS          | `npm run conformance:compatible`: 110 checks                                                   |
| External connector proof                                | BLOCKED_HUMAN | not executed: no signed-in vendor session available; see R6                                    |

## M7 — Control

| Capability                                         | Status  | Evidence                                                                                                                                                                                       |
| -------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Policy versioning, history, restore as new version | PASS    | `policy.test.ts`, `realpg-m7.test.ts`                                                                                                                                                          |
| Evidence classes                                   | PARTIAL | five classes exist and are used for freshness; all stored evidence is USER-sourced, so group-derived and proxy evidence are decided per member at decision time, not stored classes (ADR 0024) |
| Freshness                                          | PASS    | `policy-engine.test.ts`                                                                                                                                                                        |
| Progressive autonomy (action ladder)               | PASS    | `policy-ladder.test.ts`, `ladder-service.test.ts`, vectors                                                                                                                                     |
| Domain rules, agent rules                          | PASS    | same                                                                                                                                                                                           |
| Sensitive-domain rules                             | PASS    | owner-declared per kind of choice (not inferred from content)                                                                                                                                  |
| Temporary override                                 | PASS    | `policy-engine.test.ts`, `review-fixes.test.ts`                                                                                                                                                |
| Simulation, impact, counterfactual                 | PASS    | `policy.test.ts`, `policy-engine.test.ts`                                                                                                                                                      |
| Group composition, delegate limits                 | PASS    | `group-policy.test.ts`, `policy-delegate.test.ts`                                                                                                                                              |
| Privacy controls                                   | PARTIAL | what each side sees is stated in the rules page and enforced by response shapes; there are no per-field privacy toggles                                                                        |
| Organization ceiling                               | PARTIAL | one organization per deployment, operator-set, can only lower; no multi-organization model, SSO/SCIM, admin console                                                                            |
| Audit                                              | PASS    | immutable histories and the unified timeline                                                                                                                                                   |

## M8 — Enforce

| Capability                                         | Status | Evidence                                                                                       |
| -------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| Lease, TTL, checkpoint, revocation                 | PASS   | `lease.test.ts`, `realpg-m8.test.ts`                                                           |
| ASK, clarification, approval, decline              | PASS   | typed ASK; `lease.test.ts`, vectors                                                            |
| State, policy, grant, override drift               | PASS   | `lease.test.ts`                                                                                |
| Candidate and context drift                        | PASS   | `lease-commitments.test.ts`; detects what the agent presents, cannot observe the outside world |
| Resume (fresh ALLOW, new epoch, ladder recomputed) | PASS   | `lease-commitments.test.ts`, `ladder-service.test.ts`                                          |
| Concurrency                                        | PASS   | `realpg-m8.test.ts`, `realpg-load.test.ts`                                                     |
| Timeline                                           | PASS   | `timeline.test.ts`, `timeline.spec.ts`                                                         |

## M9 — Verify

| Capability                                                         | Status | Evidence                                                                        |
| ------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------- |
| Attestation, selective disclosure, holder binding, replay          | PASS   | `attest-*.test.ts`, 40 attestation vectors                                      |
| Candidate and context commitments (signed) and verifier comparison | PASS   | `attest-service.test.ts`, 21 commitment vectors                                 |
| Issuer metadata, key lifecycle, status list                        | PASS   | `attest-trust.test.ts`, `attest-service.test.ts`                                |
| Authority epochs (A dead, B valid, A never returns)                | PASS   | `attest-service.test.ts`, `a2a-authority.test.ts`, `realpg.test.ts`             |
| Trust states and federation-compatible issuers                     | PASS   | explicit trust only; no registry or propagation                                 |
| Cross-agent handoff, A2A handoff                                   | PASS   | CONTROLLED, `a2a-authority.test.ts`                                             |
| Cross-surface equivalence (REST, SDK, MCP, A2A)                    | PASS   | `a2a-authority.test.ts` (service, REST, MCP, A2A); SDK shares the REST contract |
| Conformance                                                        | PASS   | Compatible v1, 110 checks                                                       |

## R6 — Hosted commissioning

| Item                                                         | Status        | Note                                                                                                  |
| ------------------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------- |
| Hosted exact-head deployment                                 | PARTIAL       | previews build READY; unconfigured (no database, auth, Qloo, origin variables on these branches)      |
| Database, Qloo, OAuth, MCP, A2A, M7, M8, M9 hosted scenarios | BLOCKED_HUMAN | needs database and Qloo secrets in the deployment; secret retrieval was refused and not worked around |
| Live external agent proof (ChatGPT, Claude, Gemini)          | BLOCKED_HUMAN | no signed-in vendor session; nothing claimed                                                          |

## R7 — Final freeze

| Item                                | Status  | Evidence                                                                                                                                    |
| ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean bootstrap                     | PASS    | fresh clone: `npm ci`, format, lint, typecheck, 833 tests on real PostgreSQL, build, conformance, TasteBench validate, 137 Playwright tests |
| Migration rehearsal                 | PASS    | `realpg-migrate.test.ts`: empty, Win Gate schema and M9 schema to latest                                                                    |
| Security review                     | PASS    | independent slices; High/Medium findings fixed with tests (`docs/security/threat-model.md`); not a penetration test                         |
| Dependency audit, SBOM, secret scan | PASS    | `docs/security/supply-chain.md`                                                                                                             |
| Load test                           | PASS    | LOCAL only (`docs/evaluation/load-local.md`)                                                                                                |
| Accessibility                       | PARTIAL | axe (WCAG 2.1 A/AA) on all pages and both colour schemes, keyboard and reduced-motion checks in Chromium; no screen-reader or human review  |
| Responsive / browsers               | PARTIAL | phone, tablet, desktop in Chromium; Firefox and WebKit could not be installed in this environment                                           |
| Docs                                | PASS    | README, ADRs 0024–0030, architecture addendum, conformance                                                                                  |
| Product truth audit                 | PARTIAL | the product pages are generated from an evidence-checked capability table; wording was audited by hand, not exhaustively                    |
