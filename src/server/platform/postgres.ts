import "server-only";
import type { PoolClient } from "pg";
import type { PlatformRepository } from "./repositories";
export function platformRepository(c: PoolClient): PlatformRepository {
  const one = async <T>(sql: string, args: unknown[]): Promise<T | null> =>
    (await c.query(sql, args)).rows[0]?.data ?? null;
  const list = async <T>(sql: string, args: unknown[]): Promise<T[]> =>
    (await c.query(sql, args)).rows.map((r) => r.data);
  const write = async (sql: string, args: unknown[]) => {
    await c.query(sql, args);
  };
  const version = async (p: import("@/lib/platform/types").PassportRecord) =>
    write(
      "INSERT INTO tastepolicy.passport_versions VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        p.passportRef,
        p.version,
        p.userId,
        p.profileId,
        p.stateVersion,
        p.stateHash,
        p,
        p.subjectRef,
      ],
    );
  return {
    sessionActive: async (u, id, now) =>
      !!(
        await c.query(
          'SELECT 1 FROM tastepolicy.platform_auth_session WHERE id=$1 AND "userId"=$2 AND "expiresAt">$3',
          [id, u, now],
        )
      ).rows.length,
    user: async (id, lock = false) =>
      !!(
        await c.query(
          "SELECT id FROM tastepolicy.platform_auth_user WHERE id=$1" +
            (lock ? " FOR UPDATE" : ""),
          [id],
        )
      ).rows.length,
    owned: (u) =>
      one("SELECT data FROM tastepolicy.taste_passports WHERE user_id=$1", [u]),
    passport: (ref) =>
      one(
        "SELECT data FROM tastepolicy.taste_passports WHERE passport_ref=$1",
        [ref],
      ),
    async insertPassport(p) {
      await write("INSERT INTO tastepolicy.platform_ownership VALUES($1,$2)", [
        p.userId,
        p.profileId,
      ]);
      await write(
        "INSERT INTO tastepolicy.taste_passports VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          p.passportRef,
          p.userId,
          p.profileId,
          p.version,
          p.expiresAt,
          p,
          p.subjectRef,
        ],
      );
      await version(p);
    },
    async updatePassport(p) {
      await version(p);
      await write(
        "UPDATE tastepolicy.taste_passports SET current_version=$2,data=$3 WHERE passport_ref=$1",
        [p.passportRef, p.version, p],
      );
    },
    version: (r, n) =>
      one(
        "SELECT data FROM tastepolicy.passport_versions WHERE passport_ref=$1 AND version=$2",
        [r, n],
      ),
    grant: (g) =>
      write(
        "INSERT INTO tastepolicy.passport_access_grants VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          g.grantId,
          g.grantorUserId,
          g.passportRef,
          g.profileId,
          g.granteeUserId,
          g.scopes,
          g.expiresAt,
          g,
        ],
      ),
    getGrant: (id) =>
      one(
        "SELECT data FROM tastepolicy.passport_access_grants WHERE grant_id=$1",
        [id],
      ),
    grants: (u) =>
      list(
        "SELECT data FROM tastepolicy.passport_access_grants WHERE user_id=$1 OR grantee_id=$1 ORDER BY grant_id",
        [u],
      ),
    revokeGrant: (g, at) =>
      write(
        "INSERT INTO tastepolicy.passport_access_events VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [g.grantId, g.grantorUserId, { kind: "GRANT_REVOKED", at }],
      ),
    grantRevoked: async (id) =>
      !!(
        await c.query(
          "SELECT 1 FROM tastepolicy.passport_access_events WHERE grant_id=$1",
          [id],
        )
      ).rows.length,
    credential: (k, h) =>
      write(
        "INSERT INTO tastepolicy.developer_credentials VALUES($1,$2,$3,$4,$5,$6)",
        [k.credentialId, k.userId, h, k.scopes, k.expiresAt, k],
      ),
    findCredential: (id, h) =>
      one(
        "SELECT data FROM tastepolicy.developer_credentials WHERE credential_id=$1 AND secret_hash=$2",
        [id, h],
      ),
    credentials: (u) =>
      list(
        "SELECT data FROM tastepolicy.developer_credentials WHERE user_id=$1 ORDER BY credential_id",
        [u],
      ),
    revokeCredential: (k, at) =>
      write(
        "INSERT INTO tastepolicy.developer_credential_events VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [k.userId, k.credentialId, { kind: "CREDENTIAL_REVOKED", at }],
      ),
    credentialRevoked: async (id) =>
      !!(
        await c.query(
          "SELECT 1 FROM tastepolicy.developer_credential_events WHERE credential_id=$1",
          [id],
        )
      ).rows.length,
    op: async (u, o, k) => {
      const row = (
        await c.query(
          "SELECT payload_hash,result FROM tastepolicy.platform_operations WHERE user_id=$1 AND operation=$2 AND key=$3",
          [u, o, k],
        )
      ).rows[0];
      return row ? { hash: row.payload_hash, result: row.result } : null;
    },
    saveOp: (u, o, k, h, v) =>
      write(
        "INSERT INTO tastepolicy.platform_operations VALUES($1,$2,$3,$4,$5)",
        [u, o, k, h, v],
      ),
    rate: async (u, b, l) => {
      const rows = (
        await c.query(
          "INSERT INTO tastepolicy.platform_rate VALUES($1,$2,1) ON CONFLICT(user_id,bucket) DO UPDATE SET used=tastepolicy.platform_rate.used+1 WHERE tastepolicy.platform_rate.used<$3 RETURNING used",
          [u, b, l],
        )
      ).rows;
      return rows.length > 0;
    },
    evaluation: (e) =>
      write(
        "INSERT INTO tastepolicy.platform_evaluations VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          e.evaluationRef,
          e.userId,
          e.passportRef,
          e.stateProfileId,
          e.stateVersion,
          e.stateHash,
          e.evaluation.evaluationId,
          e.actorId,
          e.grantId,
          e,
        ],
      ),
    getEvaluation: (r) =>
      one(
        "SELECT data FROM tastepolicy.platform_evaluations WHERE evaluation_ref=$1",
        [r],
      ),
    versions: (p) =>
      list(
        "SELECT data FROM tastepolicy.taste_state_versions WHERE profile_id=$1 ORDER BY version",
        [p],
      ),
    exports: (u, p, id, h, m) =>
      write(
        "INSERT INTO tastepolicy.passport_exports VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
        [id, u, p.passportRef, p.profileId, h, m],
      ),
    deletePassport: (r) =>
      write("DELETE FROM tastepolicy.taste_passports WHERE passport_ref=$1", [
        r,
      ]),
    async deleteUser(u, d, now, expiry) {
      await write(
        "INSERT INTO tastepolicy.account_deletion_records VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [d, now, expiry],
      );
      await write("DELETE FROM tastepolicy.platform_auth_user WHERE id=$1", [
        u,
      ]);
    },
  };
}
