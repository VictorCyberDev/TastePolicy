# Owner application control plane

This is an owner-operated workspace model, not multi-member organization RBAC. One Free workspace contains up to three projects, two environments per project and ten agents per environment. These are protective enrollment limits. Existing shared API admission limits remain separate from billing.

Application namespaces record development/production intent but do not imply isolated physical databases or automatic mock data. A private Passport still belongs to its person, and namespace membership grants no access to another person's preferences.

A developer credential can be bound once to a registered agent and its environment. Evaluations and lease operations enforce the identifier on bound keys. Rebinding is refused; revoke and issue another key for a different identity. Existing unbound keys retain their account-wide scope. OAuth-linked assistants use their separate consent/family lifecycle and cannot be attached as developer keys.

Revoking a registered agent is atomic with ending matching live leases, updating issued proof status and revoking bound keys. It applies to that identifier across the owner's environments. Re-registering a revoked identifier cannot resurrect it. Historic receipts can still describe the old decision and do not restore permission.

Dashboard counts aggregate captured outcomes for the owner. ASK rate shows its denominator. Recorded lease statuses require fresh verification for current use. Evidence timestamps are capture times, not a live provider-health measurement. Metadata can be exported separately; account deletion cascades workspace/project/environment/agent/binding and internal simulated billing rows.

The billing controls are explicitly INTERNAL_SANDBOX. Simulated invoices never charge money or change LIVE entitlement. A real payment-provider registration, webhook integration and sandbox acceptance remain separate M20 gates.
