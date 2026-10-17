// Offline SYNTHETIC engineering adapter only. Never imported by production.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { PostgresStateStore } from "@/server/state/postgres";
import { TasteStateService } from "@/server/state/service";
import { InteractiveService } from "@/server/interactive/service";
import { feedbackInput } from "@/server/state/validation";
import type { QlooProvider } from "@/server/qloo/contracts";
import type { Scenario, ScenarioResult } from "./types";
import { hash, requireThat } from "./validate";
import { evidenceOf } from "./execute";
export async function repairCheck(
  s: Scenario,
): Promise<NonNullable<ScenarioResult["interaction"]>> {
  requireThat(s.source === "SYNTHETIC" && s.kind === "ENGINEERING" && s.repair);
  const started = performance.now(),
    db = await PGlite.create();
  try {
    for (const file of [
      "0001_taste_state.sql",
      "0002_interactive_authorization.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../../../migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
    const store = new PostgresStateStore({
      connect: async () => ({
        query: (sql: string, args?: unknown[]) => db.query(sql, args),
        release() {},
      }),
    } as unknown as Pool);
    const service = new TasteStateService(store, () => s.input.evaluatedAt),
      session = await service.createSession();
    await service.mutate(
      session.token,
      {
        expectedStateVersion: 0,
        idempotencyKey: "init",
        payload: { kind: "INITIALIZE", signals: s.input.signals },
      },
      s.input.candidate.id,
    );
    let version = 1;
    for (const e of s.input.state.entries.filter(
      (e) => e.kind !== "EXPLICIT_LIKE",
    )) {
      const f = feedbackInput({
        category: e.category,
        scope: e.scope,
        persistence: e.persistence,
        ...(e.candidateId ? { candidateId: e.candidateId } : {}),
        ...(e.contextKey ? { contextKey: e.contextKey } : {}),
        ...(e.domain ? { domain: e.domain } : {}),
        ...(e.scope === "GLOBAL_PREFERENCE" ? { confirmGlobal: true } : {}),
        ...(e.constraint?.kind === "MAX_PRICE"
          ? {
              maxPrice: {
                amount: e.constraint.amount,
                currency: e.constraint.currency,
              },
            }
          : {}),
      });
      requireThat(f);
      await service.mutate(
        session.token,
        {
          expectedStateVersion: version++,
          idempotencyKey: "constraint-" + version,
          payload: { kind: "FEEDBACK", feedback: f },
        },
        s.input.candidate.id,
      );
    }
    const alternative = {
      id: "a0000000-0000-4000-8000-000000000099",
      name: "SYNTHETIC BENCHMARK ALTERNATIVE",
      type: s.input.candidate.type,
    };
    const root =
      s.input.cultural.status === "available"
        ? evidenceOf(s.input.cultural.data)
        : null;
    const operations: Record<string, number> = {};
    let candidateVerified = false;
    const provider: QlooProvider = {
      resolve: async () => {
        throw Error("Unexpected resolution");
      },
      entities: async (ids) => {
        operations.entities = (operations.entities ?? 0) + 1;
        return {
          status: "available",
          data: ids.map((id) =>
            [...s.input.signals, s.input.candidate, alternative].find(
              (e) => e.id === id,
            )!,
          ),
        };
      },
      infer: async (input) => {
        const op = input.candidateId
          ? "candidateInsights"
          : "discoveryInsights";
        operations[op] = (operations[op] ?? 0) + 1;
        if (s.repair!.mode === "UNAVAILABLE")
          return { status: "unavailable", reason: "timeout" };
        if (input.candidateId) candidateVerified = true;
        return {
          status: "available",
          data: {
            candidates:
              !input.candidateId && s.repair!.mode === "MISS"
                ? []
                : [
                    {
                      entity:
                        input.candidateId === s.input.candidate.id
                          ? s.input.candidate
                          : alternative,
                      rank: 1,
                      rawAffinity:
                        input.candidateId === s.input.candidate.id
                          ? (root?.rawAffinity ?? 0.9)
                          : s.repair!.mode === "ASK"
                            ? 0.65
                            : 0.9,
                      alignmentScore:
                        input.candidateId === s.input.candidate.id
                          ? (root?.alignmentScore ?? 0.9)
                          : s.repair!.mode === "ASK"
                            ? 0.65
                            : 0.9,
                      scale: "unit",
                      explainability: {
                        status: "unavailable",
                        reason: "not_returned",
                      },
                    },
                  ],
            provenance: {
              provider: "qloo",
              host: "https://hackathon.api.qloo.com",
              endpoint: "/v2/insights",
              fetchedAt: s.input.evaluatedAt,
              signalIds: [...input.signalIds],
              targetType: input.targetType,
              ...(input.candidateId
                ? { specificCandidateId: input.candidateId }
                : {}),
            },
          },
        };
      },
    };
    const e = await service.evaluate(
      session.token,
      {
        agentId: "TasteBench",
        candidate: s.input.candidate,
        context: s.input.context,
        expectedStateVersion: version,
      },
      () => provider,
      s.input.candidate.id,
    );
    requireThat(e.decision.outcome === "REJECT");
    for (const k of Object.keys(operations)) delete operations[k];
    candidateVerified = false;
    const before = await service.read(session.token),
      interactive = new InteractiveService(store, () => s.input.evaluatedAt);
    const r = await interactive.repair(
      session.token,
      {
        evaluationId: e.evaluationId,
        expectedStateVersion: version,
        idempotencyKey: "repair",
      },
      () => provider,
      s.input.candidate.id,
    );
    const firstCalls = hash(operations),
      replay = await interactive.replay(session.token, r.repairId, "repair"),
      after = await service.read(session.token);
    const preserved =
      hash(before.state) === hash(after.state) &&
      r.originalEvaluation.decision.outcome === "REJECT" &&
      r.preservedConstraints.length ===
        before.state.entries.filter((e) => e.constraint).length &&
      (!r.verification ||
        (hash(r.verification.context) === hash(e.context) &&
          r.verification.stateHash === e.stateHash &&
          r.verification.action.kind === e.action.kind &&
          r.verification.action.candidate.type === e.action.candidate.type));
    const calls = Object.values(operations).reduce((a, b) => a + b, 0);
    return {
      kind: "REPAIR",
      expected: s.repair.expected,
      actual: r.status,
      matches:
        r.status === s.repair.expected &&
        preserved &&
        calls <= 4 &&
        hash(replay) === hash(r) &&
        firstCalls === hash(operations) &&
        (r.status !== "REPAIR_AVAILABLE" ||
          (candidateVerified &&
            ["ASK", "ALLOW"].includes(r.verification!.decision.outcome))),
      calls,
      operations,
      constraintPreserved: preserved,
      candidateVerified,
      elapsedMs: performance.now() - started,
      semanticHash: hash({
        status: r.status,
        calls,
        operations,
        preserved,
        candidateVerified,
        decision: r.verification?.decision ?? null,
        candidate: r.verification?.action.candidate ?? null,
      }),
    };
  } finally {
    await db.close();
  }
}
