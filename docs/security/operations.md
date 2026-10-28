# Operations and procurement record

Version 2026-10-28. Owner: independent founder. No contractual uptime, recovery or staffed response commitment exists. This document separates implemented controls from unproved operational procedures.

## Incident response

Classify confirmed cross-account exposure, stolen production credentials, unauthorized authority expansion or corrupted proof/epoch state as critical. Availability/provider failure without exposure is a separate service incident. Record an incident UUID, UTC detection time, affected revisions/surfaces, sanitized request IDs and the observed impact. Never paste cookies, raw bodies, tokens or private preferences into an issue or status update.

Containment options: revoke affected credentials/OAuth families through the authenticated control plane; suspend/revoke affected leases; rotate exposed auth/provider/signing material through the production environment; disable the affected surface or roll back application traffic. Treat signing-key rotation separately from deleting issuer history: retained public keys/status lists may be required to explain already issued proofs. Rotation alone does not retroactively make an old proof trustworthy.

Preserve sanitized logs and database state before repair. Identify the first and last affected revisions, reproduce with synthetic data, add a meaningful regression test and deploy only a verified fix. Assess notification obligations from the actual contracts/jurisdictions and facts with counsel; do not invent a universal deadline. Notify affected people through available verified account contacts when warranted. Publish an impact-oriented incident update without disclosing exploitable detail prematurely. Complete a dated review with cause, containment, data impact, remediation owner and follow-up checks.

This process is written but has not been exercised as a production incident drill. An incident exercise remains a release/enterprise diligence task.

## Deployment and migrations

One canonical main lineage feeds Vercel production. Check exact-head CI, deployment revision, `/api/ready`, full migration checksums, fresh OAuth and authority acceptance. Use `CUSTOM_DOMAIN_MIGRATION.md` for origin changes. All current migrations are ordered additive files with a checksum ledger and an advisory migration lock. Never edit an already applied file or blindly run old down migrations.

For application regression, promote the last known good compatible deployment. For schema/data corruption, stop writes and restore into a **new isolated Neon branch**, validate ledger checksums and tenant/reference invariants, then bind a separately verified deployment. Do not point an old binary at a schema it cannot understand. Forward repair is preferred for additive schema issues. A production database restore has not yet been rehearsed and no RPO/RTO is advertised.

## Backups and deletion

Production uses a dedicated Neon branch/database/owner, separate from preview. Platform-managed storage durability is not evidence of an operator-tested backup. Exact plan restore window, backup configuration, geographical residency and restoration time require account inspection and a recorded isolated restore exercise. Do not promise a backup frequency or disaster-recovery SLA from a vendor marketing page.

Passport retention is 30 days in the current service. Owner export and account deletion were live-tested; deletion invalidates the account's developer credential. `npm run db:purge:platform` removes expired profiles, deletion tombstones and sessions when an operator runs it. No scheduled purge execution is currently proven. Database backups and provider-learned associations are not covered by a claim of instant universal erasure. The Qloo retention/learning question remains with the vendor.

## Authentication and tenant boundaries

Better Auth sessions use secure cookies; sensitive changes require recent authentication. REST keys are shown once, hashed at rest, scoped, expiring and revocable. OAuth uses S256 PKCE, exact redirect checks, resource audience binding, rotation and reuse-family revocation. OAuth access credentials are MCP-only. Every subject operation rechecks ownership or a live grant. Database tables enable RLS and revoke PUBLIC access; the application database owner bypasses RLS, so application authorization is the effective control, not a claim of independent per-tenant database isolation.

TLS endpoints and database connection settings support encryption in transit. Provider-managed at-rest encryption and backup encryption must be substantiated with the current vendor contracts/configuration before giving a buyer a specific algorithm, key-management or residency assertion. Application-held private preference fields are not independently field-encrypted today.

## Observability and response limits

Allowlisted application logs currently record event and request ID only. Readiness checks database/ledger/auth configuration and distinguishes Qloo key presence from provider reachability. CI hosted acceptance calls the real provider. These controls do **not** establish continuous error-rate, decision-latency, MCP/OAuth failure or ASK-anomaly monitoring. The required privacy-preserving aggregates and alert delivery remain implementation work. Do not collect candidate names, preference arrays, tokens or raw prompts as metric labels.

## First-pass security questionnaire

| Buyer question                  | Current evidence / answer                                                                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Legal entity / DPA              | Independent founder project. No incorporated entity or executed DPA asserted. Counsel must prepare controller/processor roles, instructions, subprocessors, deletion, transfers and breach terms before enterprise processing. |
| Certifications / external tests | None claimed. CI tests, conformance checks and a living threat model are engineering evidence only.                                                                                                                            |
| Hosting / database              | Vercel and Neon. Production binding is isolated from preview; see company ledger for exact identifiers.                                                                                                                        |
| Cultural data vendor            | Qloo. Commercial rights, output retention and DPA answers pending official inquiry.                                                                                                                                            |
| Identity / access               | Password sessions, scoped keys, OAuth consent/PKCE/rotation/revocation. SAML/SCIM and organization RBAC are not claimed.                                                                                                       |
| Auditing                        | Captured receipts, policy/lease/proof timelines and credential events. No externally immutable SIEM archive is established.                                                                                                    |
| Deletion / export               | Authenticated export and disposable-account deletion live-tested. Scheduled retention purge and backup expiry verification remain open.                                                                                        |
| Recovery / availability         | Readiness and production acceptance exist. Restore drill and contractual SLA absent.                                                                                                                                           |
| Supply chain                    | Lockfile, CycloneDX SBOM, dependency audit, pinned/checksummed Gitleaks source/history CI. See dated scan evidence.                                                                                                            |
| Support                         | Founder email, best effort. No 24/7 staffing or guaranteed response time.                                                                                                                                                      |
