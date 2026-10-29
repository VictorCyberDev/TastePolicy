// Test-only real PostgreSQL (WASM). No production import or runtime fallback.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { PostgresStateStore } from "@/server/state/postgres";
export async function testDatabase(dataDir?: string, migrate = true) {
  const db = await PGlite.create(dataDir ?? "memory://");
  if (migrate)
    await db.exec(
      await readFile(
        new URL("../migrations/0001_taste_state.sql", import.meta.url),
        "utf8",
      ),
    );
  let tail = Promise.resolve();
  const pool = {
    async query(sql: string, values?: unknown[]) {
      const client = await pool.connect();
      try {
        return await client.query(sql, values);
      } finally {
        client.release();
      }
    },
    async connect() {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((r) => {
        release = r;
      });
      await previous;
      return {
        query: async (sql: string, values?: unknown[]) => db.query(sql, values),
        release,
      };
    },
  } as unknown as Pool;
  return { db, store: new PostgresStateStore(pool) };
}
