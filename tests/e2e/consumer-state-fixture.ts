// SYNTHETIC TEST DATA — browser contract fixture, never a live acceptance claim.
import type { Page } from "@playwright/test";
import type { CulturalReceipt, QlooEntity } from "../../src/types/domain";
import type {
  StateEvaluation,
  StateVersion,
  MutationRequest,
} from "../../src/lib/state/types";
import { stateDecision } from "../../src/server/state/policy";
import {
  planClarification,
  resolveClarification,
} from "../../src/server/interactive/planner";
import type {
  InteractiveAuthorization,
  RepairResult,
} from "../../src/lib/interactive/types";
import { entities } from "../qloo-fixtures";

export async function mockConsumerState(
  page: Page,
  receipt: CulturalReceipt,
  candidates: QlooEntity[],
  options: {
    unavailable?: boolean;
    stale?: boolean;
    mismatched?: boolean;
  } = {},
) {
  const state: StateVersion = {
    profileId: crypto.randomUUID(),
    stateVersion: 0,
    parentVersion: null,
    createdAt: receipt.evaluatedAt,
    mutationId: null,
    stateHash: "synthetic-state-0",
    entries: [],
  };
  const calls: { operation: string; body: Record<string, unknown> }[] = [];
  const evaluationInputs: unknown[] = [];
  const evaluations: StateEvaluation[] = [];
  const answers = new Map<string, InteractiveAuthorization>();
  let repair: RepairResult | undefined;
  const snapshot = () => structuredClone(state);
  const makeEvaluation = (
    candidate: QlooEntity,
    context: StateEvaluation["context"],
  ) => {
    const cultural: StateEvaluation["cultural"] = options.unavailable
      ? { status: "unavailable", reason: "timeout" }
      : {
          status: "available",
          data: {
            ...receipt,
            candidate,
            action: { ...receipt.action, targetEntity: candidate },
          },
        };
    const e: StateEvaluation = {
      schemaVersion: "taste-state-evaluation-v1",
      evaluationId: crypto.randomUUID(),
      profileId: state.profileId,
      stateVersion: state.stateVersion,
      stateHash: state.stateHash,
      agentId: "Arena-Concierge",
      action: { kind: "SELECT_ENTITY", candidate },
      context,
      decision: stateDecision(
        state,
        candidate,
        context,
        cultural,
        receipt.evaluatedAt,
      ),
      cultural,
      culturalRequest: "REQUESTED",
      requestId: crypto.randomUUID(),
      evaluatedAt: receipt.evaluatedAt,
      source: "live",
    };
    return e;
  };
  if (options.mismatched) {
    state.stateVersion = 1;
    state.entries = entities.slice(0, 5).map((original, index) => ({
      signalId: crypto.randomUUID(),
      kind: "EXPLICIT_LIKE",
      entity:
        index === 4
          ? { ...original, id: "10000000-0000-4000-8000-000000000008" }
          : original,
      scope: "GLOBAL_PREFERENCE",
      persistence: "DURABLE",
      source: "USER",
      sourceEventId: crypto.randomUUID(),
      createdAt: receipt.evaluatedAt,
    }));
  }
  await page.route("**/api/state/**", async (route) => {
    const operation = new URL(route.request().url()).pathname.replace(
      "/api/state/",
      "",
    );
    const body = route.request().postDataJSON();
    calls.push({ operation, body });
    let data: unknown = {};
    if (operation === "read") data = { state: snapshot() };
    if (operation === "mutate") {
      const payload = body.payload as MutationRequest["payload"];
      state.parentVersion = state.stateVersion;
      state.stateVersion++;
      state.stateHash = `synthetic-state-${state.stateVersion}`;
      if (payload.kind === "INITIALIZE")
        state.entries = payload.signals.map((entity) => ({
          signalId: crypto.randomUUID(),
          kind: "EXPLICIT_LIKE",
          entity,
          scope: "GLOBAL_PREFERENCE",
          persistence: "DURABLE",
          source: "USER",
          sourceEventId: crypto.randomUUID(),
          createdAt: receipt.evaluatedAt,
        }));
      if (payload.kind === "FEEDBACK")
        state.entries.push({
          ...payload.feedback,
          signalId: crypto.randomUUID(),
          kind: "CONSTRAINT",
          source: "USER",
          sourceEventId: crypto.randomUUID(),
          createdAt: receipt.evaluatedAt,
          constraint:
            payload.feedback.category === "SPECIFIC_DISLIKE"
              ? { kind: "EXCLUDE_CANDIDATE" }
              : { kind: "MAX_PRICE", ...payload.feedback.maxPrice! },
        });
      data = { state: snapshot() };
    }
    if (operation === "evaluate") {
      evaluationInputs.push(body);
      if (options.stale || body.expectedStateVersion !== state.stateVersion)
        return route.fulfill({
          status: 409,
          json: { status: "error", code: "STATE_VERSION_CONFLICT" },
        });
      const e = makeEvaluation(body.candidate, body.context);
      evaluations.push(e);
      data = e;
    }
    if (operation === "interactive/plan") {
      const e = evaluations.find((e) => e.evaluationId === body.evaluationId)!;
      data = planClarification(
        e,
        state,
        state.stateVersion,
        answers.get(body.parentClarificationId),
      );
    }
    if (operation === "interactive/answer") {
      const e = evaluations.find((e) => e.evaluationId === body.evaluationId)!;
      const parent = answers.get(body.parentClarificationId);
      const plan = planClarification(e, state, state.stateVersion, parent);
      const resolved = resolveClarification(
        e,
        state,
        plan,
        body.answer,
        parent,
      );
      const result: InteractiveAuthorization = {
        schemaVersion: "interactive-authorization-v1",
        interactionId: crypto.randomUUID(),
        originalEvaluation: e,
        parentClarificationId: parent?.interactionId ?? null,
        plan,
        answer: body.answer,
        context: resolved.context,
        finalDecision: resolved.decision,
        capturedEvidenceReference: e.evaluationId,
        stateVersion: state.stateVersion,
        stateHash: state.stateHash,
        provenance: {
          source: "EXPLICIT_INTERACTION",
          answeredAt: receipt.evaluatedAt,
          requestId: crypto.randomUUID(),
        },
        evidenceSource: "captured",
      };
      answers.set(result.interactionId, result);
      data = result;
    }
    if (operation === "interactive/repair") {
      const original = evaluations.find(
        (e) => e.evaluationId === body.evaluationId,
      )!;
      const budget = state.entries.some(
        (e) => e.constraint?.kind === "MAX_PRICE",
      );
      const verification = makeEvaluation(candidates[1], original.context);
      repair = {
        schemaVersion: "repair-plan-v1",
        repairId: crypto.randomUUID(),
        originalEvaluation: original,
        stateVersion: state.stateVersion,
        status: budget ? "NO_VERIFIABLE_REPAIR" : "REPAIR_AVAILABLE",
        reason: "SYNTHETIC TEST DATA",
        method: {
          kind: "BOUNDED_CANDIDATE_SUBSTITUTION",
          structuralCost: 1,
          maxCandidates: 1,
          maxProviderCalls: 4,
          providerCalls: budget ? 0 : 4,
          ordering: "DISCOVERY_RANK_THEN_ID",
          discovered: [],
        },
        preservedConstraints: state.entries
          .filter((e) => e.constraint)
          .map((e) => e.signalId),
        changeSet: budget
          ? []
          : [
              {
                field: "candidate",
                from: original.action.candidate.id,
                to: verification.action.candidate.id,
              },
            ],
        ...(budget ? {} : { verification }),
        evidenceSource: "captured",
        createdAt: receipt.evaluatedAt,
        requestId: crypto.randomUUID(),
      };
      data = repair;
    }
    await route.fulfill({ json: { status: "available", data } });
  });
  return {
    state,
    calls,
    evaluationInputs,
    evaluations,
    answers,
    get repair() {
      return repair;
    },
  };
}
