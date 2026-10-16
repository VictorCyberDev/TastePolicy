// @vitest-environment node
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import {
  interactiveDatabase,
  setup,
  provider,
  priceRule,
  exclusion,
  ALT,
  ALT2,
  NOW,
  reqId,
  proposal,
} from "./interactive-fixtures";
import { InteractiveService } from "@/server/interactive/service";
import { handleInteractive } from "@/server/interactive/http";
import { interactionInput } from "@/server/interactive/validation";
import { SESSION_COOKIE } from "@/server/state/http";
import type { StateStore, Repositories } from "@/server/state/repositories";
import type { Answer } from "@/lib/interactive/types";
import type {
  ClarificationRecord,
  RepairRecord,
} from "@/lib/interactive/types";
let d: Awaited<ReturnType<typeof interactiveDatabase>>;
beforeAll(async () => {
  d = await interactiveDatabase();
}, 30000);
afterAll(async () => {
  await d.db.close();
});
function answerRequest(
  x: Awaited<ReturnType<typeof setup>>,
  planId: string,
  answer: Answer,
  key = crypto.randomUUID(),
  parentClarificationId?: string,
) {
  return {
    evaluationId: x.e.evaluationId,
    expectedStateVersion: x.e.stateVersion,
    planId,
    idempotencyKey: key,
    answer,
    ...(parentClarificationId ? { parentClarificationId } : {}),
  };
}
const repairRequest = (
  e: { evaluationId: string; stateVersion: number },
  key = crypto.randomUUID(),
) => ({
  evaluationId: e.evaluationId,
  expectedStateVersion: e.stateVersion,
  idempotencyKey: key,
});
it.each([
  ["ALLOW", 0.9],
  ["REJECT", 0.2],
] as const)("%s has no actionable clarification", async (_, score) => {
  const x = await setup(d.store, { score });
  expect(
    (await x.interactive.plan(x.token, { evaluationId: x.e.evaluationId }))
      .status,
  ).toBe("NO_ACTIONABLE_CLARIFICATION");
});
it("UNAVAILABLE is never converted to ASK or a clarification", async () => {
  const x = await setup(d.store);
  const p = provider({ failure: "timeout" });
  const e = await x.stateService.evaluate(
    x.token,
    proposal(1),
    () => p.q,
    reqId,
  );
  expect(
    (await x.interactive.plan(x.token, { evaluationId: e.evaluationId }))
      .status,
  ).toBe("NO_ACTIONABLE_CLARIFICATION");
});
it.each([
  ["PRICE_REQUIRED", undefined],
  ["PRICE_CURRENCY_REQUIRED", { amount: 30, currency: "EUR" }],
] as const)(
  "ASK plans %s without provider construction",
  async (kind, price) => {
    const x = await setup(d.store, {
      feedback: priceRule,
      context: {
        key: "trip",
        domain: "destination",
        ...(price ? { price } : {}),
      },
    });
    const before = (await x.stateService.read(x.token)).state;
    const a = await x.interactive.plan(x.token, {
        evaluationId: x.e.evaluationId,
      }),
      b = await x.interactive.plan(x.token, { evaluationId: x.e.evaluationId });
    expect(a).toEqual(b);
    expect(a.factor?.kind).toBe(kind);
    expect(a.factor?.currency).toBe("USD");
    expect(a).not.toHaveProperty("questions");
    expect((await x.stateService.read(x.token)).state).toEqual(before);
  },
);
it("missing context outranks borderline; price answer leads to the next single cultural question", async () => {
  const x = await setup(d.store, { score: 0.7, feedback: priceRule });
  const p = await x.interactive.plan(x.token, {
    evaluationId: x.e.evaluationId,
  });
  expect(p.factor?.kind).toBe("PRICE_REQUIRED");
  const a = await x.interactive.answer(
    x.token,
    answerRequest(x, p.planId, { kind: "PRICE", amount: 40, currency: "USD" }),
    reqId,
  );
  expect(a.finalDecision.outcome).toBe("ASK");
  const next = await x.interactive.plan(x.token, {
    evaluationId: x.e.evaluationId,
    parentClarificationId: a.interactionId,
  });
  expect(next.factor?.kind).toBe("CULTURAL_BORDERLINE");
  const resolved = await x.interactive.answer(
    x.token,
    answerRequest(
      x,
      next.planId,
      { kind: "DISPOSITION", value: "ACCEPTABLE" },
      crypto.randomUUID(),
      a.interactionId,
    ),
    reqId,
  );
  expect(resolved.finalDecision.outcome).toBe("ALLOW");
  expect(resolved.originalEvaluation).toEqual(x.e);
  expect((await x.stateService.read(x.token)).state).toEqual(x.state);
});
it.each([
  [40, "ALLOW"],
  [60, "REJECT"],
] as const)(
  "price %s leads to %s using captured evidence",
  async (amount, outcome) => {
    const x = await setup(d.store, { feedback: priceRule });
    const p = await x.interactive.plan(x.token, {
      evaluationId: x.e.evaluationId,
    });
    const original = structuredClone(x.e);
    const result = await x.interactive.answer(
      x.token,
      answerRequest(x, p.planId, { kind: "PRICE", amount, currency: "USD" }),
      reqId,
    );
    expect(result.finalDecision.outcome).toBe(outcome);
    expect(result.originalEvaluation).toEqual(original);
    expect(result.evidenceSource).toBe("captured");
    expect((await x.stateService.read(x.token)).state.stateVersion).toBe(
      x.e.stateVersion,
    );
  },
);
it("UNKNOWN keeps ASK, does not invent price, currency mismatch cannot silently convert", async () => {
  const x = await setup(d.store, {
    feedback: priceRule,
    context: {
      key: "trip",
      domain: "destination",
      price: { amount: 30, currency: "EUR" },
    },
  });
  const p = await x.interactive.plan(x.token, {
    evaluationId: x.e.evaluationId,
  });
  const a = await x.interactive.answer(
    x.token,
    answerRequest(x, p.planId, { kind: "UNKNOWN" }),
    reqId,
  );
  expect(a.finalDecision.outcome).toBe("ASK");
  expect(a.context.price?.currency).toBe("EUR");
  await expect(
    x.interactive.answer(
      x.token,
      answerRequest(x, p.planId, {
        kind: "PRICE",
        amount: 20,
        currency: "GBP",
      }),
      reqId,
    ),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
it.each([
  ["ACCEPTABLE", "ALLOW"],
  ["UNACCEPTABLE", "REJECT"],
  ["STILL_UNSURE", "ASK"],
] as const)(
  "borderline %s becomes bounded %s, original receipt stays ASK",
  async (value, outcome) => {
    const x = await setup(d.store, { score: 0.7 });
    const p = await x.interactive.plan(x.token, {
      evaluationId: x.e.evaluationId,
    });
    expect(p.factor?.kind).toBe("CULTURAL_BORDERLINE");
    const a = await x.interactive.answer(
      x.token,
      answerRequest(x, p.planId, { kind: "DISPOSITION", value }),
      reqId,
    );
    expect(a.finalDecision.outcome).toBe(outcome);
    if (a.originalEvaluation.cultural.status === "available")
      expect(a.originalEvaluation.cultural.data.decision.outcome).toBe("ASK");
    expect((await x.stateService.read(x.token)).state).toEqual(x.state);
  },
);
it("answer idempotency returns original, rejects changed answer, and replays before stale rejection", async () => {
  const x = await setup(d.store, { score: 0.7 });
  const p = await x.interactive.plan(x.token, {
      evaluationId: x.e.evaluationId,
    }),
    q = answerRequest(x, p.planId, {
      kind: "DISPOSITION",
      value: "ACCEPTABLE",
    });
  const a = await x.interactive.answer(x.token, q, reqId);
  await x.stateService.mutate(
    x.token,
    {
      expectedStateVersion: 1,
      idempotencyKey: "advance",
      payload: { kind: "FEEDBACK", feedback: exclusion },
    },
    reqId,
  );
  expect(await x.interactive.answer(x.token, q, crypto.randomUUID())).toEqual(
    a,
  );
  await expect(
    x.interactive.answer(
      x.token,
      { ...q, answer: { kind: "DISPOSITION", value: "UNACCEPTABLE" } },
      reqId,
    ),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
  expect(
    (
      await d.db.query(
        "SELECT clarification_id FROM tastepolicy.clarification_records WHERE profile_id=$1",
        [x.e.profileId],
      )
    ).rows,
  ).toHaveLength(1);
});
it("state advance makes planning STALE and new answer conflicts without partial record", async () => {
  const x = await setup(d.store, { score: 0.7 }),
    p = await x.interactive.plan(x.token, { evaluationId: x.e.evaluationId });
  await x.stateService.mutate(
    x.token,
    {
      expectedStateVersion: 1,
      idempotencyKey: "advance",
      payload: { kind: "FEEDBACK", feedback: exclusion },
    },
    reqId,
  );
  expect(
    (await x.interactive.plan(x.token, { evaluationId: x.e.evaluationId }))
      .status,
  ).toBe("STALE");
  await expect(
    x.interactive.answer(
      x.token,
      answerRequest(x, p.planId, { kind: "DISPOSITION", value: "ACCEPTABLE" }),
      reqId,
    ),
  ).rejects.toMatchObject({ code: "STATE_VERSION_CONFLICT" });
  expect(
    (
      await d.db.query(
        "SELECT * FROM tastepolicy.clarification_records WHERE profile_id=$1",
        [x.e.profileId],
      )
    ).rows,
  ).toEqual([]);
});
it("forged plan, malformed answers and arbitrary profile selectors are rejected", async () => {
  const x = await setup(d.store, { score: 0.7 });
  await expect(
    x.interactive.answer(
      x.token,
      answerRequest(x, "f".repeat(64), {
        kind: "DISPOSITION",
        value: "ACCEPTABLE",
      }),
      reqId,
    ),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(
    interactionInput(
      { evaluationId: x.e.evaluationId, profileId: x.e.profileId },
      "plan",
    ),
  ).toBeNull();
  for (const value of [NaN, Infinity, -1, "12"])
    expect(
      interactionInput(
        answerRequest(x, "f".repeat(64), {
          kind: "PRICE",
          amount: value as number,
          currency: "USD",
        }),
        "answer",
      ),
    ).toBeNull();
});
it("excluded candidate repair preserves state/action/context, requires four calls and candidate-specific receipt", async () => {
  const x = await setup(d.store, { feedback: exclusion }),
    p = provider();
  const factory = vi.fn(() => p.q);
  const result = await x.interactive.repair(
    x.token,
    repairRequest(x.e),
    factory,
    reqId,
  );
  expect(result.status).toBe("REPAIR_AVAILABLE");
  expect(p.calls).toEqual([
    "entities",
    "discovery-insights",
    "entities",
    "candidate-insights",
  ]);
  expect(result.method.providerCalls).toBe(4);
  expect(result.changeSet).toEqual([
    { field: "candidate", from: x.e.action.candidate.id, to: ALT.id },
  ]);
  expect(result.verification?.context).toEqual(x.e.context);
  expect(result.verification?.stateVersion).toBe(x.e.stateVersion);
  expect(result.verification?.decision.outcome).toBe("ALLOW");
  expect((await x.stateService.read(x.token)).state).toEqual(x.state);
  expect(result.preservedConstraints).toContain(
    x.state.entries.find((s) => s.constraint)!.signalId,
  );
  if (result.verification?.cultural.status === "available")
    expect(
      result.verification.cultural.data.qlooEvidence.provenance
        .specificCandidateId,
    ).toBe(ALT.id);
});
it("discovery rank then stable ID selects only one candidate, never affinity", async () => {
  const x = await setup(d.store, { score: 0.2 }),
    p = provider({
      candidates: [
        { entity: ALT2, rank: 1 },
        { entity: ALT, rank: 1 },
      ],
    });
  const r = await x.interactive.repair(
    x.token,
    repairRequest(x.e),
    () => p.q,
    reqId,
  );
  expect(r.verification?.action.candidate.id).toBe(ALT.id);
  expect(r.method.discovered.map((x) => x.id)).toEqual([ALT.id, ALT2.id]);
  expect(p.calls).toHaveLength(4);
});
it("candidate-specific rejection is not a repair and no second candidate is tried", async () => {
  const x = await setup(d.store, { score: 0.2 }),
    p = provider({
      candidateScore: 0.2,
      candidates: [
        { entity: ALT, rank: 1 },
        { entity: ALT2, rank: 2 },
      ],
    });
  const r = await x.interactive.repair(
    x.token,
    repairRequest(x.e),
    () => p.q,
    reqId,
  );
  expect(r.status).toBe("NO_VERIFIED_REPAIR_WITHIN_BOUND");
  expect(r.changeSet).toEqual([]);
  expect(r.verification?.decision.outcome).toBe("REJECT");
  expect(p.calls).toHaveLength(4);
});
it("candidate-specific ASK is a verified bounded repair", async () => {
  const x = await setup(d.store, { score: 0.2 }),
    p = provider({ candidateScore: 0.7 });
  expect(
    (await x.interactive.repair(x.token, repairRequest(x.e), () => p.q, reqId))
      .verification?.decision.outcome,
  ).toBe("ASK");
});
it("all alternatives excluded is a bounded miss; original candidate never proposed", async () => {
  const x = await setup(d.store, { feedback: exclusion }),
    p = provider({ candidates: [{ entity: x.e.action.candidate, rank: 1 }] });
  const r = await x.interactive.repair(
    x.token,
    repairRequest(x.e),
    () => p.q,
    reqId,
  );
  expect(r.status).toBe("NO_VERIFIED_REPAIR_WITHIN_BOUND");
  expect(p.calls).toHaveLength(2);
  expect(r.verification).toBeUndefined();
});
it("price rejection returns honest no-verifiable condition and no provider calls", async () => {
  const x = await setup(d.store, {
      feedback: priceRule,
      context: {
        key: "trip",
        domain: "destination",
        price: { amount: 60, currency: "USD" },
      },
    }),
    factory = vi.fn(() => provider().q);
  const r = await x.interactive.repair(
    x.token,
    repairRequest(x.e),
    factory,
    reqId,
  );
  expect(r.status).toBe("NO_VERIFIABLE_REPAIR");
  expect(r.condition).toMatch(/own explicit verified/);
  expect(r.verification).toBeUndefined();
  expect(factory).not.toHaveBeenCalled();
});
it("even satisfied old candidate price is never transferred to a replacement", async () => {
  const x = await setup(d.store, {
    score: 0.2,
    context: {
      key: "trip",
      domain: "destination",
      price: { amount: 20, currency: "USD" },
    },
  });
  const factory = vi.fn(() => provider().q);
  expect(
    (await x.interactive.repair(x.token, repairRequest(x.e), factory, reqId))
      .status,
  ).toBe("NO_VERIFIABLE_REPAIR");
  expect(factory).not.toHaveBeenCalled();
});
it.each(["timeout", "auth_failed", "rate_limited", "not_configured"] as const)(
  "provider %s yields separate UNAVAILABLE while original REJECT stands",
  async (failure) => {
    const x = await setup(d.store, { feedback: exclusion }),
      p = provider({ failure });
    const r = await x.interactive.repair(
      x.token,
      repairRequest(x.e),
      () => p.q,
      reqId,
    );
    expect(r.status).toBe("UNAVAILABLE");
    expect(r.originalEvaluation.decision.outcome).toBe("REJECT");
    expect(p.calls).toHaveLength(1);
  },
);
it("verification provider failure cannot be called a successful repair", async () => {
  const x = await setup(d.store, { score: 0.2 }),
    p = provider({ failVerify: "timeout" });
  const r = await x.interactive.repair(
    x.token,
    repairRequest(x.e),
    () => p.q,
    reqId,
  );
  expect(r.status).toBe("UNAVAILABLE");
  expect(r.verification).toBeUndefined();
  expect(p.calls).toHaveLength(4);
});
it("slow discovery does not start verification beyond the existing deadline", async () => {
  const x = await setup(d.store, { score: 0.2 }),
    p = provider();
  let t = 0;
  const original = p.q.infer;
  p.q.infer = async (q) => {
    const r = await original(q);
    t = 25000;
    return r;
  };
  const service = new InteractiveService(
    d.store,
    () => NOW,
    () => t,
  );
  const r = await service.repair(x.token, repairRequest(x.e), () => p.q, reqId);
  expect(r.status).toBe("UNAVAILABLE");
  expect(r.reason).toBe("timeout");
  expect(p.calls).toHaveLength(2);
});
it("repair idempotency/concurrent retries replay captured result with provider work once", async () => {
  const x = await setup(d.store, { score: 0.2 }),
    p = provider(),
    factory = vi.fn(() => p.q),
    q = repairRequest(x.e);
  const [a, b] = await Promise.all([
    x.interactive.repair(x.token, q, factory, reqId),
    x.interactive.repair(x.token, q, factory, reqId),
  ]);
  expect(a).toEqual(b);
  expect(p.calls).toHaveLength(4);
  expect(factory).toHaveBeenCalledTimes(1);
  expect(await x.interactive.replay(x.token, a.repairId, "repair")).toEqual(a);
  expect(p.calls).toHaveLength(4);
  await expect(
    x.interactive.repair(
      x.token,
      { ...q, expectedStateVersion: 99 },
      factory,
      reqId,
    ),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
});
it("advanced state yields repair STALE with no provider work", async () => {
  const x = await setup(d.store, { score: 0.2 });
  await x.stateService.mutate(
    x.token,
    {
      expectedStateVersion: 1,
      idempotencyKey: "advance",
      payload: { kind: "FEEDBACK", feedback: exclusion },
    },
    reqId,
  );
  const factory = vi.fn(() => provider().q);
  expect(
    (await x.interactive.repair(x.token, repairRequest(x.e), factory, reqId))
      .status,
  ).toBe("STALE");
  expect(factory).not.toHaveBeenCalled();
});
it("profiles cannot plan, answer, repair or replay each other records", async () => {
  const a = await setup(d.store, { score: 0.7 }),
    b = await setup(d.store, { score: 0.2 });
  const plan = await a.interactive.plan(a.token, {
      evaluationId: a.e.evaluationId,
    }),
    answer = await a.interactive.answer(
      a.token,
      answerRequest(a, plan.planId, {
        kind: "DISPOSITION",
        value: "ACCEPTABLE",
      }),
      reqId,
    );
  const repair = await b.interactive.repair(
    b.token,
    repairRequest(b.e),
    () => provider().q,
    reqId,
  );
  for (const work of [
    () => b.interactive.plan(b.token, { evaluationId: a.e.evaluationId }),
    () =>
      b.interactive.answer(
        b.token,
        answerRequest(a, plan.planId, {
          kind: "DISPOSITION",
          value: "ACCEPTABLE",
        }),
        reqId,
      ),
    () =>
      b.interactive.repair(
        b.token,
        repairRequest(a.e),
        () => provider().q,
        reqId,
      ),
    () => b.interactive.replay(b.token, answer.interactionId, "clarification"),
    () => a.interactive.replay(a.token, repair.repairId, "repair"),
  ])
    await expect(work()).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it.each(["clarification", "repair", "evidence", "receipt"] as const)(
  "failure after %s write rolls back interactive audit and captured verification",
  async (point) => {
    const x = await setup(d.store, {
      score: point === "clarification" ? 0.7 : 0.2,
    });
    const wrap: StateStore = {
      transaction: (fn) =>
        d.store.transaction((r) => {
          const wrapped: Repositories = {
            ...r,
            clarifications: {
              ...r.clarifications,
              async insert(v) {
                await r.clarifications.insert(v);
                if (point === "clarification") throw Error("injected");
              },
            },
            repairs: {
              ...r.repairs,
              async insert(v) {
                await r.repairs.insert(v);
                if (point === "repair") throw Error("injected");
              },
            },
            evidence: {
              ...r.evidence,
              async insert(v) {
                await r.evidence.insert(v);
                if (point === "evidence") throw Error("injected");
              },
            },
            receipts: {
              ...r.receipts,
              async insert(v) {
                await r.receipts.insert(v);
                if (point === "receipt") throw Error("injected");
              },
            },
          };
          return fn(wrapped);
        }),
    };
    const s = new InteractiveService(wrap, () => NOW);
    if (point === "clarification") {
      const p = await s.plan(x.token, { evaluationId: x.e.evaluationId });
      await expect(
        s.answer(
          x.token,
          answerRequest(x, p.planId, {
            kind: "DISPOSITION",
            value: "ACCEPTABLE",
          }),
          reqId,
        ),
      ).rejects.toThrow("injected");
    } else
      await expect(
        s.repair(x.token, repairRequest(x.e), () => provider().q, reqId),
      ).rejects.toThrow("injected");
    expect(
      (
        await d.db.query(
          "SELECT * FROM tastepolicy.clarification_records WHERE profile_id=$1",
          [x.e.profileId],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await d.db.query(
          "SELECT * FROM tastepolicy.repair_records WHERE profile_id=$1",
          [x.e.profileId],
        )
      ).rows,
    ).toEqual([]);
    expect((await x.stateService.read(x.token)).evaluations).toHaveLength(1);
  },
);
it("SQL rejects forged ownership, version, parent, duplicate keys and invalid repair lineage", async () => {
  const x = await setup(d.store, { score: 0.65 }),
    other = await setup(d.store);
  const plan = await x.interactive.plan(x.token, {
    evaluationId: x.e.evaluationId,
  });
  const result = await x.interactive.answer(
    x.token,
    answerRequest(
      x,
      plan.planId,
      { kind: "DISPOSITION", value: "STILL_UNSURE" },
      "sql-root",
    ),
    reqId,
  );
  const record = await d.store.transaction((r) =>
    r.clarifications.find(x.e.profileId, result.interactionId),
  );
  const insert = (changes: Partial<ClarificationRecord>) =>
    d.store.transaction((r) =>
      r.clarifications.insert({
        ...record!,
        id: crypto.randomUUID(),
        key: crypto.randomUUID(),
        ...changes,
      }),
    );
  await expect(insert({ profileId: other.e.profileId })).rejects.toThrow(
    /foreign key/i,
  );
  await expect(insert({ stateVersion: 99 })).rejects.toThrow(/foreign key/i);
  await expect(insert({ parentId: crypto.randomUUID() })).rejects.toThrow(
    /foreign key/i,
  );
  await expect(insert({ key: "sql-root" })).rejects.toThrow(/unique/i);
  const rejected = await setup(d.store, { feedback: exclusion });
  const repair = await rejected.interactive.repair(
    rejected.token,
    repairRequest(rejected.e),
    () => provider().q,
    reqId,
  );
  const rr = await d.store.transaction((r) =>
    r.repairs.find(rejected.e.profileId, repair.repairId),
  );
  const addRepair = (changes: Partial<RepairRecord>) =>
    d.store.transaction((r) =>
      r.repairs.insert({
        ...rr!,
        id: crypto.randomUUID(),
        key: crypto.randomUUID(),
        ...changes,
      }),
    );
  await expect(addRepair({ verificationId: null })).rejects.toThrow(/check/i);
  await expect(
    addRepair({ verificationId: other.e.evaluationId }),
  ).rejects.toThrow(/foreign key/i);
  await expect(addRepair({ profileId: other.e.profileId })).rejects.toThrow(
    /foreign key/i,
  );
  await expect(
    d.db.query(
      "UPDATE tastepolicy.clarification_records SET factor_kind=$1 WHERE clarification_id=$2",
      ["PRICE_REQUIRED", record!.id],
    ),
  ).rejects.toThrow(/immutable/i);
});
it("HTTP requires origin, cookie, bounded JSON and keeps provider failures sanitized", async () => {
  const x = await setup(d.store, { score: 0.65 });
  const factory = vi.fn(() => provider().q);
  const request = (body: string, headers: Record<string, string> = {}) =>
    new Request("https://tastepolicy.test/api/state/interactive/plan", {
      method: "POST",
      headers: {
        origin: "https://tastepolicy.test",
        "content-type": "application/json",
        cookie: SESSION_COOKIE + "=" + x.token,
        ...headers,
      },
      body,
    });
  const body = JSON.stringify({ evaluationId: x.e.evaluationId });
  expect(
    (
      await handleInteractive(
        request(body, { origin: "https://evil.test" }),
        "plan",
        x.interactive,
        factory,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await handleInteractive(
        request(body, { cookie: "" }),
        "plan",
        x.interactive,
        factory,
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await handleInteractive(
        request("x".repeat(20000)),
        "plan",
        x.interactive,
        factory,
      )
    ).status,
  ).toBe(413);
  expect(
    (await handleInteractive(request(body), "plan", null, factory)).status,
  ).toBe(503);
  const good = await handleInteractive(
    request(body),
    "plan",
    x.interactive,
    factory,
  );
  expect(good.status).toBe(200);
  expect((await good.json()).data.status).toBe("ACTIONABLE");
  expect(factory).not.toHaveBeenCalled();
  const expired = new InteractiveService(
    d.store,
    () => "2030-01-01T00:00:00.000Z",
  );
  expect(
    (await handleInteractive(request(body), "plan", expired, factory)).status,
  ).toBe(401);
});
it("interaction tables enforce RLS and retain records after filesystem close/reopen", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "tastepolicy-interactive-"));
  let disk = await interactiveDatabase(dir);
  try {
    const x = await setup(disk.store, { score: 0.65 });
    const p = await x.interactive.plan(x.token, {
      evaluationId: x.e.evaluationId,
    });
    const a = await x.interactive.answer(
      x.token,
      answerRequest(x, p.planId, { kind: "DISPOSITION", value: "ACCEPTABLE" }),
      reqId,
    );
    const rejected = await setup(disk.store, { feedback: exclusion });
    const repair = await rejected.interactive.repair(
      rejected.token,
      repairRequest(rejected.e),
      () => provider().q,
      reqId,
    );
    const flags = await disk.db.query<{ relrowsecurity: boolean }>(
      "SELECT relrowsecurity FROM pg_class WHERE relname IN ('clarification_records','repair_records')",
    );
    expect(flags.rows).toHaveLength(2);
    expect(flags.rows.every((r) => r.relrowsecurity)).toBe(true);
    await disk.db.close();
    disk = await interactiveDatabase(dir, false);
    const reopened = new InteractiveService(disk.store, () => NOW);
    expect(
      await reopened.replay(x.token, a.interactionId, "clarification"),
    ).toEqual(a);
    expect(
      await reopened.replay(rejected.token, repair.repairId, "repair"),
    ).toEqual(repair);
  } finally {
    await disk.db.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 30000);
it("capability expiry during repair rolls back captured verification and audit writes", async () => {
  const x = await setup(d.store, { feedback: exclusion });
  let now = NOW;
  const s = new InteractiveService(d.store, () => now),
    q = provider();
  const infer = q.q.infer;
  q.q.infer = async (input) => {
    const result = await infer(input);
    if (input.candidateId) now = "2030-01-01T00:00:00.000Z";
    return result;
  };
  await expect(
    s.repair(x.token, repairRequest(x.e), () => q.q, reqId),
  ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  expect(q.calls).toHaveLength(4);
  expect((await x.stateService.read(x.token)).evaluations).toHaveLength(1);
  expect(
    (
      await d.db.query(
        "SELECT * FROM tastepolicy.repair_records WHERE profile_id=$1",
        [x.e.profileId],
      )
    ).rows,
  ).toEqual([]);
});
it("repair skips independently excluded alternatives without weakening the rule", async () => {
  const x = await setup(d.store, { feedback: exclusion });
  await x.stateService.mutate(
    x.token,
    {
      expectedStateVersion: 2,
      idempotencyKey: "exclude-alt",
      payload: {
        kind: "FEEDBACK",
        feedback: { ...exclusion, candidateId: ALT.id },
      },
    },
    reqId,
  );
  const root = await x.stateService.evaluate(
    x.token,
    proposal(3),
    () => provider().q,
    reqId,
  );
  const q = provider({
    candidates: [
      { entity: ALT, rank: 1 },
      { entity: ALT2, rank: 2 },
    ],
  });
  const result = await x.interactive.repair(
    x.token,
    repairRequest(root),
    () => q.q,
    reqId,
  );
  expect(result.status).toBe("REPAIR_AVAILABLE");
  expect(result.verification!.action.candidate.id).toBe(ALT2.id);
  expect(result.preservedConstraints).toHaveLength(2);
  expect(q.calls).toHaveLength(4);
});
