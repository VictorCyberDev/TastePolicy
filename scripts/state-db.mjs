import { Pool } from "pg";
import { readFile } from "node:fs/promises";
const op = process.argv[2];
if (
  ![
    "migrate",
    "migrate-interactive",
    "migrate-trajectory",
    "migrate-subjects",
    "migrate-platform",
    "migrate-policy",
    "purge",
    "purge-platform",
  ].includes(op)
)
  throw Error(
    "Use migrate, migrate-interactive, migrate-trajectory, migrate-subjects, migrate-platform, migrate-policy, purge-platform or purge",
  );
if (!process.env.DATABASE_URL) {
  process.stdout.write("M2_REMOTE_PERSISTENCE_ENVIRONMENT_BLOCKED\n");
  process.exitCode = 1;
} else {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  try {
    if (op.startsWith("migrate"))
      await pool.query(
        await readFile(
          new URL(
            op === "migrate"
              ? "../migrations/0001_taste_state.sql"
              : op === "migrate-interactive"
                ? "../migrations/0002_interactive_authorization.sql"
                : op === "migrate-trajectory"
                  ? "../migrations/0003_taste_trajectory.sql"
                  : op === "migrate-subjects"
                    ? "../migrations/0004_taste_proxy_group.sql"
                    : op === "migrate-platform"
                      ? "../migrations/0005_platformization.sql"
                      : "../migrations/0006_policy_control_plane.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
    else if (op === "purge-platform") {
      await pool.query(
        "DELETE FROM tastepolicy.taste_profiles WHERE expires_at<=now()",
      );
      await pool.query(
        "DELETE FROM tastepolicy.account_deletion_records WHERE expires_at<=now()",
      );
      await pool.query(
        'DELETE FROM tastepolicy.platform_auth_session WHERE "expiresAt"<=now()',
      );
      await pool.query(
        "DELETE FROM tastepolicy.platform_rate WHERE split_part(bucket,':',2)<to_char(now()-interval '2 days','YYYY-MM-DD')",
      );
    } else
      await pool.query(
        "DELETE FROM tastepolicy.taste_profiles WHERE expires_at <= now()",
      );
    process.stdout.write(
      op.startsWith("migrate")
        ? "M2_MIGRATION_APPLIED\n"
        : "M2_EXPIRED_PROFILES_PURGED\n",
    );
  } catch {
    process.stderr.write("M2_DATABASE_OPERATION_FAILED\n");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
