// SYNTHETIC TEST DATA. No production import or live provider claim.
import { readFile } from "node:fs/promises";
import { testDatabase } from "./state-database";
import { TasteStateService } from "@/server/state/service";
import { InteractiveService } from "@/server/interactive/service";
import { entities } from "./qloo-fixtures";
import type { QlooProvider } from "@/server/qloo/contracts";
import type {
  CulturalEvidence,
  QlooEntity,
  UnavailableReason,
} from "@/types/domain";
import type { StateStore } from "@/server/state/repositories";
import type { FeedbackInput, Context } from "@/lib/state/types";
export const NOW = "2026-10-15T12:00:00.000Z";
export const ALT: QlooEntity = {
  id: "10000000-0000-4000-8000-000000000006",
  name: "Synthetic alternative",
  type: "destination",
};
export const ALT2: QlooEntity = {
  ...ALT,
  id: "10000000-0000-4000-8000-000000000007",
  name: "Synthetic second alternative",
};
export const reqId = entities[0].id;
export const proposal = (
  version: number,
  context: Context = { key: "trip", domain: "destination" },
) => ({
  agentId: "Agent-A",
  candidate: entities[5],
  context,
  expectedStateVersion: version,
});
export function provider(
  options: {
    score?: number;
    candidateScore?: number;
    candidates?: { entity: QlooEntity; rank: number }[];
    failure?: UnavailableReason;
    failVerify?: UnavailableReason;
  } = {},
) {
  const calls: string[] = [];
  const all = [...entities, ALT, ALT2];
  const evidence = (
    entity: QlooEntity,
    score: number,
    rank = 1,
  ): CulturalEvidence => ({
    entity,
    rank,
    rawAffinity: score,
    alignmentScore: score,
    scale: "unit",
    explainability: { status: "unavailable", reason: "not_returned" },
  });
  const q: QlooProvider = {
    async resolve() {
      throw Error("unused");
    },
    async entities(ids) {
      calls.push("entities");
      if (options.failure)
        return { status: "unavailable", reason: options.failure };
      return {
        status: "available",
        data: ids.map((id) => all.find((e) => e.id === id)!),
      };
    },
    async infer(input) {
      calls.push(
        input.candidateId ? "candidate-insights" : "discovery-insights",
      );
      if (input.candidateId && options.failVerify)
        return { status: "unavailable", reason: options.failVerify };
      return {
        status: "available",
        data: {
          candidates: input.candidateId
            ? [
                evidence(
                  all.find((e) => e.id === input.candidateId)!,
                  input.candidateId === entities[5].id
                    ? (options.score ?? 0.9)
                    : (options.candidateScore ?? 0.9),
                ),
              ]
            : (options.candidates ?? [{ entity: ALT, rank: 1 }]).map((c) =>
                evidence(c.entity, 0.99, c.rank),
              ),
          provenance: {
            provider: "qloo",
            endpoint: "/v2/insights",
            host: "https://hackathon.api.qloo.com",
            fetchedAt: NOW,
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
  return { q, calls };
}
export async function interactiveDatabase(dataDir?: string, migrate = true) {
  const d = await testDatabase(dataDir, migrate);
  if (migrate)
    await d.db.exec(
      await readFile(
        new URL(
          "../migrations/0002_interactive_authorization.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
  return d;
}
export async function setup(
  store: StateStore,
  options: { score?: number; feedback?: FeedbackInput; context?: Context } = {},
) {
  const stateService = new TasteStateService(store, () => NOW),
    interactive = new InteractiveService(store, () => NOW),
    session = await stateService.createSession();
  await stateService.mutate(
    session.token,
    {
      expectedStateVersion: 0,
      idempotencyKey: "init",
      payload: { kind: "INITIALIZE", signals: entities.slice(0, 5) },
    },
    reqId,
  );
  let version = 1;
  if (options.feedback) {
    await stateService.mutate(
      session.token,
      {
        expectedStateVersion: 1,
        idempotencyKey: "feedback",
        payload: { kind: "FEEDBACK", feedback: options.feedback },
      },
      reqId,
    );
    version = 2;
  }
  const p = provider({ score: options.score });
  const e = await stateService.evaluate(
    session.token,
    proposal(version, options.context),
    () => p.q,
    reqId,
  );
  return {
    stateService,
    interactive,
    token: session.token,
    e,
    state: (await stateService.read(session.token)).state,
  };
}
export const priceRule: FeedbackInput = {
  category: "TOO_EXPENSIVE",
  scope: "CONTEXT",
  persistence: "CONTEXT_SCOPED",
  contextKey: "trip",
  maxPrice: { amount: 50, currency: "USD" },
};
export const exclusion: FeedbackInput = {
  category: "SPECIFIC_DISLIKE",
  scope: "CANDIDATE_ONLY",
  persistence: "DURABLE",
  candidateId: entities[5].id,
};

// What a relying agent presents when it verifies, checkpoints or resumes a
// commitment-aware lease: the commitments the lease view carries, i.e. "the
// choice is still the one I was issued this lease for".
export const commitOf = (lease: {
  commitments?: { candidate: string; context: string } | null;
}) => ({
  candidateCommitment: lease.commitments?.candidate,
  contextCommitment: lease.commitments?.context,
});
// Registry for helpers that only know a leaseRef.
const issued = new Map<string, ReturnType<typeof commitOf>>();
export const rememberLease = <T>(view: T): T => {
  const v = view as unknown as Parameters<typeof commitOf>[0] & {
    leaseRef: string;
  };
  issued.set(v.leaseRef, commitOf(v));
  return view;
};
export const presentFor = (leaseRef: string) => issued.get(leaseRef) ?? {};
