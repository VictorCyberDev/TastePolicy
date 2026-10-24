import "server-only";
import type { PoolClient } from "pg";
import type { PlatformEvaluation } from "@/lib/platform/types";
import type {
  PolicyDecision,
  PolicyDocument,
  PolicyOverride,
} from "@/lib/policy/types";

export interface PolicyVersionRow {
  version: number;
  docHash: string;
  document: PolicyDocument;
  parentVersion: number | null;
  createdAt: string;
  note: string | null;
}
export interface PolicyRepository {
  active(ref: string): Promise<PolicyVersionRow | null>;
  version(ref: string, n: number): Promise<PolicyVersionRow | null>;
  versions(ref: string, limit: number): Promise<PolicyVersionRow[]>;
  latest(ref: string): Promise<number>;
  insertVersion(
    ref: string,
    userId: string,
    row: PolicyVersionRow,
  ): Promise<void>;
  setActive(ref: string, version: number): Promise<void>;
  overrides(ref: string): Promise<PolicyOverride[]>;
  insertOverride(ref: string, userId: string, o: PolicyOverride): Promise<void>;
  revokeOverride(ref: string, id: string, at: string): Promise<boolean>;
  recordDecision(
    evaluationRef: string,
    ref: string,
    d: PolicyDecision,
  ): Promise<void>;
  decision(evaluationRef: string): Promise<PolicyDecision | null>;
  evaluations(ref: string, limit: number): Promise<PlatformEvaluation[]>;
}
const row = (r: Record<string, unknown>): PolicyVersionRow => ({
  version: r.version as number,
  docHash: r.doc_hash as string,
  document: r.document as PolicyDocument,
  parentVersion: r.parent_version as number | null,
  createdAt: new Date(r.created_at as string).toISOString(),
  note: r.note as string | null,
});
export function policyRepository(c: PoolClient): PolicyRepository {
  return {
    async active(ref) {
      const q = await c.query(
        "SELECT v.* FROM tastepolicy.policy_active a JOIN tastepolicy.policy_versions v ON v.passport_ref=a.passport_ref AND v.version=a.version WHERE a.passport_ref=$1",
        [ref],
      );
      return q.rows[0] ? row(q.rows[0]) : null;
    },
    async version(ref, n) {
      const q = await c.query(
        "SELECT * FROM tastepolicy.policy_versions WHERE passport_ref=$1 AND version=$2",
        [ref, n],
      );
      return q.rows[0] ? row(q.rows[0]) : null;
    },
    async versions(ref, limit) {
      return (
        await c.query(
          "SELECT * FROM tastepolicy.policy_versions WHERE passport_ref=$1 ORDER BY version DESC LIMIT $2",
          [ref, limit],
        )
      ).rows.map(row);
    },
    async latest(ref) {
      return (
        await c.query(
          "SELECT COALESCE(MAX(version),0) AS n FROM tastepolicy.policy_versions WHERE passport_ref=$1",
          [ref],
        )
      ).rows[0].n as number;
    },
    async insertVersion(ref, userId, v) {
      await c.query(
        "INSERT INTO tastepolicy.policy_versions(passport_ref,version,user_id,doc_hash,document,parent_version,created_at,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          ref,
          v.version,
          userId,
          v.docHash,
          v.document,
          v.parentVersion,
          v.createdAt,
          v.note,
        ],
      );
    },
    async setActive(ref, version) {
      await c.query(
        "INSERT INTO tastepolicy.policy_active(passport_ref,version) VALUES($1,$2) ON CONFLICT(passport_ref) DO UPDATE SET version=EXCLUDED.version",
        [ref, version],
      );
    },
    async overrides(ref) {
      return (
        await c.query(
          "SELECT data, revoked_at FROM tastepolicy.policy_overrides WHERE passport_ref=$1 ORDER BY created_at DESC, override_id LIMIT 200",
          [ref],
        )
      ).rows.map(
        (r) =>
          ({
            ...r.data,
            ...(r.revoked_at
              ? { revokedAt: new Date(r.revoked_at).toISOString() }
              : {}),
          }) as PolicyOverride,
      );
    },
    async insertOverride(ref, userId, o) {
      await c.query(
        "INSERT INTO tastepolicy.policy_overrides(override_id,passport_ref,user_id,effect,created_at,expires_at,data) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [o.overrideId, ref, userId, o.effect, o.createdAt, o.expiresAt, o],
      );
    },
    async revokeOverride(ref, id, at) {
      const q = await c.query(
        "UPDATE tastepolicy.policy_overrides SET revoked_at=$3, data=data WHERE passport_ref=$1 AND override_id=$2 AND revoked_at IS NULL",
        [ref, id, at],
      );
      return (q.rowCount ?? 0) > 0;
    },
    async recordDecision(evaluationRef, ref, d) {
      await c.query(
        "INSERT INTO tastepolicy.platform_policy_decisions(evaluation_ref,passport_ref,policy_version,base_outcome,final_outcome,data) VALUES($1,$2,$3,$4,$5,$6)",
        [evaluationRef, ref, d.policyVersion, d.baseOutcome, d.outcome, d],
      );
    },
    async decision(evaluationRef) {
      const q = await c.query(
        "SELECT data FROM tastepolicy.platform_policy_decisions WHERE evaluation_ref=$1",
        [evaluationRef],
      );
      return (q.rows[0]?.data as PolicyDecision) ?? null;
    },
    async evaluations(ref, limit) {
      return (
        await c.query(
          "SELECT data FROM tastepolicy.platform_evaluations WHERE passport_ref=$1 ORDER BY (data->'evaluation'->>'evaluatedAt') DESC, evaluation_ref LIMIT $2",
          [ref, limit],
        )
      ).rows.map((r) => r.data as PlatformEvaluation);
    },
  };
}
