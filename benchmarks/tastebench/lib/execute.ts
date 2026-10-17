import { performance } from "node:perf_hooks";
import { evaluateEvidence } from "@/server/policy/evaluate";
import { createReceipt } from "@/server/receipts/createReceipt";
import { stateDecision } from "@/server/state/policy";
import {
  planClarification,
  resolveClarification,
} from "@/server/interactive/planner";
import type { StateEvaluation } from "@/lib/state/types";
import type { CulturalReceipt, CulturalEvidence } from "@/types/domain";
import type {
  Scenario,
  System,
  Prediction,
  Input,
  ScenarioResult,
} from "./types";
import { hash, requireThat } from "./validate";
import { inputHash, semanticPrediction } from "./packets";
export function evidenceOf(r: CulturalReceipt): CulturalEvidence {
  return {
    entity: r.candidate,
    rawAffinity: r.qlooEvidence.rawAffinity,
    alignmentScore: r.alignmentScore,
    scale: r.qlooEvidence.scale,
    rank: 1,
    explainability: r.explainability,
  };
}
export function culturalEvaluation(i: Input) {
  if (i.cultural.status === "unavailable") return i.cultural;
  const r = i.cultural.data,
    e = evidenceOf(r),
    d = evaluateEvidence(e);
  requireThat(d.status === "available");
  return {
    status: "available" as const,
    data: createReceipt(
      {
        action: r.action,
        signals: r.inputSignals,
        evidence: e,
        provenance: r.qlooEvidence.provenance,
        decision: d.data,
        requestId: r.requestId,
      },
      () => r.evaluatedAt,
      () => r.receiptId,
    ),
  };
}
export function execute(s: Scenario, system: System): Prediction {
  requireThat(!["GENERIC_AI", "LLM_QLOO"].includes(system));
  if (system === "AFTER_FEEDBACK") requireThat(s.feedback);
  const input =
    system === "AFTER_FEEDBACK"
      ? {
          ...s.input,
          state: s.feedback!.after,
          evaluatedAt: s.feedback!.evaluatedAt,
        }
      : s.input;
  const start = performance.now();
  const cultural = culturalEvaluation(input);
  const decision =
    system === "QLOO_POLICY"
      ? cultural.status === "available"
        ? {
            outcome: cultural.data.decision.outcome,
            basis: "CULTURAL_POLICY",
            rules: [cultural.data.decision.reasonCode],
          }
        : {
            outcome: "UNAVAILABLE" as const,
            basis: "REQUIRED_EVIDENCE_MISSING",
            rules: [cultural.reason],
          }
      : stateDecision(
          input.state,
          input.candidate,
          input.context,
          cultural,
          input.evaluatedAt,
        );
  const blocked =
    decision.basis === "USER_HARD_BLOCK" ||
    (decision.basis === "CONTEXT_CONSTRAINT" && decision.outcome === "REJECT");
  const result: Prediction = {
    schemaVersion: "tastebench-prediction-v1",
    scenarioId: s.id,
    systemId: system,
    systemVersion: "tastebench-adapters-v1",
    candidateId: input.candidate.id,
    inputHash: inputHash(s, system),
    status: "OK",
    decision: decision.outcome,
    basis: decision.basis,
    reason: decision.rules.join("|"),
    evidenceMode: "CAPTURED",
    dataSource: s.source,
    latencyMs: performance.now() - start,
    latencyKind: "OFFLINE_POLICY",
    providerCalls: 0,
    provenance: {
      method: "CAPTURED_POLICY_REPLAY",
      policyVersion: "tastepolicy-v1-experimental",
    },
    receipt: cultural.status === "available" && !blocked ? cultural.data : null,
    semanticHash: "",
  };
  result.semanticHash = hash(semanticPrediction(result));
  return result;
}
export function evaluation(s: Scenario, p: Prediction): StateEvaluation {
  return {
    schemaVersion: "taste-state-evaluation-v1",
    evaluationId: s.input.candidate.id,
    profileId: s.input.state.profileId,
    stateVersion: s.input.state.stateVersion,
    stateHash: s.input.state.stateHash,
    agentId: "TasteBench",
    action: { kind: "SELECT_ENTITY", candidate: s.input.candidate },
    context: s.input.context,
    decision: {
      outcome: p.decision!,
      basis: p.basis as StateEvaluation["decision"]["basis"],
      rules: p.reason?.split("|") ?? [],
    },
    cultural: s.input.cultural,
    culturalRequest: "REQUESTED",
    requestId: s.input.candidate.id,
    evaluatedAt: s.input.evaluatedAt,
    source: "recorded",
  };
}
export function perturbed(
  s: Scenario,
  change: Scenario["perturbations"][number],
): Scenario {
  const x = structuredClone(s);
  if (change.field === "price") x.input.context.price!.amount = change.value;
  else {
    requireThat(x.input.cultural.status === "available");
    const r = x.input.cultural.data,
      e = {
        ...evidenceOf(r),
        rawAffinity:
          r.qlooEvidence.scale === "unit" ? change.value : change.value * 100,
        alignmentScore: change.value,
      };
    const d = evaluateEvidence(e);
    requireThat(d.status === "available");
    x.input.cultural = {
      status: "available",
      data: createReceipt(
        {
          action: r.action,
          signals: r.inputSignals,
          evidence: e,
          provenance: r.qlooEvidence.provenance,
          decision: d.data,
          requestId: r.requestId,
        },
        () => r.evaluatedAt,
        () => r.receiptId,
      ),
    };
  }
  return x;
}
export const RECEIPT_FIELDS = [
  "receiptId",
  "schemaVersion",
  "normalizationVersion",
  "policyVersion",
  "decision",
  "action",
  "candidate",
  "inputSignals",
  "alignmentScore",
  "qlooEvidence",
  "explainability",
  "policy",
  "requestId",
  "evaluatedAt",
] as const;
export function receiptCompleteness(p: Prediction) {
  const eligible =
    !["GENERIC_AI", "LLM_QLOO"].includes(p.systemId) &&
    p.status === "OK" &&
    p.decision !== "UNAVAILABLE" &&
    p.basis !== "USER_HARD_BLOCK" &&
    !(p.basis === "CONTEXT_CONSTRAINT" && p.decision === "REJECT");
  if (!eligible) return { eligible: false, missing: [] as string[] };
  return {
    eligible: true,
    missing: RECEIPT_FIELDS.filter(
      (k) => p.receipt?.[k] === undefined || p.receipt?.[k] === null,
    ),
  };
}

