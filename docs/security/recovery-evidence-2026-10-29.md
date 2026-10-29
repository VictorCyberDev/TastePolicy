# Production recovery and operations evidence — 2026-10-29

## Scope

This record closes the internal M21 recovery/monitoring evidence gap without claiming external certification, contracted uptime or a scheduled Neon snapshot policy.

## Production database

- Neon project: `holy-heart-68306654`
- Production branch: `br-little-king-za6unmfo` (`tastepolicy-production`)
- Production database: `tastepolicy_production`
- Production database owner: `tastepolicy_production_owner`

## Fresh recovery verification

A new branch was created directly from the production branch:

- Branch: `br-mute-cloud-zacmusc5`
- Name: `tastepolicy-m21-recovery-verification-20261029`
- Parent: `br-little-king-za6unmfo`
- Parent timestamp: `2026-10-29T14:20:16Z`
- State: ready
- Auto-expiry: `2026-11-05T23:59:00Z`

`compare_database_schema` against production returned an empty diff.

Read-only integrity counters matched exactly at the checkpoint:

| Counter | Production | Recovery |
| --- | ---: | ---: |
| Schema migrations | 13 | 13 |
| Auth users | 3 | 3 |
| Taste Passports | 1 | 1 |
| Cultural receipts | 2 | 2 |
| Developer workspaces | 1 | 1 |

The recovery branch was not promoted, did not write production data and is intentionally ephemeral.

## Production monitoring

`.github/workflows/production-monitor.yml` runs every 15 minutes and can also be dispatched manually. Scheduled run `40889688687` executed on exact main `63913d103e722d65b649ba983a8707242e85ef80` and completed successfully on 2026-10-29.

Canonical production runtime logs on deployment `dpl_Eyz3vk8Rm1x7KEDcftdU7N9UG9S2` show privacy-safe `tastepolicy_operation_v1` events for DATABASE, QLOO, DECISION, REST, MCP, OAUTH and A2A. Events contain surface, outcome, duration and timestamp rather than request payloads/private taste state.

The same window includes intentional ERROR outcomes from unauthenticated/challenge/negative acceptance traffic; an ERROR event alone is not an incident. Hosted acceptance on exact main is separately green.

## Claim boundary

This evidence demonstrates that a production-derived recovery copy can be created, has matching schema and selected integrity counters, and that scheduled public-surface monitoring is running. It does not claim SOC 2, ISO 27001, third-party penetration testing, a formal RTO/RPO contract, or an automatic snapshot schedule for the production child branch.
