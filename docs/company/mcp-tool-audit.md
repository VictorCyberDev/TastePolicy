# MCP behavior and Authority Card audit

Version 2026-10-28. Contract source: `src/lib/platform/contracts.ts`; actual transport annotations: `src/server/platform/mcp.ts`; per-operation output schemas: `mcp-output.ts`. No listing approval or real assistant commissioning is implied.

| Tool               | Scope                                         | Read-only | Destructive | Idempotent | Open world | Confirmation / effect                                                                     |
| ------------------ | --------------------------------------------- | --------- | ----------- | ---------- | ---------- | ----------------------------------------------------------------------------------------- |
| capabilities       | credential                                    | yes       | no          | yes        | no         | Describes the granted credential and limits                                               |
| get_authority      | PASSPORT_READ                                 | yes       | no          | yes        | no         | Scoped Passport summary; no permission expansion                                          |
| get_policy         | PASSPORT_READ                                 | yes       | no          | yes        | no         | Resolved rules; owner changes remain account-only                                         |
| evaluate_choice    | TASTE_EVALUATE                                | no        | no          | yes        | yes        | Qloo request and captured decision, keyed replay; ASK is not approval                     |
| get_receipt        | RECEIPT_READ                                  | yes       | no          | yes        | no         | Captured evidence; may reveal reviewed cultural inputs                                    |
| get_status         | RECEIPT_READ                                  | yes       | no          | yes        | no         | Captured decision; no fresh authority grant                                               |
| request_lease      | TASTE_EVALUATE                                | no        | no          | yes        | no         | New bounded lease; confirmation ASK waits for the owner; missing-fact ASK is not leasable |
| verify_lease       | RECEIPT_READ                                  | no        | yes         | yes        | no         | Current checks may suspend/end authority and invalidate epochs; not a read-only operation |
| checkpoint_lease   | TASTE_EVALUATE                                | no        | yes         | no         | no         | Can extend checkpoint or end authority; repeated calls advance time                       |
| resume_lease       | TASTE_EVALUATE                                | no        | yes         | yes        | no         | Requires a fresh matching ALLOW; settling can end old authority                           |
| release_lease      | TASTE_EVALUATE                                | no        | yes         | yes        | no         | Ends authority, cannot revive it                                                          |
| issue_attestation  | TASTE_EVALUATE                                | no        | yes         | no         | no         | Creates a proof; settling stale authority can end its epoch                               |
| verify_attestation | authenticated credential, no additional scope | no        | no          | no         | yes        | Remote issuer/status inputs and replay records; verification is not authorization         |

Names above omit the common `tastepolicy_` prefix. Titles/descriptions/input schemas are declared with the shared contract. Output schemas identify mandatory response fields for each operation instead of an unconstrained empty object. Failures use stable codes, retry flags and request IDs; malformed input, revoked credentials and missing commitments fail explicitly. A tool error cannot be rendered as ALLOW.

## Authority Card

The evaluate/receipt/lease/proof tools advertise `ui://tastepolicy/authority-card.html` with the current MCP Apps metadata. A registered resource serves MIME `text/html;profile=mcp-app`. The pinned official MCP Apps 2.0.4 SDK handles host messaging. A build script bundles local HTML/TypeScript, with no external scripts, network connections or embedded user data. Resource CSP declares empty connect/resource domain lists.

The card displays only tool-supplied action, agent, subject/Passport, candidate, context, policy ceiling/trace, decision, ASK reasons, receipt reference, lease and proof status. It never invents missing Qloo affinity. An explicit read-only receipt action can call the existing scoped receipt tool; a missing scope stays an error. Dynamic values use textContent, not HTML injection. Full text/JSON evidence remains accessible in native details controls and the MCP tool result.

There is no in-card approve button. Owner confirmation and policy expansion remain in the authenticated control plane. A proof or receipt cannot authorize purchase, payment, booking, messaging, account, private-data or legal action. Generic-host protocol tests are distinct from real ChatGPT/Claude commissioning, which remains blocked on signed-in browser access.

## Verification

MCP client regression tests read the registered UI resource, check MIME/metadata and confirm no credential is embedded. Existing tests cover no auth, scopes, malformed input, expiring/revoked credentials, OAuth rotation, provider-unavailable decisions, one-sided commitments, stale leases and revoked epochs across the shared services. Full exact-head CI and live assistant visual evidence remain release gates.
