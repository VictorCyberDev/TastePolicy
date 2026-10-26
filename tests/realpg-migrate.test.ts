// @vitest-environment node
import { randomBytes } from "node:crypto";
import { readFile, readdir, mkdtemp, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Pool } from "pg";
// @ts-expect-error plain ESM script
import { migrate } from "../scripts/migrate.mjs";
import { REAL_URL } from "./realpg-fixture";

const suite = REAL_URL ? describe : describe.skip;
const MIGRATIONS = new URL("../migrations/", import.meta.url).pathname;
async function fresh() {
  const admin = new Pool({ connectionString: REAL_URL, max: 1 }),
    name = "tp_mig_" + randomBytes(6).toString("hex");
  await admin.query(`CREATE DATABASE ${name}`);
  const url = new URL(REAL_URL!);
  url.pathname = "/" + name;
  const pool = new Pool({ connectionString: url.toString(), max: 4 });
  pool.on("error", () => {});
  pool.on("connect", (c) => c.on("error", () => {}));
  return {
    pool,
    async drop() {
      await pool.end();
      await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}
const files = async () =>
  (await readdir(MIGRATIONS)).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();

suite("migrations: bootstrap, upgrade, idempotence", () => {
  it("empty database → latest, recorded; a second run changes nothing", async () => {
    const d = await fresh();
    try {
      const all = await files();
      const first = await migrate(d.pool);
      expect(first.applied).toEqual(all);
      expect(first.baselined).toEqual([]);
      expect(first.level).toBe(all.at(-1)!.slice(0, 4));
      const again = await migrate(d.pool);
      expect([again.applied, again.baselined]).toEqual([[], []]);
      // the latest schema is really there
      const t = await d.pool.query(
        "SELECT to_regclass('tastepolicy.platform_leases') AS a, to_regclass('tastepolicy.attestations') AS b",
      );
      expect(t.rows[0]).toEqual({
        a: "tastepolicy.platform_leases",
        b: "tastepolicy.attestations",
      });
    } finally {
      await d.drop();
    }
  }, 120000);
  it("a database at the M9 schema (files 0001-0008 applied by hand, no ledger) → latest without re-running anything", async () => {
    const d = await fresh();
    try {
      const all = await files();
      for (const f of all.filter((x) => Number(x.slice(0, 4)) <= 8))
        await d.pool.query(await readFile(MIGRATIONS + f, "utf8"));
      const out = await migrate(d.pool);
      expect(out.baselined).toEqual(
        all.filter((x) => Number(x.slice(0, 4)) <= 8),
      );
      expect(out.applied).toEqual(all.filter((x) => Number(x.slice(0, 4)) > 8));
      // data written before the upgrade survives it (status lists exist and work)
      const r = await d.pool.query(
        "SELECT count(*)::int AS n FROM tastepolicy.attestation_status_lists",
      );
      expect(r.rows[0].n).toBeGreaterThanOrEqual(1);
    } finally {
      await d.drop();
    }
  }, 120000);
  it("a database at the Win Gate schema (0001-0004) → latest", async () => {
    const d = await fresh();
    try {
      const all = await files();
      for (const f of all.filter((x) => Number(x.slice(0, 4)) <= 4))
        await d.pool.query(await readFile(MIGRATIONS + f, "utf8"));
      const out = await migrate(d.pool);
      expect(out.baselined.length).toBe(4);
      expect(out.applied).toEqual(all.filter((x) => Number(x.slice(0, 4)) > 4));
    } finally {
      await d.drop();
    }
  }, 120000);
  it("a recorded migration whose file changed is refused; concurrent migrators serialize", async () => {
    const d = await fresh();
    try {
      await Promise.all([migrate(d.pool), migrate(d.pool)]);
      const rows = await d.pool.query(
        "SELECT count(*)::int AS n FROM public.tastepolicy_schema_migrations",
      );
      expect(rows.rows[0].n).toBe((await files()).length);
      const dir = await mkdtemp(join(tmpdir(), "mig-"));
      await cp(MIGRATIONS, dir + "/", { recursive: true });
      await writeFile(
        join(dir, "0006_policy_control_plane.sql"),
        "-- changed\nSELECT 1;",
      );
      await expect(migrate(d.pool, { dir: dir + "/" })).rejects.toThrow(
        /MIGRATION_CHANGED_AFTER_APPLY:0006/,
      );
    } finally {
      await d.drop();
    }
  }, 120000);
});
