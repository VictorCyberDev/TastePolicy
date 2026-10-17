// @vitest-environment node
// SYNTHETIC TEST DATA. No live Qloo claim.
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  interactiveDatabase,
  setup,
  provider,
  NOW,
  reqId,
  ALT,
  ALT2,
  exclusion,
} from "./interactive-fixtures";
import { entities } from "./qloo-fixtures";
import { TrajectoryService } from "@/server/trajectory/service";
import {
  anchorsFor,
  bridgeQueries,
  bridges,
  nextBreadth,
  permitted,
  generationHash,
} from "@/server/trajectory/bridge";
import type {
  Breadth,
  Tolerance,
  TrajectoryFeedback,
  TrajectoryGeneration,
} from "@/lib/trajectory/types";
import type { StateStore } from "@/server/state/repositories";
import { handleTrajectory } from "@/server/trajectory/http";
let d: Awaited<ReturnType<typeof interactiveDatabase>>;
const migration = () =>
  readFile(
    new URL("../migrations/0003_taste_trajectory.sql", import.meta.url),
    "utf8",
  );
beforeAll(async () => {
  d = await interactiveDatabase();
  await d.db.exec(await migration());
}, 30000);
afterAll(async () => {
  await d.db.close();
});
const request = (version: number, extra: Record<string, unknown> = {}) => ({
  expectedStateVersion: version,
  idempotencyKey: crypto.randomUUID(),
  ...extra,
});
const creation = (version: number, extra: Record<string, unknown> = {}) =>
  request(version, {
    targetId: entities[5].id,
    targetType: "destination",
    reviewed: true,
    contextKey: "trip",
    tolerance: "BALANCED",
    ...extra,
  });
async function fresh(options: Parameters<typeof setup>[1] = {}) {
  const x = await setup(d.store, options),
    service = new TrajectoryService(d.store, () => NOW),
    p = provider();
  const raw = creation(x.state.stateVersion),
    intent = await service.create(x.token, raw, () => p.q, reqId);
  return { ...x, service, intent, raw, version: x.state.stateVersion + 1 };
}
const planInput = (
  x: Awaited<ReturnType<typeof fresh>>,
  extra: Record<string, unknown> = {},
) =>
  request(x.version, {
    trajectoryId: x.intent.trajectoryId,
    breadth: "STRICT",
    ...extra,
  });
