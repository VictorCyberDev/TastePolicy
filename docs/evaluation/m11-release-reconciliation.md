# Canonical release reconciliation

Refreshed 2026-10-28. Candidate `06a0cda8dd75ed5de312ee3ec3bd8421532a3184`; base `35ceed937ef0bebb88b200af6f21bcc362210cb8`.

`m11-lineage.json` records full branch-tip and tree SHAs, ancestor checks, tree-diff statistics, deleted paths and migration checksums. Every stacked tip is an ancestor. No predecessor source file is deleted. The 332-file main diff contains 57,302 additions and 461 removals, including replacement of the pg connect-listener race, commitment integrity checks, schemas, SDK, tests and historical evidence. Earlier PRs must be closed only after main CI succeeds.

| Feature        | Implementation                                                                          | Regression evidence                                       |
| -------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Win Gate       | `src/features/arena`, pilot binding reporter                                            | `win-gate*`, consumer authorization/media suites          |
| M6             | `src/server/platform/{service,http,mcp,oauth-service,a2a}.ts`, SDK                      | platform, OAuth, MCP, A2A, realpg-m6                      |
| M7             | policy service/repository and control-plane UI                                          | policy, group-policy, ladder, realpg-m7                   |
| M8             | lease service/repository and machine                                                    | lease, commitment-required, realpg-m8                     |
| M9             | attest service, verifier, issuer and trust                                              | attest*, realpg, conformance 153                          |
| Reconciliation | JCS commitments, timeline, organization ceiling, disclosure                             | jcs, timeline, proof-privacy, review-fixes                |
| M10            | no-race auth pool, fail-closed partial commitments, legacy proof refusal, browser fixes | Verify 40655120408 on candidate; hosted 10/10 on M10 code |

Migrations have unique ordered IDs 0001–0011. M5 files 0001–0004 are byte-identical to main. Later files create auth/Passport, policy, lease and attestation objects in dependency order. 0009 drops only the legacy nonempty permitted-array check while preserving its vocabulary; it does not drop data. 0010 replaces set_status and guards direct status-list writes. 0011 adds owner proof-disclosure state with MINIMAL as application default. No destructive table/data migration is introduced. Tests `realpg-migrate.test.ts` prove empty bootstrap, M5/Win Gate upgrade, pre-ledger M9 upgrade, idempotence, checksum refusal and concurrent migration serialization. All passed in exact-head Verify 40655120408.

Existing hosted acceptance reports level current through readiness; an independent production migration-ledger query and production binding remain M12 work. A table sentinel can baseline pre-ledger schemas; operators must never use it to certify an arbitrary partially created schema. There are no down migrations: rollback application to a compatible release; restore database from a tested backup for data rollback.

Prior R6, final matrix and architecture reports are historical snapshots. Current claims are governed by the company-build ledger. No real ChatGPT/Claude usage, publication, production commercial Qloo rights, payment processing or final freeze is established by this release.
