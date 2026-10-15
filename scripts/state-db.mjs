import { Pool } from "pg";
import { readFile } from "node:fs/promises";
const op = process.argv[2];
if (!["migrate", "purge"].includes(op)) throw Error("Use migrate or purge");
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
    if (op === "migrate")
      await pool.query(
        await readFile(
          new URL("../migrations/0001_taste_state.sql", import.meta.url),
          "utf8",
        ),
      );
    else
      await pool.query(
        "DELETE FROM tastepolicy.taste_profiles WHERE expires_at <= now()",
      );
    process.stdout.write(
      op === "migrate"
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
