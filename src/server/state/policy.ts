import type {
  Context,
  StateEntry,
  StateVersion,
  StateDecision,
} from "@/lib/state/types";
import type { EvaluationResult, QlooEntity } from "@/types/domain";
import { evaluateRequirements } from "@/lib/requirements/evaluate";
import type {
  CandidateFact,
  RequirementReport,
} from "@/lib/requirements/types";
export function applicable(
  entry: StateEntry,
  candidate: QlooEntity,
  context: Context,
  now: string,
) {
  if (entry.expiresAt && entry.expiresAt <= now) return false;
  return (
    entry.scope === "GLOBAL_PREFERENCE" ||
    (entry.scope === "CANDIDATE_ONLY" && entry.candidateId === candidate.id) ||
    (entry.scope === "CONTEXT" && entry.contextKey === context.key) ||
    (entry.scope === "DOMAIN" && entry.domain === context.domain)
  );
}
// The facts a context carries, plus the one the evaluator already knows: the
// price the person was quoted. A "price" requirement reads it as a fact that
// the person supplied, so MAX_PRICE rules and price requirements agree.
export function contextRequirementReport(
  context: Context,
  now: string,
): RequirementReport | null {
  if (!context.requirements?.length) return null;
  const facts: CandidateFact[] = [...(context.facts ?? [])];
  if (context.price && !facts.some((f) => f.key === "price"))
    facts.push({
      key: "price",
      value: context.price.amount,
      state: "known",
      evidence: "USER_CONFIRMED",
      source: "context.price",
      sourceType: "USER",
      unit: context.price.currency,
    });
  return evaluateRequirements(context.requirements, facts, now);
}
export function stateDecision(
  state: StateVersion,
  candidate: QlooEntity,
  context: Context,
  cultural: EvaluationResult,
  now: string,
): StateDecision {
  const entries = state.entries.filter((e) =>
      applicable(e, candidate, context, now),
    ),
    rules: string[] = [];
  for (const e of entries) {
    const c = e.constraint;
    if (c?.kind === "EXCLUDE_CANDIDATE" && e.candidateId === candidate.id)
      rules.push("EXACT_CANDIDATE_EXCLUSION:" + e.signalId);
    if (
      c?.kind === "MAX_PRICE" &&
      context.price &&
      context.price.currency === c.currency &&
      context.price.amount > c.amount
    )
      rules.push("MAX_PRICE_VIOLATION:" + e.signalId);
  }
  // A known hard-requirement violation is final and independent of taste.
  const requirements = contextRequirementReport(context, now);
  for (const key of requirements?.hardViolated ?? [])
    rules.push("REQUIREMENT_VIOLATION:" + key);
  if (rules.length)
    return {
      outcome: "REJECT",
      basis: rules.some((r) => r.startsWith("EXACT"))
        ? "USER_HARD_BLOCK"
        : "CONTEXT_CONSTRAINT",
      rules: rules.sort(),
    };
  if (cultural.status === "unavailable")
    return {
      outcome: "UNAVAILABLE",
      basis: "REQUIRED_EVIDENCE_MISSING",
      rules: [cultural.reason],
    };
  const unresolved = entries.filter(
    (e) =>
      e.constraint?.kind === "MAX_PRICE" &&
      (!context.price || context.price.currency !== e.constraint.currency),
  );
  if (cultural.data.decision.outcome === "REJECT")
    return {
      outcome: "REJECT",
      basis: "CULTURAL_POLICY",
      rules: [cultural.data.decision.reasonCode],
    };
  // Evidence the provider could not supply: pause, never guess.
  if (requirements?.hardUnavailable.length)
    return {
      outcome: "UNAVAILABLE",
      basis: "REQUIRED_EVIDENCE_MISSING",
      rules: requirements.hardUnavailable.map(
        (k) => "REQUIREMENT_EVIDENCE_UNAVAILABLE:" + k,
      ),
    };
  const unknown = (requirements?.hardUnknown ?? []).map(
    (k) => "REQUIRED_FACT:" + k,
  );
  if (unresolved.length || unknown.length)
    return {
      outcome: "ASK",
      basis: "UNRESOLVED_CONTEXT",
      rules: [
        ...unresolved.map((e) => "REQUIRED_PRICE:" + e.signalId),
        ...unknown,
      ].sort(),
    };
  return {
    outcome: cultural.data.decision.outcome,
    basis:
      entries.some((e) => e.constraint) || requirements
        ? "CULTURAL_PLUS_CONTEXT"
        : "CULTURAL_POLICY",
    rules: [cultural.data.decision.reasonCode],
  };
}