export async function resultFor(
  s: Scenario,
  p: Prediction,
): Promise<ScenarioResult> {
  let mismatches = 0;
  const deterministic = !["GENERIC_AI", "LLM_QLOO"].includes(p.systemId);
  if (deterministic)
    for (let j = 0; j < 2; j++)
      if (execute(s, p.systemId).semanticHash !== p.semanticHash) mismatches++;
  const stability = deterministic
    ? s.perturbations
        .filter(
          (change) =>
            p.systemId === "FULL_TASTEPOLICY" ||
            (p.systemId === "QLOO_POLICY" && change.field === "score"),
        )
        .map((change) => {
          const q = execute(perturbed(s, change), p.systemId);
          return {
            id: change.id,
            field: change.field,
            original: p.decision,
            perturbed: q.decision!,
            expected: change.expected,
            matches: q.decision === change.expected,
          };
        })
    : [];
  let interaction: ScenarioResult["interaction"] = null;
  if (s.clarification && p.systemId === "FULL_TASTEPOLICY") {
    const start = performance.now(),
      e = evaluation(s, p),
      plan = planClarification(e, s.input.state, s.input.state.stateVersion);
    const actual = plan.factor
      ? resolveClarification(e, s.input.state, plan, s.clarification.answer)
          .decision.outcome
      : p.decision;
    const again = planClarification(
      e,
      s.input.state,
      s.input.state.stateVersion,
    );
    interaction = {
      kind: "CLARIFICATION",
      expected: s.clarification.expected,
      actual: actual!,
      matches:
        actual === s.clarification.expected &&
        (plan.factor?.kind ?? "NONE") === s.clarification.expectedFactor &&
        hash(plan) === hash(again),
      calls: 0,
      operations: {},
      constraintPreserved: true,
      candidateVerified: false,
      elapsedMs: performance.now() - start,
      semanticHash: hash({ plan, actual }),
    };
  }
  if (s.repair && p.systemId === "FULL_TASTEPOLICY") {
    const { repairCheck } = await import("./repair");
    interaction = await repairCheck(s);
  }
  return {
    scenarioId: s.id,
    systemId: p.systemId,
    predictionHash: p.semanticHash,
    contractExpected: s.contract[p.systemId] ?? null,
    contractMatch:
      s.contract[p.systemId] === undefined
        ? null
        : s.contract[p.systemId] === p.decision,
    replay: { comparisons: deterministic ? 2 : 0, mismatches },
    stability,
    interaction,
    feedback:
      p.systemId === "AFTER_FEEDBACK"
        ? {
            before: execute(s, "FULL_TASTEPOLICY").decision,
            after: p.decision,
            expected: s.feedback!.expected,
            matches: p.decision === s.feedback!.expected,
            stateVersion: s.feedback!.after.stateVersion,
            stateHash: s.feedback!.after.stateHash,
          }
        : null,
  };
}
