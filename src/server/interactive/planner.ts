import type {
  StateVersion,
  StateEvaluation,
  StateDecision,
  Context,
} from "@/lib/state/types";
import { StateFailure } from "@/lib/state/types";
import type {
  ClarificationPlan,
  InteractiveAuthorization,
  Answer,
  Factor,
} from "@/lib/interactive/types";
import { applicable, stateDecision } from "@/server/state/policy";
import { hash } from "@/server/state/hash";
export function planClarification(
  e: StateEvaluation,
  state: StateVersion,
  currentVersion: number,
  parent?: InteractiveAuthorization,
): ClarificationPlan {
  if (
    state.profileId !== e.profileId ||
    state.stateVersion !== e.stateVersion ||
    state.stateHash !== e.stateHash ||
    (parent &&
      (parent.originalEvaluation.evaluationId !== e.evaluationId ||
        parent.stateVersion !== e.stateVersion))
  )
    throw new StateFailure("INVALID_INPUT");
  const context = parent?.context ?? e.context,
    decision = parent?.finalDecision ?? e.decision;
  let factor: Factor | undefined;
  if (decision.outcome === "ASK" && currentVersion === e.stateVersion) {
    const prices = state.entries
      .filter(
        (s) =>
          applicable(s, e.action.candidate, context, e.evaluatedAt) &&
          s.constraint?.kind === "MAX_PRICE",
      )
      .sort((a, b) => a.signalId.localeCompare(b.signalId));
    const unresolved = prices.find(
      (s) =>
        !context.price ||
        (s.constraint?.kind === "MAX_PRICE" &&
          context.price.currency !== s.constraint.currency),
    );
    if (unresolved && unresolved.constraint?.kind === "MAX_PRICE")
      factor = {
        kind: context.price ? "PRICE_CURRENCY_REQUIRED" : "PRICE_REQUIRED",
        constraintId: unresolved.signalId,
        currency: unresolved.constraint.currency,
        question: `Provide this candidate's price in ${unresolved.constraint.currency}, or choose UNKNOWN.`,
        policyEffect:
          "Reevaluate the applicable maximum-price rule without FX conversion.",
        answerSchema: "MONEY_OR_UNKNOWN",
      };
    else if (
      e.cultural.status === "available" &&
      e.cultural.data.decision.outcome === "ASK"
    )
      factor = {
        kind: "CULTURAL_BORDERLINE",
        question:
          "For this candidate in this context, is the proposal acceptable, unacceptable, or still unresolved?",
        policyEffect:
          "Apply explicit interaction-scoped disposition; cultural ASK remains captured truth.",
        answerSchema: "DISPOSITION",
      };
  }
  const status =
    currentVersion !== e.stateVersion
      ? "STALE"
      : factor
        ? "ACTIONABLE"
        : "NO_ACTIONABLE_CLARIFICATION";
  const parentClarificationId = parent?.interactionId ?? null;
  return {
    schemaVersion: "clarification-plan-v1",
    evaluationId: e.evaluationId,
    profileId: e.profileId,
    stateVersion: e.stateVersion,
    parentClarificationId,
    status,
    planId: hash({
      evaluationId: e.evaluationId,
      stateVersion: e.stateVersion,
      parentClarificationId,
      status,
      factor: factor ?? null,
    }),
    ...(factor ? { factor } : {}),
    evidenceSource: "captured",
  };
}
export function resolveClarification(
  e: StateEvaluation,
  state: StateVersion,
  plan: ClarificationPlan,
  answer: Answer,
  parent?: InteractiveAuthorization,
): { context: Context; decision: StateDecision } {
  if (plan.status !== "ACTIONABLE" || !plan.factor)
    throw new StateFailure("INVALID_INPUT");
  const context: Context = structuredClone(parent?.context ?? e.context);
  if (plan.factor.answerSchema === "MONEY_OR_UNKNOWN") {
    if (
      (answer.kind !== "PRICE" && answer.kind !== "UNKNOWN") ||
      (answer.kind === "PRICE" && answer.currency !== plan.factor.currency)
    )
      throw new StateFailure("INVALID_INPUT");
    if (answer.kind === "PRICE")
      context.price = { amount: answer.amount, currency: answer.currency };
  } else if (answer.kind !== "DISPOSITION")
    throw new StateFailure("INVALID_INPUT");
  let decision = stateDecision(
    state,
    e.action.candidate,
    context,
    e.cultural,
    e.evaluatedAt,
  );
  if (
    plan.factor.kind === "CULTURAL_BORDERLINE" &&
    answer.kind === "DISPOSITION" &&
    decision.outcome === "ASK" &&
    decision.basis !== "UNRESOLVED_CONTEXT"
  ) {
    if (answer.value === "ACCEPTABLE")
      decision = {
        outcome: "ALLOW",
        basis: "CULTURAL_PLUS_CONTEXT",
        rules: ["EXPLICIT_CONTEXT_ACCEPTABLE"],
      };
    if (answer.value === "UNACCEPTABLE")
      decision = {
        outcome: "REJECT",
        basis: "CONTEXT_CONSTRAINT",
        rules: ["EXPLICIT_CONTEXT_UNACCEPTABLE"],
      };
  }
  return { context, decision };
}
