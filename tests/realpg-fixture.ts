// Real PostgreSQL fixture (no PGlite): separate connections, real row locks and
// real concurrency. Enabled by TASTEPOLICY_TEST_DATABASE_URL (a server the test
// may create and drop databases on). CI provides a postgres service container.
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { PostgresStateStore } from "@/server/state/postgres";
import { createAuthentication } from "@/server/platform/auth";

export const REAL_URL = process.env.TASTEPOLICY_TEST_DATABASE_URL;
const FILES = [
  "0001_taste_state.sql",
  "0002_interactive_authorization.sql",
  "0003_taste_trajectory.sql",
  "0004_taste_proxy_group.sql",
  "0005_platformization.sql",
  "0006_policy_control_plane.sql",
  "0007_preference_authority_leases.sql",
  "0008_verifiable_attestations.sql",
];
export async function realDatabase() {
  const admin = new Pool({ connectionString: REAL_URL, max: 1 }),
    name = "tp_test_" + randomBytes(6).toString("hex");
  await admin.query(`CREATE DATABASE ${name}`);
  const url = new URL(REAL_URL!);
  url.pathname = "/" + name;
  const pool = new Pool({ connectionString: url.toString(), max: 16 });
  for (const f of FILES)
    await pool.query(
      await readFile(new URL(`../migrations/${f}`, import.meta.url), "utf8"),
    );
  // Dropping the database terminates idle clients; that is expected.
  pool.on("error", () => {});
  await pool.query("SET search_path=tastepolicy");
  pool.on("connect", (c) => void c.query("SET search_path=tastepolicy"));
  const authSecret = randomBytes(48).toString("base64url");
  const auth = createAuthentication(
    pool,
    authSecret,
    "https://tastepolicy.test",
  );
  const store = new PostgresStateStore(pool);
  return {
    pool,
    store,
    auth,
    async close() {
      await pool.end();
      await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}
