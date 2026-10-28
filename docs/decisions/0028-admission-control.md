# ADR 0028 — Admission control

Status: accepted (final reconciliation).

- **Client identity.** Forwarding headers are believed only where the platform sets them (Vercel), or the single header the operator names in `TASTEPOLICY_TRUSTED_IP_HEADER`. Otherwise all callers share one bucket and a warning is logged once. IPv6 callers are keyed by /64.
- **Public verifier and status routes.** Two tiers: a per-instance window and concurrency cap, then atomic shared counters in PostgreSQL (`public_rate`), per client (60/min verify, 120/min status) and per pool (1200 and 6000 per minute). The client's own budget is spent first so one caller cannot drain the pool. Counters are keyed by an HMAC of the caller; old minutes are deleted as new ones are written. If the database is unavailable the per-instance tier still applies and is tightened. Trade-off: an attacker with many distinct client identities can still fill a pool and cause 429s for others; the pool total is what bounds database and cryptographic work.
- **Sign-in endpoints** have their own per-client limiter, separate from the authenticated agent budget.
- **OAuth endpoints** use the shared counters (ADR 0022). Registration at capacity evicts the oldest unlinked client.
- **Known limit.** The authenticated MCP/A2A budget (`acquireDemoBudget`) is still a per-process counter shared by all authenticated callers of that instance.
