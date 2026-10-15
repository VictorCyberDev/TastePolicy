// @vitest-environment node
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { testDatabase } from "./state-database";
import { TasteStateService, stateHash } from "@/server/state/service";
import { stateDecision, applicable } from "@/server/state/policy";
import { contextGraph, stateDiff } from "@/server/state/graph";
import {
  feedbackInput,
  mutationInput,
  evaluationInput,
} from "@/server/state/validation";
import { handleState, SESSION_COOKIE } from "@/server/state/http";
import { canonical } from "@/lib/state/canonical";
import { hash } from "@/server/state/hash";
import { syntheticReceipt } from "./receipt-presentation-fixture";
import {
  FEEDBACK_CATEGORIES,
  SCOPES,
  PERSISTENCE,
  type StateEntry,
  type StateVersion,
  type Context,
  type FeedbackInput,
} from "@/lib/state/types";
import type { QlooProvider } from "@/server/qloo/contracts";
import type { Repositories, StateStore } from "@/server/state/repositories";
let database: Awaited<ReturnType<typeof testDatabase>>;
const receipt = syntheticReceipt(0.9),
  context: Context = { key: "trip", domain: "destination" },
  now = "2026-10-14T17:00:00.000Z";
beforeAll(async () => {
  database = await testDatabase();
}, 30000);
afterAll(async () => {
  await database.db.close();
});
function service(store = database.store) {
  return new TasteStateService(store, () => now);
}
function request(payload: unknown, n = 1, key = crypto.randomUUID()) {
  return { expectedStateVersion: n, idempotencyKey: key, payload };
}
async function ready(s = service()) {
  const session = await s.createSession();
  await s.mutate(
    session.token,
    request({ kind: "INITIALIZE", signals: receipt.inputSignals }, 0),
    receipt.requestId,
  );
  return { s, token: session.token };
}
const feedback: FeedbackInput = {
  category: "SPECIFIC_DISLIKE",
  scope: "CANDIDATE_ONLY",
  persistence: "DURABLE",
  candidateId: receipt.candidate.id,
};
const proposal = (n = 1, agent = "Agent-A") => ({
  agentId: agent,
  expectedStateVersion: n,
  candidate: receipt.candidate,
  context,
});
const good = () =>
  ({
    resolve: vi.fn(),
    entities: vi.fn(async () => ({
      status: "available",
      data: [...receipt.inputSignals, receipt.candidate],
    })),
    infer: vi.fn(async (query: { signalIds: string[] }) => ({
      status: "available",
      data: {
        candidates: [
          {
            entity: receipt.candidate,
            rawAffinity: 0.9,
            alignmentScore: 0.9,
            scale: "unit",
            rank: 1,
            explainability: receipt.explainability,
          },
        ],
        provenance: {
          ...receipt.qlooEvidence.provenance,
          signalIds: query.signalIds,
        },
      },
    })),
  }) as unknown as QlooProvider;
