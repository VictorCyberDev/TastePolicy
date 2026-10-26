// Ordered, recorded, idempotent migrations.
//   node scripts/migrate.mjs            apply everything not yet applied
//   node scripts/migrate.mjs --if-enabled   same, but only when
//                                       TASTEPOLICY_MIGRATE_ON_BUILD=1 (build hook)
//   node scripts/migrate.mjs --status   print the ledger and what is pending
// The ledger is public.tastepolicy_schema_migrations (version, checksum,
// applied_at). A database that already has the schema from the older per-file
// scripts has no ledger: each migration whose tables are present is recorded
// as applied (never re-run), and the rest are applied in order. A recorded
// migration whose file changed is refused. One migrator at a time (advisory
// lock); each file runs in its own transaction (the files carry BEGIN/COMMIT).
// Migrations are additive; there is no down migration.
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const DIR = fileURLToPath(new URL("../migrations/", import.meta.url));
// A table that exists only once that migration has run.
const SENTINEL = {
  "0001_taste_state.sql": "taste_state_versions",
  "0002_interactive_authorization.sql": "clarification_records",
  "0003_taste_trajectory.sql": "trajectory_intents",
  "0004_taste_proxy_group.sql": "taste_groups",
  "0005_platformization.sql": "platform_auth_user",
  "0006_policy_control_plane.sql": "policy_versions",
  "0007_preference_authority_leases.sql": "platform_leases",
  "0008_verifiable_attestations.sql": "attestations",
};
const sum = (s) => createHash("sha256").update(s).digest("hex");

export async function migrate(pool, { dir = DIR, log = () => {} } = {}) {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(7710026)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS public.tastepolicy_schema_migrations(version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now(), baseline boolean NOT NULL DEFAULT false)",
    );
    const files = (await readdir(dir))
      .filter((f) => /^\d{4}_.*\.sql$/.test(f))
      .sort();
    const ledger = new Map(
      (
        await client.query(
          "SELECT version, checksum FROM public.tastepolicy_schema_migrations",
        )
      ).rows.map((r) => [r.version, r.checksum]),
    );
    const applied = [],
      baselined = [];
    for (const f of files) {
      const sql = await readFile(dir + f, "utf8"),
        checksum = sum(sql);
      if (ledger.has(f)) {
        if (ledger.get(f) !== checksum)
          throw Error(`MIGRATION_CHANGED_AFTER_APPLY:${f}`);
        continue;
      }
      // Pre-ledger database: the schema is already there; record, do not re-run.
      const probe = SENTINEL[f];
      if (probe) {
        const has = await client.query("SELECT to_regclass($1) AS t", [
          `tastepolicy.${probe}`,
        ]);
        if (has.rows[0].t) {
          await client.query(
            "INSERT INTO public.tastepolicy_schema_migrations(version,checksum,baseline) VALUES($1,$2,true)",
            [f, checksum],
          );
          baselined.push(f);
          continue;
        }
      }
      await client.query(sql);
      await client.query(
        "INSERT INTO public.tastepolicy_schema_migrations(version,checksum) VALUES($1,$2)",
        [f, checksum],
      );
      applied.push(f);
      log(`applied ${f}`);
    }
    return {
      applied,
      baselined,
      level: files.at(-1)?.slice(0, 4) ?? null,
    };
  } finally {
    await client.query("SELECT pg_advisory_unlock(7710026)").catch(() => {});
    client.release();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const flag = process.argv[2];
  if (
    flag === "--if-enabled" &&
    process.env.TASTEPOLICY_MIGRATE_ON_BUILD !== "1"
  ) {
    console.log("migrate: skipped (TASTEPOLICY_MIGRATE_ON_BUILD is not 1)");
  } else if (!process.env.DATABASE_URL) {
    console.error("migrate: DATABASE_URL is not set");
    process.exitCode = 1;
  } else {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 10000,
    });
    pool.on("error", () => {});
    try {
      if (flag === "--status") {
        const r = await pool.query(
          "SELECT version, baseline, applied_at FROM public.tastepolicy_schema_migrations ORDER BY version",
        );
        console.log(JSON.stringify(r.rows, null, 2));
      } else {
        const out = await migrate(pool, {
          log: (m) => console.log("migrate:", m),
        });
        console.log(
          `migrate: level ${out.level}; applied ${out.applied.length}, baselined ${out.baselined.length}`,
        );
      }
    } catch (e) {
      console.error("migrate: FAILED", e instanceof Error ? e.message : e);
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  }
}