async function plan(
  x: Awaited<ReturnType<typeof fresh>>,
  extra: Record<string, unknown> = {},
  p = provider(),
) {
  return (await x.service.plan(
    x.token,
    planInput(x, extra),
    () => p.q,
    reqId,
  )) as TrajectoryGeneration;
}
it("migration 0001→0002→0003 applies and intent remains distinct from five likes", async () => {
  const x = await fresh(),
    s = (await x.stateService.read(x.token)).state;
  expect(s.stateVersion).toBe(x.version);
  expect(anchorsFor(s)).toHaveLength(5);
  expect(s.entries.filter((e) => e.kind === "EXPLORATION_INTENT")).toHaveLength(
    1,
  );
  expect(
    s.entries.find((e) => e.kind === "EXPLORATION_INTENT")?.sourceEventId,
  ).toBe(s.mutationId);
  expect(anchorsFor(s).some((e) => e.id === x.intent.target.id)).toBe(false);
});
it("exactly five discovery queries have target plus four anchors and each anchor is omitted once", () => {
  const qs = bridgeQueries(entities.slice(0, 5), entities[5]);
  expect(qs).toHaveLength(5);
  expect(new Set(qs.map((q) => q.omittedAnchorId)).size).toBe(5);
  for (const q of qs) {
    expect(q.signalIds).toHaveLength(5);
    expect(new Set(q.signalIds).size).toBe(5);
    expect(q.signalIds).toContain(entities[5].id);
    expect(
      q.signalIds.filter((id) => entities.slice(0, 5).some((e) => e.id === id)),
    ).toHaveLength(4);
    expect(q.signalIds).not.toContain(q.omittedAnchorId);
  }
  expect(() => bridgeQueries(entities.slice(0, 5), entities[2])).toThrow();
});
it("plan uses exactly five infer calls, no entities, resolution, or evaluation", async () => {
  const x = await fresh(),
    p = provider(),
    g = await plan(x, {}, p);
  expect(p.calls).toEqual(Array(5).fill("discovery-insights"));
  expect(g.candidates[0].supportCount).toBe(5);
  expect(g.candidates[0].authorizationStatus).toBe("UNVERIFIED");
});
it("membership/rank ordering and hash ignore query and storage order", async () => {
  const x = await fresh(),
    g = await plan(
      x,
      {},
      provider({
        candidates: [
          { entity: ALT2, rank: 2 },
          { entity: ALT, rank: 1 },
        ],
      }),
    ),
    state = (await x.stateService.read(x.token)).state;
  const qs = structuredClone(g.queries).reverse();
  for (const q of qs) q.result.candidates.reverse();
  expect(bridges(state, g.target, g.context, g.breadth, qs, NOW)).toEqual(
    g.candidates,
  );
  expect(generationHash({ ...g, queries: qs })).toBe(g.semanticHash);
  expect(g.candidates.map((c) => c.entity.id)).toEqual([ALT.id, ALT2.id]);
});
it("arbitrary cross-query affinity changes cannot change bridge ordering", async () => {
  const x = await fresh(),
    g = await plan(
      x,
      {},
      provider({
        candidates: [
          { entity: ALT2, rank: 2 },
          { entity: ALT, rank: 1 },
        ],
      }),
    ),
    state = (await x.stateService.read(x.token)).state;
  const qs = structuredClone(g.queries);
  for (const [i, q] of qs.entries())
    for (const c of q.result.candidates)
      c.rawAffinity = c.alignmentScore = (i + 1) / 10;
  expect(bridges(state, g.target, g.context, g.breadth, qs, NOW)).toEqual(
    g.candidates,
  );
});
it.each([
  ["CONSERVATIVE", "STRICT", true],
  ["CONSERVATIVE", "MODERATE", false],
  ["CONSERVATIVE", "BROAD", false],
  ["BALANCED", "STRICT", true],
  ["BALANCED", "MODERATE", true],
  ["BALANCED", "BROAD", false],
  ["OPEN", "BROAD", true],
] as [Tolerance, Breadth, boolean][])(
  "tolerance %s bounds %s: %s",
  (t, b, allowed) => expect(permitted(t, b)).toBe(allowed),
);
it.each([
  ["STRICT", "BALANCED", "TOO_SAFE", "MODERATE"],
  ["MODERATE", "BALANCED", "TOO_SAFE", "MODERATE"],
  ["STRICT", "CONSERVATIVE", "TOO_SAFE", "STRICT"],
  ["MODERATE", "OPEN", "TOO_SAFE", "BROAD"],
  ["BROAD", "OPEN", "TOO_ADVENTUROUS", "MODERATE"],
  ["STRICT", "OPEN", "TOO_ADVENTUROUS", "STRICT"],
  ["MODERATE", "BALANCED", "ABOUT_RIGHT", "MODERATE"],
] as [Breadth, Tolerance, TrajectoryFeedback, Breadth][])(
  "feedback %s/%s/%s gives %s",
  (b, t, f, next) => expect(nextBreadth(b, t, f)).toBe(next),
);
it("a plan beyond tolerance is rejected before provider construction", async () => {
  const x = await fresh(),
    factory = vi.fn();
  await expect(
    x.service.plan(x.token, planInput(x, { breadth: "BROAD" }), factory, reqId),
  ).rejects.toThrow("TOLERANCE_EXCEEDED");
  expect(factory).not.toHaveBeenCalled();
});
it("STRICT has no automatic widening; MODERATE requires explicit choice", async () => {
  const x = await fresh(),
    p = provider(),
    original = p.q.infer;
  let index = 0;
  p.q.infer = async (q) => {
    const r = await original(q);
    if (r.status === "available" && index++ > 1) r.data.candidates = [];
    return r;
  };
  const g = await plan(x, {}, p);
  expect(g.status).toBe("NO_BRIDGE_AT_CURRENT_BREADTH");
  expect(g.breadth).toBe("STRICT");
  const p2 = provider(),
    f = p2.q.infer;
  index = 0;
  p2.q.infer = async (q) => {
    const r = await f(q);
    if (r.status === "available" && index++ > 1) r.data.candidates = [];
    return r;
  };
  const next = await plan(x, { breadth: "MODERATE" }, p2);
  expect(next.candidates[0].supportCount).toBe(2);
});
it("target, anchors, unsupported types and applicable independent blocks are excluded", async () => {
  const x = await fresh({ feedback: { ...exclusion, candidateId: ALT.id } }),
    g = await plan(
      x,
      {},
      provider({
        candidates: [
          { entity: ALT, rank: 1 },
          { entity: entities[5], rank: 2 },
          { entity: entities[0], rank: 3 },
          { entity: ALT2, rank: 4 },
        ],
      }),
    );
  expect(g.candidates.map((c) => c.entity.id)).toEqual([ALT2.id]);
});
it.each([0, 1, 2, 3, 4])(
  "failure in required query %i produces unavailable with no partial support",
  async (fail) => {
    const x = await fresh(),
      p = provider(),
      infer = p.q.infer;
    let n = 0;
    p.q.infer = async (q) =>
      n++ === fail ? { status: "unavailable", reason: "timeout" } : infer(q);
    const g = await plan(x, {}, p);
    expect(n).toBe(5);
    expect(g.status).toBe("TRAJECTORY_UNAVAILABLE");
    expect(g.queries).toEqual([]);
    expect(g.candidates).toEqual([]);
    expect(g.reason).toBe("timeout");
  },
);
it("same completed plan key replays before stale check with zero provider work; changed payload conflicts", async () => {
  const x = await fresh(),
    raw = planInput(x),
    p = provider(),
    g = await x.service.plan(x.token, raw, () => p.q, reqId);
  await x.stateService.mutate(
    x.token,
    request(x.version, {
      payload: {
        kind: "FEEDBACK",
        feedback: { ...exclusion, candidateId: ALT2.id },
      },
    }),
    reqId,
  );
  const factory = vi.fn();
  expect(await x.service.plan(x.token, raw, factory, reqId)).toEqual(g);
  expect(factory).not.toHaveBeenCalled();
  await expect(
    x.service.plan(x.token, { ...raw, breadth: "MODERATE" }, factory, reqId),
  ).rejects.toThrow("IDEMPOTENCY_KEY_CONFLICT");
});
it("intent creation retry replays before lookup and before stale rejection", async () => {
  const x = await fresh(),
    factory = vi.fn();
  expect(await x.service.create(x.token, x.raw, factory, reqId)).toEqual(
    x.intent,
  );
  expect(factory).not.toHaveBeenCalled();
  await expect(
    x.service.create(x.token, { ...x.raw, tolerance: "OPEN" }, factory, reqId),
  ).rejects.toThrow("IDEMPOTENCY_KEY_CONFLICT");
});
it("authorization uses original five signals even when target-mixed discovery would allow", async () => {
  const x = await fresh(),
    g = await plan(x),
    p = provider(),
    infer = p.q.infer,
    seen: string[][] = [];
  p.q.infer = async (q) => {
    seen.push([...q.signalIds]);
    const r = await infer(q);
    if (r.status === "available")
      for (const c of r.data.candidates)
        c.rawAffinity = c.alignmentScore = q.signalIds.includes(
          x.intent.target.id,
        )
          ? 0.99
          : 0.2;
    return r;
  };
  const e = await x.service.evaluate(
    x.token,
    {
      trajectoryId: x.intent.trajectoryId,
      generationId: g.generationId,
      candidateId: ALT.id,
      expectedStateVersion: x.version,
    },
    () => p.q,
    reqId,
  );
  expect(seen.map((ids) => [...ids].sort())).toEqual([
    entities
      .slice(0, 5)
      .map((e) => e.id)
      .sort(),
  ]);
  expect(e.decision.outcome).toBe("REJECT");
  expect(p.calls).toEqual(["entities", "candidate-insights"]);
  await expect(
    x.service.event(
      x.token,
      request(x.version, {
        trajectoryId: x.intent.trajectoryId,
        generationId: g.generationId,
        evaluationId: e.evaluationId,
      }),
      reqId,
    ),
  ).rejects.toThrow("INVALID_INPUT");
});
it.each([
  ["ALLOW", 0.9],
  ["ASK", 0.65],
  ["REJECT", 0.2],
  ["UNAVAILABLE", -1],
] as const)(
  "target %s remains normal authorization, no execution or automatic completion",
  async (outcome, score) => {
    const x = await fresh(),
      p = provider(score < 0 ? { failure: "timeout" } : { score });
    const e = await x.service.evaluate(
      x.token,
      {
        trajectoryId: x.intent.trajectoryId,
        candidateId: x.intent.target.id,
        expectedStateVersion: x.version,
      },
      () => p.q,
      reqId,
    );
    expect(e.decision.outcome).toBe(outcome);
    expect(
      (await x.service.read(x.token, { trajectoryId: x.intent.trajectoryId }))
        .status,
    ).toBe("ACTIVE");
    const raw = request(x.version, {
      trajectoryId: x.intent.trajectoryId,
      evaluationId: e.evaluationId,
    });
    if (outcome === "ALLOW") {
      const factory = vi.fn();
      expect(
        (await x.service.plan(x.token, planInput(x), factory, reqId)).status,
      ).toBe("DIRECT_TARGET_AVAILABLE");
      expect(factory).not.toHaveBeenCalled();
      await x.service.event(x.token, raw, reqId);
      expect(
        (await x.service.read(x.token, { trajectoryId: x.intent.trajectoryId }))
          .status,
      ).toBe("COMPLETE");
    } else
      await expect(x.service.event(x.token, raw, reqId)).rejects.toThrow(
        "INVALID_INPUT",
      );
  },
);
it("ASK step requires linked M2.5 final ALLOW and preserves original cultural ASK", async () => {
  const x = await fresh(),
    g = await plan(x),
    p = provider({ candidateScore: 0.65 });
  const e = await x.service.evaluate(
    x.token,
    {
      trajectoryId: x.intent.trajectoryId,
      generationId: g.generationId,
      candidateId: ALT.id,
      expectedStateVersion: x.version,
    },
    () => p.q,
    reqId,
  );
  expect(e.decision.outcome).toBe("ASK");
  const cplan = await x.interactive.plan(x.token, {
    evaluationId: e.evaluationId,
  });
  const c = await x.interactive.answer(
    x.token,
    request(x.version, {
      evaluationId: e.evaluationId,
      planId: cplan.planId,
      answer: { kind: "DISPOSITION", value: "ACCEPTABLE" },
    }),
    reqId,
  );
  const event = await x.service.event(
    x.token,
    request(x.version, {
      trajectoryId: x.intent.trajectoryId,
      generationId: g.generationId,
      evaluationId: e.evaluationId,
      clarificationId: c.interactionId,
    }),
    reqId,
  );
  expect(event.kind).toBe("STEP_AUTHORIZED");
  expect(
    c.originalEvaluation.cultural.status === "available" &&
      c.originalEvaluation.cultural.data.decision.outcome,
  ).toBe("ASK");
});
it("local feedback is atomic/idempotent, changes breadth only, and STOP prevents planning", async () => {
  const x = await fresh();
  await plan(x);
  const raw = request(x.version, {
      trajectoryId: x.intent.trajectoryId,
      feedback: "TOO_SAFE",
    }),
    before = (await x.stateService.read(x.token)).state;
  const e = await x.service.event(x.token, raw, reqId);
  expect(e.breadth).toBe("MODERATE");
  expect(await x.service.event(x.token, raw, reqId)).toEqual(e);
  await expect(
    x.service.event(x.token, { ...raw, feedback: "ABOUT_RIGHT" }, reqId),
  ).rejects.toThrow("IDEMPOTENCY_KEY_CONFLICT");
  expect((await x.stateService.read(x.token)).state).toEqual(before);
  await x.service.event(
    x.token,
    request(x.version, {
      trajectoryId: x.intent.trajectoryId,
      feedback: "STOP_EXPLORING",
    }),
    reqId,
  );
  await expect(plan(x)).rejects.toThrow("STOPPED");
});
it("state advance marks stale; refresh is explicit and removing intent stops planning", async () => {
  const x = await fresh();
  await plan(x);
  await x.stateService.mutate(
    x.token,
    request(x.version, {
      payload: {
        kind: "FEEDBACK",
        feedback: { ...exclusion, candidateId: ALT2.id },
      },
    }),
    reqId,
  );
  x.version++;
  expect(
    (await x.service.read(x.token, { trajectoryId: x.intent.trajectoryId }))
      .status,
  ).toBe("STALE");
  await expect(plan(x)).rejects.toThrow("STALE");
  const g = await plan(x, { refresh: true });
  expect(g.stateVersion).toBe(x.version);
  await x.stateService.mutate(
    x.token,
    request(x.version, {
      payload: { kind: "REMOVE", signalId: x.intent.signalId },
    }),
    reqId,
  );
  x.version++;
  expect(anchorsFor((await x.stateService.read(x.token)).state)).toHaveLength(
    5,
  );
  await expect(plan(x, { refresh: true })).rejects.toThrow("STOPPED");
});
it("historical replay has zero provider construction and tampered captured evidence fails closed", async () => {
  const x = await fresh(),
    g = await plan(x);
  expect(
    (await x.service.replay(x.token, { generationId: g.generationId }))
      .generation,
  ).toEqual(g);
  const corrupt: StateStore = {
    transaction: (fn) =>
      d.store.transaction((r) =>
        fn({
          ...r,
          trajectories: {
            ...r.trajectories,
            async generation(p, id) {
              const v = await r.trajectories.generation(p, id);
              if (v) v.queries[0].result.candidates[0].rank = 8;
              return v;
            },
          },
        }),
      ),
  };
  await expect(
    new TrajectoryService(corrupt, () => NOW).replay(x.token, {
      generationId: g.generationId,
    }),
  ).rejects.toThrow("INTEGRITY_ERROR");
});
it("generation transaction rollback leaves no generation, candidates or consumed quota", async () => {
  const x = await fresh(),
    before = await d.db.query(
      "SELECT count(*) FROM tastepolicy.trajectory_generations",
    );
  const broken: StateStore = {
    transaction: (fn) =>
      d.store.transaction((r) =>
        fn({
          ...r,
          trajectories: {
            ...r.trajectories,
            async insertGeneration(g) {
              await r.trajectories.insertGeneration(g);
              throw Error("injected");
            },
          },
        }),
      ),
  };
  await expect(
    new TrajectoryService(broken, () => NOW).plan(
      x.token,
      planInput(x),
      () => provider().q,
      reqId,
    ),
  ).rejects.toThrow("injected");
  expect(
    await d.db.query("SELECT count(*) FROM tastepolicy.trajectory_generations"),
  ).toEqual(before);
});
it("cross-profile access and identical idempotency keys remain isolated", async () => {
  const x = await fresh(),
    y = await fresh(),
    g = await plan(x);
  for (const op of [
    () => y.service.read(y.token, { trajectoryId: x.intent.trajectoryId }),
    () => y.service.replay(y.token, { generationId: g.generationId }),
    () => y.service.plan(y.token, planInput(x), () => provider().q, reqId),
    () =>
      y.service.event(
        y.token,
        request(y.version, {
          trajectoryId: x.intent.trajectoryId,
          feedback: "STOP_EXPLORING",
        }),
        reqId,
      ),
  ])
    await expect(op()).rejects.toThrow("NOT_FOUND");
  const key = "same-key-both-profiles";
  await x.service.plan(
    x.token,
    planInput(x, { idempotencyKey: key }),
    () => provider().q,
    reqId,
  );
  await expect(
    y.service.plan(
      y.token,
      planInput(y, { idempotencyKey: key }),
      () => provider().q,
      reqId,
    ),
  ).resolves.toBeTruthy();
});
it("SQL prevents cross-profile state linkage and captured generation updates", async () => {
  const x = await fresh(),
    y = await fresh(),
    g = await plan(x);
  await expect(
    d.db.query(
      "UPDATE tastepolicy.trajectory_generations SET data=data WHERE profile_id=$1 AND generation_id=$2",
      [g.profileId, g.generationId],
    ),
  ).rejects.toThrow("Immutable");
  await expect(
    d.db.query(
      "INSERT INTO tastepolicy.trajectory_generations SELECT $1,trajectory_id,$2,state_version,breadth,$3,payload_hash,semantic_hash,data FROM tastepolicy.trajectory_generations WHERE profile_id=$4 AND generation_id=$5",
      [
        y.intent.profileId,
        crypto.randomUUID(),
        crypto.randomUUID(),
        x.intent.profileId,
        g.generationId,
      ],
    ),
  ).rejects.toThrow();
  await expect(
    d.db.query(
      "INSERT INTO tastepolicy.trajectory_candidates SELECT $1,trajectory_id,generation_id,state_version,candidate_id,support,position,data FROM tastepolicy.trajectory_candidates WHERE profile_id=$2 AND generation_id=$3",
      [y.intent.profileId, x.intent.profileId, g.generationId],
    ),
  ).rejects.toThrow();
});
it("profile purge cascades trajectory evidence, projections and events", async () => {
  const x = await fresh(),
    g = await plan(x);
  await x.service.event(
    x.token,
    request(x.version, {
      trajectoryId: x.intent.trajectoryId,
      feedback: "ABOUT_RIGHT",
    }),
    reqId,
  );
  await d.db.query(
    "DELETE FROM tastepolicy.taste_profiles WHERE profile_id=$1",
    [x.intent.profileId],
  );
  for (const table of [
    "trajectory_intents",
    "trajectory_generations",
    "trajectory_candidates",
    "trajectory_events",
  ])
    expect(
      (
        await d.db.query<{ count: number }>(
          `SELECT count(*)::integer AS count FROM tastepolicy.${table} WHERE profile_id=$1`,
          [g.profileId],
        )
      ).rows[0].count,
    ).toBe(0);
});
it("filesystem close/reopen preserves trajectory and actual SQL projection", async () => {
  const path = await mkdtemp(join(tmpdir(), "taste-trajectory-"));
  let db: Awaited<ReturnType<typeof interactiveDatabase>> | undefined;
  try {
    db = await interactiveDatabase(path);
    await db.db.exec(await migration());
    const x = await setup(db.store),
      s = new TrajectoryService(db.store, () => NOW),
      t = await s.create(x.token, creation(1), () => provider().q, reqId),
      g = (await s.plan(
        x.token,
        request(2, { trajectoryId: t.trajectoryId, breadth: "STRICT" }),
        () => provider().q,
        reqId,
      )) as TrajectoryGeneration;
    await db.db.close();
    db = await interactiveDatabase(path, false);
    expect(
      (
        await new TrajectoryService(db.store, () => NOW).replay(x.token, {
          generationId: g.generationId,
        })
      ).generation,
    ).toEqual(g);
  } finally {
    await db?.db.close();
    await rm(path, { recursive: true, force: true });
  }
});
it.each([
  ["https://evil.test", "application/json", 403],
  ["https://taste.test", "text/plain", 415],
] as const)("protected HTTP rejects %s/%s", async (origin, type, status) => {
  const r = await handleTrajectory(
    new Request("https://taste.test/api/state/trajectory/plan", {
      method: "POST",
      headers: { origin, "content-type": type },
      body: "{}",
    }),
    "plan",
    new TrajectoryService(d.store, () => NOW),
    vi.fn(),
  );
  expect(r.status).toBe(status);
});
it("unconfigured persistence has no fallback; provider errors are sanitized", async () => {
  const r = await handleTrajectory(
    new Request("https://taste.test/api/state/trajectory/plan", {
      method: "POST",
      headers: {
        origin: "https://taste.test",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    "plan",
    null,
    vi.fn(),
  );
  expect(r.status).toBe(503);
  expect(await r.json()).toEqual({
    status: "unavailable",
    reason: "persistence_not_configured",
  });
});
it("SQL rejects cross-trajectory candidates, orphan state versions and wrong-version evaluation linkage", async () => {
  const x = await fresh(),
    y = await fresh(),
    g = await plan(x);
  await expect(
    d.db.query(
      "INSERT INTO tastepolicy.trajectory_candidates SELECT profile_id,$1,generation_id,state_version,candidate_id,support,position,data FROM tastepolicy.trajectory_candidates WHERE profile_id=$2 AND generation_id=$3",
      [y.intent.trajectoryId, x.intent.profileId, g.generationId],
    ),
  ).rejects.toThrow();
  await expect(
    d.db.query(
      "INSERT INTO tastepolicy.trajectory_generations SELECT profile_id,trajectory_id,$1,999,breadth,$2,payload_hash,semantic_hash,data FROM tastepolicy.trajectory_generations WHERE profile_id=$3 AND generation_id=$4",
      [
        crypto.randomUUID(),
        crypto.randomUUID(),
        x.intent.profileId,
        g.generationId,
      ],
    ),
  ).rejects.toThrow();
  await expect(
    d.db.query(
      "INSERT INTO tastepolicy.trajectory_events VALUES($1,$2,$3,$4,$5,$6,$7,NULL,'STEP_AUTHORIZED',$8,$9,'{}'::jsonb)",
      [
        x.intent.profileId,
        x.intent.trajectoryId,
        crypto.randomUUID(),
        x.version,
        g.generationId,
        ALT.id,
        x.e.evaluationId,
        crypto.randomUUID(),
        "a".repeat(64),
      ],
    ),
  ).rejects.toThrow();
});
it("SQL rejects cross-profile event and forged clarification linkage", async () => {
  const x = await fresh(),
    y = await fresh(),
    g = await plan(x),
    p = provider();
  const e = await x.service.evaluate(
    x.token,
    {
      trajectoryId: x.intent.trajectoryId,
      generationId: g.generationId,
      candidateId: ALT.id,
      expectedStateVersion: x.version,
    },
    () => p.q,
    reqId,
  );
  await expect(
    d.db.query(
      "INSERT INTO tastepolicy.trajectory_events VALUES($1,$2,$3,$4,NULL,NULL,NULL,NULL,'TRAJECTORY_FEEDBACK',$5,$6,'{}'::jsonb)",
      [
        y.intent.profileId,
        x.intent.trajectoryId,
        crypto.randomUUID(),
        y.version,
        crypto.randomUUID(),
        "a".repeat(64),
      ],
    ),
  ).rejects.toThrow();
  await expect(
    d.db.query(
      "INSERT INTO tastepolicy.trajectory_events VALUES($1,$2,$3,$4,$5,$6,$7,$8,'STEP_AUTHORIZED',$9,$10,'{}'::jsonb)",
      [
        x.intent.profileId,
        x.intent.trajectoryId,
        crypto.randomUUID(),
        x.version,
        g.generationId,
        ALT.id,
        e.evaluationId,
        crypto.randomUUID(),
        crypto.randomUUID(),
        "a".repeat(64),
      ],
    ),
  ).rejects.toThrow();
});
it("feedback write failure rolls back events and quota together", async () => {
  const x = await fresh();
  const before = await d.db.query(
    "SELECT count(*) FROM tastepolicy.trajectory_events",
  );
  const broken: StateStore = {
    transaction: (fn) =>
      d.store.transaction((r) =>
        fn({
          ...r,
          trajectories: {
            ...r.trajectories,
            async insertEvent(e) {
              await r.trajectories.insertEvent(e);
              throw Error("event failure");
            },
          },
        }),
      ),
  };
  await expect(
    new TrajectoryService(broken, () => NOW).event(
      x.token,
      request(x.version, {
        trajectoryId: x.intent.trajectoryId,
        feedback: "TOO_SAFE",
      }),
      reqId,
    ),
  ).rejects.toThrow("event failure");
  expect(
    await d.db.query("SELECT count(*) FROM tastepolicy.trajectory_events"),
  ).toEqual(before);
});
it("target identity review and supported type are required and browser labels are rejected", async () => {
  const x = await fresh(),
    factory = vi.fn();
  for (const raw of [
    creation(x.version, { reviewed: false }),
    creation(x.version, { targetType: "artist" }),
    creation(x.version, { name: "browser invented" }),
    creation(x.version, { targetId: entities[0].id }),
  ])
    await expect(
      x.service.create(x.token, raw, factory, reqId),
    ).rejects.toThrow("INVALID_INPUT");
  expect(factory).not.toHaveBeenCalled();
});
it("explicitly blocked target stays REJECT without constructing a provider", async () => {
  const x = await fresh({ feedback: exclusion }),
    factory = vi.fn();
  const e = await x.service.evaluate(
    x.token,
    {
      trajectoryId: x.intent.trajectoryId,
      candidateId: x.intent.target.id,
      expectedStateVersion: x.version,
    },
    factory,
    reqId,
  );
  expect(e.decision.outcome).toBe("REJECT");
  expect(factory).not.toHaveBeenCalled();
});
it("new generations honor feedback chronology even with identical timestamps", async () => {
  const x = await fresh();
  await plan(x);
  await x.service.event(
    x.token,
    request(x.version, {
      trajectoryId: x.intent.trajectoryId,
      feedback: "TOO_SAFE",
    }),
    reqId,
  );
  expect(
    (await x.service.read(x.token, { trajectoryId: x.intent.trajectoryId }))
      .breadth,
  ).toBe("MODERATE");
  await plan(x, { breadth: "STRICT" });
  expect(
    (await x.service.read(x.token, { trajectoryId: x.intent.trajectoryId }))
      .breadth,
  ).toBe("STRICT");
});
