import type { PoolClient } from "pg";
import type { ClarificationRepository, RepairRepository } from "./repositories";
import type {
  ClarificationRecord,
  RepairRecord,
} from "@/lib/interactive/types";
export function interactiveRepositories(c: PoolClient): {
  clarifications: ClarificationRepository;
  repairs: RepairRepository;
} {
  const clarification = async (
    field: "clarification_id" | "idempotency_key",
    profile: string,
    value: string,
  ): Promise<ClarificationRecord | null> => {
    const r = await c.query(
      `SELECT * FROM tastepolicy.clarification_records WHERE profile_id=$1 AND ${field}=$2`,
      [profile, value],
    );
    const x = r.rows[0];
    return x
      ? {
          id: x.clarification_id,
          profileId: x.profile_id,
          evaluationId: x.evaluation_id,
          stateVersion: x.state_version,
          parentId: x.parent_id,
          factor: x.factor_kind,
          plan: x.plan,
          answer: x.answer,
          result: x.result,
          key: x.idempotency_key,
          payloadHash: x.payload_hash,
          createdAt: x.created_at.toISOString(),
        }
      : null;
  };
  const repair = async (
    field: "repair_id" | "idempotency_key",
    profile: string,
    value: string,
  ): Promise<RepairRecord | null> => {
    const r = await c.query(
      `SELECT * FROM tastepolicy.repair_records WHERE profile_id=$1 AND ${field}=$2`,
      [profile, value],
    );
    const x = r.rows[0];
    return x
      ? {
          id: x.repair_id,
          profileId: x.profile_id,
          evaluationId: x.evaluation_id,
          stateVersion: x.state_version,
          verificationId: x.verification_id,
          status: x.status,
          result: x.result,
          key: x.idempotency_key,
          payloadHash: x.payload_hash,
          createdAt: x.created_at.toISOString(),
        }
      : null;
  };
  return {
    clarifications: {
      find: (p, id) => clarification("clarification_id", p, id),
      byKey: (p, k) => clarification("idempotency_key", p, k),
      async insert(x) {
        await c.query(
          "INSERT INTO tastepolicy.clarification_records VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
          [
            x.id,
            x.profileId,
            x.evaluationId,
            x.stateVersion,
            x.parentId,
            x.factor,
            x.plan,
            x.answer,
            x.result,
            x.key,
            x.payloadHash,
            x.createdAt,
          ],
        );
      },
    },
    repairs: {
      find: (p, id) => repair("repair_id", p, id),
      byKey: (p, k) => repair("idempotency_key", p, k),
      async insert(x) {
        await c.query(
          "INSERT INTO tastepolicy.repair_records VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
          [
            x.id,
            x.profileId,
            x.evaluationId,
            x.stateVersion,
            x.verificationId,
            x.status,
            JSON.stringify(x.result.preservedConstraints),
            JSON.stringify(x.result.changeSet),
            x.result,
            x.key,
            x.payloadHash,
            x.createdAt,
          ],
        );
      },
    },
  };
}
