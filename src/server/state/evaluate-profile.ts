import { operationMetric } from "@/server/operations/metrics";
import "server-only";
import { randomUUID } from "node:crypto";
import type { StateVersion, StateEvaluation } from "@/lib/state/types";
import { StateFailure } from "@/lib/state/types";
import { evaluationInput } from "./validation";
import type { Repositories } from "./repositories";
import type { QlooProvider } from "@/server/qloo/contracts";
import { contextRequirementReport, stateDecision } from "./policy";
import { evaluateAction } from "@/server/taste/service";
import { isResolvedProfile } from "@/server/taste/invariants";
// Internal only: callers authorize subject ownership. SELF retains its accepted
// snapshot/persistence boundary; M5 serializes delegated evaluation under owner locks.
export async function evaluateStateSnapshot(
  state: StateVersion,
  input: NonNullable<ReturnType<typeof evaluationInput>>,
  providerFactory: () => QlooProvider,
  requestId: string,
  now: string,
): Promise<StateEvaluation> {
  const started = performance.now();
  const signals = state.entries
    .filter((e) => e.kind === "EXPLICIT_LIKE")
    .map((e) => e.entity);
  if (
    !isResolvedProfile(signals) ||
    signals.some((e) => e.id === input.candidate.id)
  )
    throw new StateFailure("INVALID_INPUT");

  let cultural: StateEvaluation["cultural"] = {
    status: "unavailable",
    reason: "no_evidence",
  };
  const independent = stateDecision(
    state,
    input.candidate,
    input.context,
    cultural,
    now,
  );
  if (independent.outcome !== "REJECT") {
    try {
      const provider = providerFactory();
      const checked: QlooProvider = {
        resolve: (q) => provider.resolve(q),
        infer: (q) => provider.infer(q),
        async entities(ids) {
          const result = await provider.entities(ids);
          if (result.status === "available" && !Array.isArray(result.data))
            return { status: "unavailable", reason: "invalid_response" };
          if (
            result.status === "available" &&
            result.data.find((e) => e.id === input.candidate.id)?.type !==
              input.candidate.type
          )
            return { status: "unavailable", reason: "unsupported_entity" };
          return result;
        },
      };
      cultural = await evaluateAction(
        checked,
        signals.map((e) => e.id),
        input.candidate.id,
        requestId,
        input.context.key,
      );
    } catch {
      cultural = { status: "unavailable", reason: "provider_error" };
    }
  }
  const evaluation: StateEvaluation = {
    schemaVersion: "taste-state-evaluation-v1",
    evaluationId: randomUUID(),
    profileId: state.profileId,
    stateVersion: state.stateVersion,
    stateHash: state.stateHash,
    agentId: input.agentId,
    action: {
      kind: "SELECT_ENTITY",
      candidate:
        cultural.status === "available"
          ? cultural.data.candidate
          : input.candidate,
    },
    context: input.context,
    decision: stateDecision(
      state,
      input.candidate,
      input.context,
      cultural,
      now,
    ),
    cultural,
    culturalRequest:
      independent.outcome === "REJECT"
        ? "SKIPPED_INDEPENDENT_BLOCK"
        : "REQUESTED",
    ...requirementsOf(input.context, now),
    requestId,
    evaluatedAt: now,
    source: "live",
  };
  operationMetric(
    "DECISION",
    evaluation.decision.outcome,
    performance.now() - started,
  );
  return evaluation;
}
function requirementsOf(
  context: StateVersion extends never
    ? never
    : NonNullable<ReturnType<typeof evaluationInput>>["context"],
  now: string,
) {
  const report = contextRequirementReport(context, now);
  return report ? { requirements: report } : {};
}
export async function persistStateEvaluation(
  r: Repositories,
  state: StateVersion,
  evaluation: StateEvaluation,
) {
  await r.proposals.insert(evaluation);
  if (evaluation.cultural.status === "available")
    await r.evidence.insert({
      bundleId: evaluation.evaluationId,
      profileId: state.profileId,
      stateVersion: state.stateVersion,
      contractVersion: "qloo-event-m1",
      requestedAt: evaluation.evaluatedAt,
      receivedAt: evaluation.cultural.data.qlooEvidence.provenance.fetchedAt,
      completeness: evaluation.cultural.data.explainability.status,
      stateSignalIds: state.entries
        .filter((e) => e.kind === "EXPLICIT_LIKE")
        .map((e) => e.signalId)
        .sort(),
      receipt: evaluation.cultural.data,
    });
  await r.receipts.insert(evaluation);
}