it("canonical serialization ignores object order and rejects nonfinite/undefined array values", () => {
  expect(canonical({ b: 2, a: 1 })).toBe(canonical({ a: 1, b: 2 }));
  for (const v of [NaN, Infinity, [undefined]])
    expect(() => canonical(v)).toThrow();
});
it("initial state is immutable and version N+1 stores a canonical snapshot", async () => {
  const { s, token } = await ready();
  const data = await s.read(token);
  expect(data.state.stateVersion).toBe(1);
  expect(data.previous!.entries).toEqual([]);
  expect(data.state.entries).toHaveLength(5);
  expect(stateHash([...data.state.entries].reverse())).toBe(
    data.state.stateHash,
  );
  const original = structuredClone(data.state);
  await s.mutate(
    token,
    request({ kind: "FEEDBACK", feedback }),
    receipt.requestId,
  );
  const next = await s.read(token);
  expect(next.state.stateVersion).toBe(2);
  expect(next.previous).toEqual(original);
  expect(stateDiff(original, next.state).feedbackEventIds).toHaveLength(1);
  expect(stateDiff(original, next.state).changedConstraints).toHaveLength(1);
  await expect(
    database.db.query(
      "UPDATE tastepolicy.taste_state_versions SET data=data WHERE profile_id=$1",
      [data.profile.profileId],
    ),
  ).rejects.toThrow("Immutable");
});
it("idempotency returns original result BEFORE stale version rejection, changed payload conflicts", async () => {
  const { s, token } = await ready(),
    req = request({ kind: "FEEDBACK", feedback });
  const result = await s.mutate(token, req, receipt.requestId);
  await s.mutate(
    token,
    request(
      { kind: "FEEDBACK", feedback: { ...feedback, comment: "another" } },
      2,
    ),
    receipt.requestId,
  );
  expect(await s.mutate(token, req, crypto.randomUUID())).toEqual(result);
  await expect(
    s.mutate(
      token,
      {
        ...req,
        payload: {
          kind: "FEEDBACK",
          feedback: { ...feedback, comment: "different" },
        },
      },
      receipt.requestId,
    ),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
  expect((await s.read(token)).state.stateVersion).toBe(3);
});
it("concurrent conflicting writers produce exactly one new version and no partial event", async () => {
  const { s, token } = await ready();
  const results = await Promise.allSettled([
    s.mutate(token, request({ kind: "FEEDBACK", feedback }), receipt.requestId),
    s.mutate(token, request({ kind: "FEEDBACK", feedback }), receipt.requestId),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "STATE_VERSION_CONFLICT" },
  });
  const data = await s.read(token);
  expect(data.feedback).toHaveLength(1);
  expect(data.state.stateVersion).toBe(2);
});
it("same key concurrent retries create one event/version", async () => {
  const { s, token } = await ready(),
    req = request({ kind: "FEEDBACK", feedback });
  const [a, b] = await Promise.all([
    s.mutate(token, req, receipt.requestId),
    s.mutate(token, req, receipt.requestId),
  ]);
  expect(a).toEqual(b);
  expect((await s.read(token)).feedback).toHaveLength(1);
});
it.each(["insertVersion", "feedback", "mutation", "advance"] as const)(
  "SQL failure at %s rolls all records back",
  async (point) => {
    const { s, token } = await ready();
    const failing: StateStore = {
      transaction: (fn) =>
        database.store.transaction(async (r) => {
          const proxy: Repositories = {
            ...r,
            states: {
              ...r.states,
              insertVersion: async (v) => {
                await r.states.insertVersion(v);
                if (point === "insertVersion") throw Error("injected");
              },
              advance: async (id, n) => {
                await r.states.advance(id, n);
                if (point === "advance") throw Error("injected");
              },
            },
            feedback: {
              ...r.feedback,
              insert: async (e) => {
                await r.feedback.insert(e);
                if (point === "feedback") throw Error("injected");
              },
            },
            mutations: {
              ...r.mutations,
              insert: async (e) => {
                await r.mutations.insert(e);
                if (point === "mutation") throw Error("injected");
              },
            },
          };
          return fn(proxy);
        }),
    };
    await expect(
      new TasteStateService(failing, () => now).mutate(
        token,
        request({ kind: "FEEDBACK", feedback }),
        receipt.requestId,
      ),
    ).rejects.toThrow("injected");
    const data = await s.read(token);
    expect(data.state.stateVersion).toBe(1);
    expect(data.feedback).toEqual([]);
    expect(
      await database.store.transaction((r) =>
        r.states.version(data.profile.profileId, 2),
      ),
    ).toBeNull();
  },
);
it("ephemeral feedback persists bounded event without durable signal/version", async () => {
  const { s, token } = await ready();
  const result = await s.mutate(
    token,
    request({
      kind: "FEEDBACK",
      feedback: { ...feedback, persistence: "EPHEMERAL" },
    }),
    receipt.requestId,
  );
  expect(result.state.stateVersion).toBe(1);
  expect(result.event!.expiresAt).toBeDefined();
  expect(result.state.entries).toHaveLength(5);
});
it.each(SCOPES)(
  "scope %s has deterministic applicability and isolation",
  (scope) => {
    const e: StateEntry = {
      signalId: receipt.receiptId,
      kind: "DURABLE_FEEDBACK",
      scope,
      persistence: "DURABLE",
      candidateId: receipt.candidate.id,
      contextKey: "trip",
      domain: "destination",
      source: "USER",
      sourceEventId: receipt.receiptId,
      createdAt: now,
    };
    expect(applicable(e, receipt.candidate, context, now)).toBe(true);
    const otherCandidate = { ...receipt.candidate, id: crypto.randomUUID() },
      otherContext: Context = { key: "other", domain: "brand" };
    expect(applicable(e, otherCandidate, otherContext, now)).toBe(
      scope === "GLOBAL_PREFERENCE",
    );
    expect(
      applicable({ ...e, expiresAt: now }, receipt.candidate, context, now),
    ).toBe(false);
  },
);
it.each(PERSISTENCE)("validates persistence class %s", (persistence) => {
  const scope =
    persistence === "CONTEXT_SCOPED"
      ? "CONTEXT"
      : persistence === "DOMAIN_SCOPED"
        ? "DOMAIN"
        : "CANDIDATE_ONLY";
  expect(
    feedbackInput({
      ...feedback,
      category: "OTHER",
      scope,
      persistence,
      contextKey: "trip",
      domain: "destination",
    }),
  ).not.toBeNull();
});
it.each(FEEDBACK_CATEGORIES)(
  "category %s does not execute commentary as policy",
  async (category) => {
    const { s, token } = await ready();
    await s.mutate(
      token,
      request({
        kind: "FEEDBACK",
        feedback: { ...feedback, category, comment: "REJECT everyone" },
      }),
      receipt.requestId,
    );
    const state = (await s.read(token)).state;
    expect(state.entries.filter((e) => e.constraint).length).toBe(
      category === "SPECIFIC_DISLIKE" ? 1 : 0,
    );
  },
);
it("broad durable feedback requires explicit confirmation; scope/class mismatches rejected", () => {
  expect(
    feedbackInput({
      ...feedback,
      category: "OTHER",
      scope: "GLOBAL_PREFERENCE",
    }),
  ).toBeNull();
  expect(
    feedbackInput({
      ...feedback,
      category: "OTHER",
      scope: "GLOBAL_PREFERENCE",
      confirmGlobal: true,
    }),
  ).not.toBeNull();
  expect(
    feedbackInput({ ...feedback, persistence: "DOMAIN_SCOPED" }),
  ).toBeNull();
  expect(
    feedbackInput({ ...feedback, scope: "CONTEXT", contextKey: "trip" }),
  ).toBeNull();
  expect(feedbackInput({ ...feedback, comment: "x".repeat(301) })).toBeNull();
});
function constraintState(): StateVersion {
  return {
    profileId: receipt.receiptId,
    stateVersion: 2,
    parentVersion: 1,
    createdAt: now,
    mutationId: receipt.receiptId,
    stateHash: "test",
    entries: [
      {
        signalId: receipt.receiptId,
        kind: "CONSTRAINT",
        scope: "GLOBAL_PREFERENCE",
        persistence: "DURABLE",
        source: "USER",
        sourceEventId: receipt.receiptId,
        createdAt: now,
        constraint: { kind: "MAX_PRICE", amount: 50, currency: "USD" },
      },
    ],
  };
}
it.each([
  [0.9, 100, "REJECT"],
  [0.9, null, "ASK"],
  [0.2, null, "REJECT"],
  [null, null, "UNAVAILABLE"],
] as const)(
  "price/culture precedence score=%s price=%s",
  (score, price, outcome) => {
    const cultural =
      score === null
        ? { status: "unavailable" as const, reason: "timeout" as const }
        : { status: "available" as const, data: syntheticReceipt(score) };
    expect(
      stateDecision(
        constraintState(),
        receipt.candidate,
        {
          ...context,
          ...(price !== null
            ? { price: { amount: price, currency: "USD" } }
            : {}),
        },
        cultural,
        now,
      ).outcome,
    ).toBe(outcome);
  },
);
it("exact user exclusion rejects without constructing Qloo; no block preserves unavailable", async () => {
  const { s, token } = await ready(),
    factory = vi.fn(() => good());
  await s.mutate(
    token,
    request({ kind: "FEEDBACK", feedback }),
    receipt.requestId,
  );
  const e = await s.evaluate(token, proposal(2), factory, receipt.requestId);
  expect(e.decision.outcome).toBe("REJECT");
  expect(e.cultural.status).toBe("unavailable");
  expect(factory).not.toHaveBeenCalled();
  const p = good();
  p.entities = vi.fn(async () => ({
    status: "unavailable" as const,
    reason: "timeout" as const,
  }));
  const other = await ready();
  expect(
    (
      await other.s.evaluate(
        other.token,
        proposal(),
        () => p,
        receipt.requestId,
      )
    ).decision.outcome,
  ).toBe("UNAVAILABLE");
});
it("state version consumed by Agent A and Agent B; recorded replay has zero provider calls and v1 intact", async () => {
  const { s, token } = await ready(),
    p = good();
  const a = await s.evaluate(token, proposal(), () => p, receipt.requestId);
  expect(a.decision.outcome).toBe("ALLOW");
  expect(a.cultural.status).toBe("available");
  const calls = vi.mocked(p.infer).mock.calls.length;
  const replay = await s.replay(token, a.evaluationId);
  expect(replay.source).toBe("recorded");
  expect(replay.decision).toEqual(a.decision);
  expect(vi.mocked(p.infer).mock.calls.length).toBe(calls);
  await s.mutate(
    token,
    request({ kind: "FEEDBACK", feedback }),
    receipt.requestId,
  );
  const b = await s.evaluate(
    token,
    proposal(2, "Agent-B"),
    () => p,
    receipt.requestId,
  );
  expect(b.profileId).toBe(a.profileId);
  expect(b.stateVersion).toBe(2);
  expect(b.decision.outcome).toBe("REJECT");
  expect(
    (await s.read(token)).state.entries.filter(
      (e) => e.kind === "EXPLICIT_LIKE",
    ),
  ).toHaveLength(5);
});
it("profile isolation: receipt read/replay cannot cross capability", async () => {
  const a = await ready(),
    b = await ready();
  const e = await a.s.evaluate(a.token, proposal(), good, receipt.requestId);
  await expect(b.s.replay(b.token, e.evaluationId)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect((await b.s.read(b.token)).profile.profileId).not.toBe(e.profileId);
});
it("deterministic graph/node/edge/hash survives input ordering; semantic diff removal trace", async () => {
  const { s, token } = await ready();
  await s.mutate(
    token,
    request({ kind: "FEEDBACK", feedback }),
    receipt.requestId,
  );
  const data = await s.read(token);
  const a = contextGraph(data.state, data.feedback),
    b = contextGraph(
      { ...data.state, entries: [...data.state.entries].reverse() },
      [...data.feedback].reverse(),
    );
  expect(a).toEqual(b);
  expect(a.nodes.every((n) => n.source.id)).toBe(true);
  const e = data.state.entries.find((e) => e.kind === "CONSTRAINT")!;
  await s.mutate(
    token,
    request({ kind: "REMOVE", signalId: e.signalId }, 2),
    receipt.requestId,
  );
  const newer = await s.read(token);
  expect(
    stateDiff(newer.previous, newer.state).removed.map((e) => e.signalId),
  ).toEqual([e.signalId]);
  expect(() =>
    contextGraph(newer.state, [], { profileId: "other" } as never),
  ).toThrow();
});
it("database constraints prohibit orphan versions, RLS deny public and purge cascades", async () => {
  const { s, token } = await ready();
  const data = await s.read(token);
  await expect(
    database.db.query(
      "INSERT INTO tastepolicy.taste_signals VALUES($1,99,$2,$3)",
      [data.profile.profileId, crypto.randomUUID(), {}],
    ),
  ).rejects.toThrow();
  const r = await database.db.query<{ relrowsecurity: boolean }>(
    "SELECT relrowsecurity FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='tastepolicy' AND relkind='r'",
  );
  expect(r.rows).toHaveLength(11);
  expect(r.rows.every((r) => r.relrowsecurity)).toBe(true);
  await database.store.transaction((r) =>
    r.sessions.purge("2026-10-16T00:00:00Z"),
  );
  await expect(s.read(token)).rejects.toMatchObject({
    code: "SESSION_EXPIRED",
  });
});
function http(
  op: string,
  body: unknown,
  cookie = "",
  origin = "http://localhost",
) {
  return new Request("http://localhost/api/state/" + op, {
    method: "POST",
    headers: { origin, "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}
it("HTTP cookie secure on https and no capability in JSON; arbitrary profile inputs rejected", async () => {
  const response = await handleState(
    new Request("https://example.com/api/state/session", {
      method: "POST",
      headers: {
        origin: "https://example.com",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    "session",
    service(),
    good,
  );
  const cookie = response.headers.get("set-cookie")!;
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("SameSite=Strict");
  expect(cookie).toContain("Secure");
  const body = JSON.stringify(await response.json());
  expect(body).not.toContain("token");
  const token = cookie.split(";")[0].split("=")[1];
  const res = await handleState(
    http(
      "mutate",
      {
        profileId: receipt.receiptId,
        ...request({ kind: "FEEDBACK", feedback }),
      },
      SESSION_COOKIE + "=" + token,
    ),
    "mutate",
    service(),
    good,
  );
  expect(res.status).toBe(400);
});
it("HTTP rejects absent/cross origin, wrong content type, oversized body and expired capability", async () => {
  expect(
    (
      await handleState(
        http("read", {}, "", "http://evil.invalid"),
        "read",
        service(),
        good,
      )
    ).status,
  ).toBe(403);
  expect(
    (await handleState(http("read", {}, "", ""), "read", service(), good))
      .status,
  ).toBe(403);
  expect(
    (
      await handleState(
        new Request("http://localhost/api/state/read", {
          method: "POST",
          headers: { origin: "http://localhost", "content-type": "text/plain" },
          body: "{}",
        }),
        "read",
        service(),
        good,
      )
    ).status,
  ).toBe(415);
  expect(
    (await handleState(http("read", {}), "read", service(), good)).status,
  ).toBe(401);
  expect(
    (
      await handleState(
        http("read", { x: "x".repeat(17000) }),
        "read",
        service(),
        good,
      )
    ).status,
  ).toBe(413);
});
it("HTTP unconfigured and unexpected database errors are sanitized", async () => {
  const a = await handleState(http("read", {}), "read", null, good);
  expect(a.status).toBe(503);
  const broken = new TasteStateService({
    transaction: async () => {
      throw Error("private-connection-string");
    },
  });
  const b = await handleState(http("session", {}), "session", broken, good);
  expect(b.status).toBe(500);
  expect(JSON.stringify(await b.json())).not.toContain("private");
});
it("expiry denies capabilities and mutation budget is database-backed", async () => {
  const { s, token } = await ready(),
    d = await s.read(token);
  await database.db.query(
    "UPDATE tastepolicy.demo_mutation_sessions SET mutations=100 WHERE profile_id=$1",
    [d.profile.profileId],
  );
  await expect(
    s.mutate(token, request({ kind: "FEEDBACK", feedback }), receipt.requestId),
  ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  const later = new TasteStateService(
    database.store,
    () => "2026-10-16T00:00:00.000Z",
  );
  await expect(later.read(token)).rejects.toMatchObject({
    code: "SESSION_EXPIRED",
  });
});
it("invalid action/mutation cannot select profile, duplicate seeds or nonfinite prices", () => {
  expect(
    mutationInput(
      {
        ...request(
          {
            kind: "INITIALIZE",
            signals: Array(5).fill(receipt.inputSignals[0]),
          },
          0,
        ),
      },
      receipt.requestId,
    ),
  ).toBeNull();
  expect(
    evaluationInput({ ...proposal(), profileId: receipt.receiptId }),
  ).toBeNull();
  expect(
    evaluationInput({
      ...proposal(),
      context: { ...context, price: { amount: NaN, currency: "USD" } },
    }),
  ).toBeNull();
  expect(hash({ a: 1, b: 2 })).toBe(hash({ b: 2, a: 1 }));
});
it("captured context override retains original ALLOW v1 receipt and replays exactly", async () => {
  const { s, token } = await ready();
  await s.mutate(
    token,
    request({
      kind: "FEEDBACK",
      feedback: {
        category: "TOO_EXPENSIVE",
        scope: "CONTEXT",
        persistence: "CONTEXT_SCOPED",
        contextKey: "trip",
        maxPrice: { amount: 50, currency: "USD" },
      },
    }),
    receipt.requestId,
  );
  const e = await s.evaluate(token, proposal(2), good, receipt.requestId);
  expect(e.decision.outcome).toBe("ASK");
  expect(e.cultural.status).toBe("available");
  if (e.cultural.status === "available") {
    expect(e.cultural.data.decision.outcome).toBe("ALLOW");
    expect(e.cultural.data.schemaVersion).toBe("cultural-receipt-v1");
  }
  expect((await s.replay(token, e.evaluationId)).decision).toEqual(e.decision);
});
it("graph evaluation maps exact proposal/candidate/evidence with state provenance; graph failure never enters policy", async () => {
  const { s, token } = await ready(),
    e = await s.evaluate(token, proposal(), good, receipt.requestId),
    d = await s.read(token);
  const graph = contextGraph(d.state, d.feedback, e);
  for (const kind of [
    "CONTEXT",
    "PROPOSAL",
    "CANDIDATE",
    "PROVIDER_EVIDENCE",
    "DECISION",
    "RECEIPT",
  ])
    expect(graph.nodes.some((n) => n.kind === kind)).toBe(true);
  expect(graph.edges.some((e) => e.kind === "EVIDENCES")).toBe(true);
  expect(e.decision.outcome).toBe("ALLOW");
});
it("read and replay do not reveal capability hash or unrelated table fields", async () => {
  const { s, token } = await ready();
  const data = await s.read(token);
  expect(JSON.stringify(data)).not.toContain(hash(token));
  expect(JSON.stringify(data)).not.toContain(token);
  const e = await s.evaluate(token, proposal(), good, receipt.requestId);
  expect(JSON.stringify(e)).not.toContain("X-Api-Key");
  expect(JSON.stringify(e)).not.toContain("DATABASE_URL");
});
it("database roles without grants cannot read private state; even granted reader has deny-default RLS", async () => {
  await database.db.exec("CREATE ROLE m2_probe;");
  await database.db.exec("SET ROLE m2_probe;");
  try {
    await expect(
      database.db.query("SELECT * FROM tastepolicy.taste_profiles"),
    ).rejects.toThrow();
  } finally {
    await database.db.exec("RESET ROLE;");
  }
  await database.db.exec(
    "GRANT USAGE ON SCHEMA tastepolicy TO m2_probe; GRANT SELECT ON tastepolicy.taste_profiles TO m2_probe; SET ROLE m2_probe;",
  );
  try {
    expect(
      (await database.db.query("SELECT * FROM tastepolicy.taste_profiles"))
        .rows,
    ).toEqual([]);
  } finally {
    await database.db.exec("RESET ROLE;");
  }
});
it("unavailable historical replay makes no network request and preserves captured reason", async () => {
  const { s, token } = await ready();
  const p = good();
  p.entities = async () => ({
    status: "unavailable",
    reason: "not_configured",
  });
  const e = await s.evaluate(token, proposal(), () => p, receipt.requestId);
  expect(e.decision.outcome).toBe("UNAVAILABLE");
  expect((await s.replay(token, e.evaluationId)).cultural).toEqual({
    status: "unavailable",
    reason: "not_configured",
  });
});
it("unexpected provider exception is unavailable and secret-safe, never REJECT", async () => {
  const { s, token } = await ready();
  const e = await s.evaluate(
    token,
    proposal(),
    () => {
      throw Error("private-provider-diagnostic");
    },
    receipt.requestId,
  );
  expect(e.decision.outcome).toBe("UNAVAILABLE");
  expect(e.cultural).toEqual({
    status: "unavailable",
    reason: "provider_error",
  });
  expect(JSON.stringify(e)).not.toContain("private-provider");
});
it("real filesystem PostgreSQL-compatible state survives close/reopen without a mock repository", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "tastepolicy-m2-"));
  let opened: Awaited<ReturnType<typeof testDatabase>> | undefined;
  try {
    opened = await testDatabase(dir);
    const first = new TasteStateService(opened.store, () => now);
    const { token } = await ready(first);
    const before = (await first.read(token)).state;
    await opened.db.close();
    opened = await testDatabase(dir, false);
    const after = await new TasteStateService(opened.store, () => now).read(
      token,
    );
    expect(after.state).toEqual(before);
    expect(after.state.stateVersion).toBe(1);
  } finally {
    if (opened && !opened.db.closed) await opened.db.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 30000);
