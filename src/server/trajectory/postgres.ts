import type { PoolClient } from "pg";
import type { TrajectoryRepository } from "./repositories";
import type {
  TrajectoryIntent,
  TrajectoryGeneration,
  TrajectoryEvent,
  BridgeCandidate,
} from "@/lib/trajectory/types";
export function trajectoryRepository(c: PoolClient): TrajectoryRepository {
  async function rows<T>(
    table: string,
    where: string,
    args: unknown[],
  ): Promise<T[]> {
    return (
      await c.query(
        `SELECT data FROM tastepolicy.${table} WHERE ${where}`,
        args,
      )
    ).rows.map((r) => r.data as T);
  }
  const intent = (p: string, id: string) =>
    rows<TrajectoryIntent>(
      "trajectory_intents",
      "profile_id=$1 AND trajectory_id=$2",
      [p, id],
    ).then((r) => r[0] ?? null);
  async function generation(
    p: string,
    value: string,
    byKey = false,
  ): Promise<TrajectoryGeneration | null> {
    const [g] = await rows<TrajectoryGeneration>(
      "trajectory_generations",
      `profile_id=$1 AND ${byKey ? "key" : "generation_id"}=$2`,
      [p, value],
    );
    if (!g) return null;
    // Read the actual relational projection too; a missing/altered child must fail replay.
    const candidates = await rows<BridgeCandidate>(
      "trajectory_candidates",
      "profile_id=$1 AND generation_id=$2 ORDER BY position",
      [p, g.generationId],
    );
    return { ...g, candidates };
  }
  return {
    intent,
    intentByKey: (p, k) =>
      rows<TrajectoryIntent>("trajectory_intents", "profile_id=$1 AND key=$2", [
        p,
        k,
      ]).then((r) => r[0] ?? null),
    async insertIntent(x) {
      await c.query(
        "INSERT INTO tastepolicy.trajectory_intents VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          x.profileId,
          x.trajectoryId,
          x.intentStateVersion,
          x.signalId,
          x.target.id,
          x.target.type,
          x.tolerance,
          x.key,
          x.payloadHash,
          x,
        ],
      );
    },
    generation: (p, id) => generation(p, id),
    generationByKey: (p, k) => generation(p, k, true),
    async generations(p, id) {
      const gs = await rows<TrajectoryGeneration>(
        "trajectory_generations",
        "profile_id=$1 AND trajectory_id=$2 ORDER BY (data->>'ordinal')::integer",
        [p, id],
      );
      return Promise.all(
        gs.map((g) => generation(p, g.generationId).then((g) => g!)),
      );
    },
    async insertGeneration(g) {
      await c.query(
        "INSERT INTO tastepolicy.trajectory_generations VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          g.profileId,
          g.trajectoryId,
          g.generationId,
          g.stateVersion,
          g.breadth,
          g.key,
          g.payloadHash,
          g.semanticHash,
          g,
        ],
      );
      for (const [i, v] of g.candidates.entries())
        await c.query(
          "INSERT INTO tastepolicy.trajectory_candidates VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            g.profileId,
            g.trajectoryId,
            g.generationId,
            g.stateVersion,
            v.entity.id,
            v.supportCount,
            i + 1,
            v,
          ],
        );
    },
    eventByKey: (p, k) =>
      rows<TrajectoryEvent>("trajectory_events", "profile_id=$1 AND key=$2", [
        p,
        k,
      ]).then((r) => r[0] ?? null),
    events: (p, id) =>
      rows<TrajectoryEvent>(
        "trajectory_events",
        "profile_id=$1 AND trajectory_id=$2 ORDER BY (data->>'ordinal')::integer",
        [p, id],
      ),
    async insertEvent(e) {
      await c.query(
        "INSERT INTO tastepolicy.trajectory_events VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [
          e.profileId,
          e.trajectoryId,
          e.eventId,
          e.stateVersion,
          e.generationId,
          e.candidateId,
          e.evaluationId,
          e.clarificationId,
          e.kind,
          e.key,
          e.payloadHash,
          e,
        ],
      );
    },
  };
}
