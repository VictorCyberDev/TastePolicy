import type {
  Context,
  StateEntry,
  StateVersion,
  StateDecision,
} from "@/lib/state/types";
import type { EvaluationResult, QlooEntity } from "@/types/domain";
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
  if (unresolved.length)
    return {
      outcome: "ASK",
      basis: "UNRESOLVED_CONTEXT",
      rules: unresolved.map((e) => "REQUIRED_PRICE:" + e.signalId).sort(),
    };
  return {
    outcome: cultural.data.decision.outcome,
    basis: entries.some((e) => e.constraint)
      ? "CULTURAL_PLUS_CONTEXT"
      : "CULTURAL_POLICY",
    rules: [cultural.data.decision.reasonCode],
  };
}
