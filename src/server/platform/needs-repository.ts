import "server-only";
import type { PoolClient } from "pg";

export interface NeedsRepository {
  get(passportRef: string): Promise<unknown | null>;
  set(
    passportRef: string,
    userId: string,
    needs: unknown,
    at: string,
  ): Promise<void>;
}
export function needsRepository(c: PoolClient): NeedsRepository {
  return {
    async get(ref) {
      const q = await c.query(
        "SELECT needs FROM tastepolicy.passport_needs WHERE passport_ref=$1",
        [ref],
      );
      return q.rows[0]?.needs ?? null;
    },
    async set(ref, userId, needs, at) {
      await c.query(
        "INSERT INTO tastepolicy.passport_needs(passport_ref,user_id,needs,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT(passport_ref) DO UPDATE SET user_id=EXCLUDED.user_id, needs=EXCLUDED.needs, updated_at=EXCLUDED.updated_at",
        [ref, userId, JSON.stringify(needs), at],
      );
    },
  };
}
