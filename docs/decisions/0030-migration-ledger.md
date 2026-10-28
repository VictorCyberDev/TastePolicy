# ADR 0030 — Migration ledger

Status: accepted (final reconciliation).

`scripts/migrate.mjs` applies `migrations/NNNN_*.sql` in order, once, recording version and SHA-256 in `public.tastepolicy_schema_migrations`. A database created by the older per-file scripts has no ledger: each migration whose sentinel table exists is recorded as baseline and not re-run. A recorded file whose checksum changed is refused. One migrator at a time (advisory lock). Migrations are additive; there are no down migrations. `vercel-build` runs it only when `TASTEPOLICY_MIGRATE_ON_BUILD=1` (intended for acceptance branches; production migrations should be a deliberate release step). Tested on real PostgreSQL: empty to latest, M9 schema to latest, Win Gate schema to latest, idempotence, concurrency, changed-file refusal.
