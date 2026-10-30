import { attestRepository } from "@/server/platform/attest-repository";
import { needsRepository } from "@/server/platform/needs-repository";
import { leaseRepository } from "@/server/platform/lease-repository";
import { policyRepository } from "@/server/platform/policy-repository";
import { oauthRepository } from "@/server/platform/oauth-repository";
import { platformRepository } from "@/server/platform/postgres";
import { subjectRepositories } from "@/server/subjects/postgres";
import { trajectoryRepository } from "@/server/trajectory/postgres";
import { interactiveRepositories } from "@/server/interactive/postgres";
import "server-only";
import { Pool, type PoolClient } from "pg";
import type { Repositories, StateStore } from "./repositories";
import type {
  Profile,
  StateVersion,
  FeedbackEvent,
  StateEvaluation,
} from "@/lib/state/types";
function repositories(c: PoolClient): Repositories {
  const one = async <T>(sql: string, values: unknown[]): Promise<T | null> => {
    const r = await c.query(sql, values);
    return r.rows[0]?.data ?? null;
  };
  const write = async (sql: string, values: unknown[]) => {
    await c.query(sql, values);
  };
  return {
    ...interactiveRepositories(c),
    ...subjectRepositories(c),
    platform: platformRepository(c),
    policy: policyRepository(c),
    leases: leaseRepository(c),
    attest: attestRepository(c),
    needs: needsRepository(c),
    oauth: oauthRepository(c),
    trajectories: trajectoryRepository(c),
    states: {
      profile: (id, lock = false) =>
        one<Profile>(
          "SELECT data FROM tastepolicy.taste_profiles WHERE profile_id=$1" +
            (lock ? " FOR UPDATE" : ""),
          [id],
        ),
      create: (p) =>
        write("INSERT INTO tastepolicy.taste_profiles VALUES($1,$2,$3,$4)", [
          p.profileId,
          p.currentStateVersion,
          p.expiresAt,
          p,
        ]),
      version: (id, n) =>
        one<StateVersion>(
          "SELECT data FROM tastepolicy.taste_state_versions WHERE profile_id=$1 AND version=$2",
          [id, n],
        ),
      async insertVersion(s) {
        await write(
          "INSERT INTO tastepolicy.taste_state_versions VALUES($1,$2,$3,$4,$5,$6)",
          [
            s.profileId,
            s.stateVersion,
            s.parentVersion,
            s.mutationId,
            s.stateHash,
            s,
          ],
        );
        for (const e of s.entries)
          await write(
            "INSERT INTO tastepolicy.taste_signals VALUES($1,$2,$3,$4)",
            [s.profileId, s.stateVersion, e.signalId, e],
          );
      },
      advance: (id, n) =>
        write(
          "UPDATE tastepolicy.taste_profiles SET current_version=$2,data=jsonb_set(data,'{currentStateVersion}',to_jsonb($2::integer)) WHERE profile_id=$1",
          [id, n],
        ),
    },
    mutations: {
      async find(id, key) {
        const r = await c.query(
          "SELECT payload_hash,result FROM tastepolicy.mutation_records WHERE profile_id=$1 AND key=$2",
          [id, key],
        );
        return r.rows[0]
          ? {
              profileId: id,
              key,
              payloadHash: r.rows[0].payload_hash,
              result: r.rows[0].result,
            }
          : null;
      },
      insert: (r) =>
        write(
          "INSERT INTO tastepolicy.mutation_records VALUES($1,$2,$3,$4,$5,$6)",
          [
            r.profileId,
            r.key,
            r.result.mutationId,
            r.result.state.stateVersion,
            r.payloadHash,
            r.result,
          ],
        ),
    },
    feedback: {
      insert: (e) =>
        write("INSERT INTO tastepolicy.feedback_events VALUES($1,$2,$3,$4)", [
          e.eventId,
          e.profileId,
          e.stateVersion,
          e,
        ]),
      async list(id) {
        return (
          await c.query(
            "SELECT data FROM tastepolicy.feedback_events WHERE profile_id=$1 ORDER BY event_id",
            [id],
          )
        ).rows.map((r) => r.data as FeedbackEvent);
      },
    },
    evidence: {
      async insert(b) {
        await write(
          "INSERT INTO tastepolicy.provider_evidence_bundles VALUES($1,$2,$3,$4)",
          [b.bundleId, b.profileId, b.stateVersion, b],
        );
        const r = b.receipt;
        await write(
          "INSERT INTO tastepolicy.provider_evidence_items VALUES($1,$2,$3)",
          [
            b.bundleId,
            r.candidate.id,
            {
              candidate: r.candidate,
              qlooEvidence: r.qlooEvidence,
              alignmentScore: r.alignmentScore,
              explainability: r.explainability,
            },
          ],
        );
      },
    },
    proposals: {
      async insert(e) {
        await write(
          "INSERT INTO tastepolicy.decision_contexts VALUES($1,$2,$3,$4)",
          [e.evaluationId, e.profileId, e.stateVersion, e.context],
        );
        await write(
          "INSERT INTO tastepolicy.agent_proposals VALUES($1,$2,$3,$4,$5,$6)",
          [
            e.evaluationId,
            e.profileId,
            e.stateVersion,
            e.evaluationId,
            e.agentId,
            e.action,
          ],
        );
      },
    },
    receipts: {
      insert: (e) =>
        write(
          "INSERT INTO tastepolicy.cultural_receipts VALUES($1,$2,$3,$4,$5,$6)",
          [
            e.evaluationId,
            e.profileId,
            e.stateVersion,
            e.evaluationId,
            e.cultural.status === "available" ? e.evaluationId : null,
            e,
          ],
        ),
      find: (id, eid) =>
        one<StateEvaluation>(
          "SELECT data FROM tastepolicy.cultural_receipts WHERE profile_id=$1 AND evaluation_id=$2",
          [id, eid],
        ),
      async list(id) {
        return (
          await c.query(
            "SELECT data FROM tastepolicy.cultural_receipts WHERE profile_id=$1 ORDER BY data->>'evaluatedAt',evaluation_id",
            [id],
          )
        ).rows.map((r) => r.data as StateEvaluation);
      },
    },
    sessions: {
      async find(h, lock = false) {
        const r = await c.query(
          "SELECT token_hash,profile_id,expires_at,mutations FROM tastepolicy.demo_mutation_sessions WHERE token_hash=$1" +
            (lock ? " FOR UPDATE" : ""),
          [h],
        );
        return r.rows[0]
          ? {
              tokenHash: r.rows[0].token_hash,
              profileId: r.rows[0].profile_id,
              expiresAt: r.rows[0].expires_at.toISOString(),
              mutations: r.rows[0].mutations,
            }
          : null;
      },
      insert: (s) =>
        write(
          "INSERT INTO tastepolicy.demo_mutation_sessions VALUES($1,$2,$3,$4)",
          [s.tokenHash, s.profileId, s.expiresAt, s.mutations],
        ),
      consume: (h) =>
        write(
          "UPDATE tastepolicy.demo_mutation_sessions SET mutations=mutations+1 WHERE token_hash=$1",
          [h],
        ),
      purge: (now) =>
        write("DELETE FROM tastepolicy.taste_profiles WHERE expires_at <= $1", [
          now,
        ]),
    },
  };
}
export class PostgresStateStore implements StateStore {
  constructor(readonly pool: Pool) {}
  async transaction<T>(fn: (r: Repositories) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const result = await fn(repositories(c));
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
}
let store: PostgresStateStore | undefined;
export function getStateStore(): PostgresStateStore | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  const u = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(u.protocol))
    throw Error("Invalid database configuration");
  store ??= new PostgresStateStore(
    new Pool({
      connectionString,
      max: 3,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      statement_timeout: 5000,
    }),
  );
  return store;
}
