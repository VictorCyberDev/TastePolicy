import { stateDecision } from "@/server/state/policy";
import type { Context, StateEntry, StateVersion } from "@/lib/state/types";
import type { EvaluationResult, QlooEntity } from "@/types/domain";
import { applicable } from "@/server/state/policy";
import type {
  AutonomyLevel,
  EvidenceClass,
  FreshnessClass,
  PolicyDecision,
  PolicyDocument,
  PolicyOverride,
  TraceEntry,
} from "./types";

const DAY = 86_400_000;
export function evidenceClass(e: StateEntry): EvidenceClass {
  switch (e.kind) {
    case "CONSTRAINT":
      return "HARD_CONSTRAINT";
    case "DURABLE_FEEDBACK":
      return "EXPLICIT_NEGATIVE";
    case "EXPLICIT_LIKE":
      return "EXPLICIT_POSITIVE";
    case "CONTEXTUAL_PREFERENCE":
      return "CONTEXTUAL";
    case "EXPLORATION_INTENT":
      return "EXPLORATION";
  }
}
export function autonomyFor(
  policy: PolicyDocument,
  agentId: string,
  domain: Context["domain"],
): AutonomyLevel {
  return (
    policy.autonomy.byAgent[agentId] ??
    policy.autonomy.byDomain[domain] ??
    policy.autonomy.default
  );
}
export function overrideActive(o: PolicyOverride, now: string) {
  return (
    (!o.revokedAt || o.revokedAt > now) &&
    o.expiresAt > now &&
    o.createdAt <= now
  );
}
function overrideMatches(
  o: PolicyOverride,
  candidate: QlooEntity,
  context: Context,
  agentId: string,
) {
  const s = o.scope;
  return (
    (s.candidateId === undefined || s.candidateId === candidate.id) &&
    (s.contextKey === undefined || s.contextKey === context.key) &&
    (s.domain === undefined || s.domain === context.domain) &&
    (s.agentId === undefined || s.agentId === agentId)
  );
}
// Entries of a freshness class that are applicable and not expired.
function staleClasses(
  policy: PolicyDocument,
  state: StateVersion,
  candidate: QlooEntity,
  context: Context,
  now: string,
) {
  const stale: string[] = [];
  for (const [cls, maxDays] of Object.entries(policy.freshness) as [
    FreshnessClass,
    number,
  ][]) {
    const entries = state.entries.filter(
      (e) => evidenceClass(e) === cls && applicable(e, candidate, context, now),
    );
    if (!entries.length) continue;
    const newest = Math.max(...entries.map((e) => Date.parse(e.createdAt)));
    if (Date.parse(now) - newest > maxDays * DAY) stale.push(cls);
  }
  return stale.sort();
}
export interface PolicyEvaluationInput {
  state: StateVersion;
  candidate: QlooEntity;
  context: Context;
  cultural: EvaluationResult;
  agentId: string;
  now: string;
  policy: PolicyDocument | null;
  policyVersion: number | null;
  overrides: PolicyOverride[];
}
// Wraps the one evaluator (stateDecision). The policy can only lower an ALLOW,
// or raise per an explicit user override; hard rules and UNAVAILABLE are final.
export function evaluateWithPolicy(i: PolicyEvaluationInput): PolicyDecision {
  const base = stateDecision(
    i.state,
    i.candidate,
    i.context,
    i.cultural,
    i.now,
  );
  const trace: TraceEntry[] = [
    { step: "BASE", action: "KEPT", outcome: base.outcome, rules: base.rules },
  ];
  let outcome = base.outcome,
    basis: PolicyDecision["basis"] = base.basis,
    rules = base.rules;
  const done = (): PolicyDecision => ({
    outcome,
    basis,
    rules,
    baseOutcome: base.outcome,
    policyVersion: i.policyVersion,
    trace,
  });
  const hard =
    base.basis === "USER_HARD_BLOCK" ||
    base.basis === "CONTEXT_CONSTRAINT" ||
    base.outcome === "UNAVAILABLE";
  if (hard) {
    trace.push({
      step: "HARD_RULES",
      action: "STOPPED",
      outcome,
      note: "Hard rules and missing evidence are final; later steps cannot change them.",
    });
    // Report any override that was ignored because of this.
    for (const o of i.overrides)
      if (
        overrideActive(o, i.now) &&
        overrideMatches(o, i.candidate, i.context, i.agentId)
      )
        trace.push({
          step: "OVERRIDE",
          action: "IGNORED",
          outcome,
          note: `Override ${o.overrideId} ignored: HARD_RULES win.`,
        });
    return done();
  }
  const policy = i.policy;
  if (policy) {
    // 3. Freshness
    const stale = staleClasses(policy, i.state, i.candidate, i.context, i.now);
    if (outcome === "ALLOW" && stale.length) {
      outcome = "ASK";
      basis = "STALE_EVIDENCE";
      rules = stale.map((c) => "STALE:" + c);
      trace.push({ step: "FRESHNESS", action: "LOWERED", outcome, rules });
    } else
      trace.push({
        step: "FRESHNESS",
        action: "KEPT",
        outcome,
        note: stale.length ? "Only ALLOW is lowered." : undefined,
      });
    // 4. Autonomy ceiling
    const level = autonomyFor(policy, i.agentId, i.context.domain);
    if (outcome === "ALLOW" && level !== "AUTONOMOUS") {
      const limit = policy.autonomy.limit,
        price = i.context.price;
      const within =
        level === "CONFIRM_ABOVE_LIMIT" &&
        !!limit &&
        !!price &&
        price.currency === limit.currency &&
        price.amount <= limit.amount;
      if (!within) {
        outcome = "ASK";
        basis = "AUTONOMY_CEILING";
        rules = [
          level === "OBSERVE"
            ? "AUTONOMY:OBSERVE"
            : !price || !limit || price.currency !== limit.currency
              ? "AUTONOMY:PRICE_UNKNOWN"
              : "AUTONOMY:ABOVE_LIMIT",
        ];
        trace.push({ step: "AUTONOMY", action: "LOWERED", outcome, rules });
      } else trace.push({ step: "AUTONOMY", action: "KEPT", outcome });
    } else trace.push({ step: "AUTONOMY", action: "KEPT", outcome });
  }
  // 5. Temporary override (works with or without a published policy)
  const matching = i.overrides.filter(
    (o) =>
      overrideActive(o, i.now) &&
      overrideMatches(o, i.candidate, i.context, i.agentId),
  );
  const culturalReject =
    base.basis === "CULTURAL_POLICY" && base.outcome === "REJECT";
  const useful = matching
    .filter(
      (o) =>
        outcome === "ASK" ||
        (outcome === "REJECT" &&
          culturalReject &&
          o.effect === "ALLOW_THROUGH_CULTURAL_REJECT"),
    )
    .sort((a, b) => a.overrideId.localeCompare(b.overrideId))[0];
  if (useful) {
    outcome = "ALLOW";
    basis = "USER_TEMPORARY_OVERRIDE";
    rules = ["OVERRIDE:" + useful.overrideId];
    trace.push({ step: "OVERRIDE", action: "RAISED", outcome, rules });
  } else if (matching.length)
    trace.push({
      step: "OVERRIDE",
      action: "IGNORED",
      outcome,
      note: "A matching override does not apply to this outcome.",
    });
  return done();
}
