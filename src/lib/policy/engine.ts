import { stateDecision } from "@/server/state/policy";
import type { Context, StateEntry, StateVersion } from "@/lib/state/types";
import type { EvaluationResult, QlooEntity } from "@/types/domain";
import { applicable } from "@/server/state/policy";
import {
  actionLevel,
  own,
  SUBJECTIVE_ACTIONS,
  type ActionTrace,
  type CeilingSource,
  type OrganizationCeiling,
  type SubjectiveAction,
} from "./types";
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
    own(policy.autonomy.byAgent, agentId) ??
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
  // The subjective action the agent intends to take with an ALLOW. Absent for
  // legacy callers, who keep the legacy contract exactly.
  requestedAction?: SubjectiveAction;
  organization?: OrganizationCeiling | null;
}
// Highest action that needs no question, and who set it. Agent beats domain
// beats default; a sensitive-domain cap and an organization ceiling can only
// lower the result, never raise it.
export function resolveCeiling(
  policy: PolicyDocument | null,
  agentId: string,
  domain: Context["domain"],
  organization: OrganizationCeiling | null | undefined,
): { ceiling: SubjectiveAction; source: CeilingSource } {
  let ceiling: SubjectiveAction = "ADD_TO_DRAFT",
    source: CeilingSource = "NONE";
  const a = policy?.actions;
  if (a) {
    const byAgent = own(a.byAgent, agentId);
    if (byAgent) [ceiling, source] = [byAgent, "AGENT"];
    else if (a.byDomain[domain])
      [ceiling, source] = [a.byDomain[domain]!, "DOMAIN"];
    else [ceiling, source] = [a.default, "DEFAULT"];
  }
  const cap = policy?.sensitive?.[domain]?.maxAction;
  if (cap && actionLevel(cap) < actionLevel(ceiling))
    [ceiling, source] = [cap, "SENSITIVE_DOMAIN"];
  if (
    organization &&
    actionLevel(organization.maxAction) < actionLevel(ceiling)
  )
    [ceiling, source] = [organization.maxAction, "ORGANIZATION"];
  return { ceiling, source };
}
const upTo = (a: SubjectiveAction) =>
  SUBJECTIVE_ACTIONS.filter((x) => actionLevel(x) <= actionLevel(a));
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
  let actionTrace: ActionTrace | undefined;
  const done = (): PolicyDecision => ({
    outcome,
    basis,
    rules,
    baseOutcome: base.outcome,
    policyVersion: i.policyVersion,
    trace,
    ...(actionTrace ? { action: actionTrace } : {}),
  });
  const wantsAction =
    i.requestedAction !== undefined || !!i.policy?.actions || !!i.organization;
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
    if (wantsAction)
      actionTrace = {
        requested: i.requestedAction ?? null,
        ceiling: null,
        ceilingSource: "NONE",
        escalationRequired: false,
        permitted: [],
      };
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
  // 5. Sensitive subjective domain. Only an ALLOW is lowered.
  const rule = policy?.sensitive?.[i.context.domain];
  if (rule) {
    if (outcome === "ALLOW" && rule.alwaysAsk) {
      outcome = "ASK";
      basis = "SENSITIVE_DOMAIN";
      rules = ["SENSITIVE:ALWAYS_ASK"];
      trace.push({ step: "SENSITIVE", action: "LOWERED", outcome, rules });
    } else if (outcome === "ALLOW" && rule.freshExplicitDays !== undefined) {
      const explicit = i.state.entries.filter(
        (e) =>
          evidenceClass(e) === "EXPLICIT_POSITIVE" &&
          applicable(e, i.candidate, i.context, i.now),
      );
      const newest = explicit.length
        ? Math.max(...explicit.map((e) => Date.parse(e.createdAt)))
        : null;
      if (
        newest === null ||
        Date.parse(i.now) - newest > rule.freshExplicitDays * DAY
      ) {
        outcome = "ASK";
        basis = "SENSITIVE_DOMAIN";
        rules = ["SENSITIVE:FRESH_EXPLICIT_EVIDENCE_REQUIRED"];
        trace.push({ step: "SENSITIVE", action: "LOWERED", outcome, rules });
      } else trace.push({ step: "SENSITIVE", action: "KEPT", outcome });
    } else trace.push({ step: "SENSITIVE", action: "KEPT", outcome });
  }
  // 6. Subjective action ladder. Only an ALLOW is lowered; the requested
  // action is compared with the resolved ceiling and the result is recorded.
  let escalated = false,
    orgBlocked = false;
  const { ceiling, source } = resolveCeiling(
    policy,
    i.agentId,
    i.context.domain,
    i.organization,
  );
  if (wantsAction) {
    const req = i.requestedAction ?? null;
    escalated = req !== null && actionLevel(req) > actionLevel(ceiling);
    if (
      (outcome === "ALLOW" || outcome === "ASK") &&
      escalated &&
      source === "ORGANIZATION"
    ) {
      // The organization wins over every earlier step, including an ASK the
      // owner could have confirmed: the owner cannot lift it by confirming or
      // by a temporary permission.
      outcome = "REJECT";
      basis = "ACTION_CEILING";
      rules = [`ORG_ACTION_CEILING:${req}>${ceiling}`];
      orgBlocked = true;
      trace.push({
        step: "ACTION",
        action: "LOWERED",
        outcome,
        rules,
        note: `Requested ${req}; organization ceiling ${ceiling}.`,
      });
    } else if (outcome === "ALLOW" && escalated) {
      {
        outcome = "ASK";
        basis =
          source === "SENSITIVE_DOMAIN" ? "SENSITIVE_DOMAIN" : "ACTION_CEILING";
        rules = [`ACTION:${req}>${ceiling}`];
      }
      trace.push({
        step: "ACTION",
        action: "LOWERED",
        outcome,
        rules,
        note: `Requested ${req}; ceiling ${ceiling} (${source}).`,
      });
    } else
      trace.push({
        step: "ACTION",
        action: "KEPT",
        outcome,
        note: `Requested ${req ?? "unspecified"}; ceiling ${ceiling} (${source}).`,
      });
  }
  // 7. Temporary override (works with or without a published policy)
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
        !rule?.noOverride &&
        (outcome === "ASK" ||
          (outcome === "REJECT" &&
            culturalReject &&
            o.effect === "ALLOW_THROUGH_CULTURAL_REJECT")),
    )
    .sort((a, b) => a.overrideId.localeCompare(b.overrideId))[0];
  if (useful) {
    outcome = "ALLOW";
    basis = "USER_TEMPORARY_OVERRIDE";
    rules = ["OVERRIDE:" + useful.overrideId];
    trace.push({ step: "OVERRIDE", action: "RAISED", outcome, rules });
  } else if (matching.length && rule?.noOverride)
    trace.push({
      step: "OVERRIDE",
      action: "IGNORED",
      outcome,
      note: "This sensitive domain does not accept temporary overrides.",
    });
  else if (matching.length)
    trace.push({
      step: "OVERRIDE",
      action: "IGNORED",
      outcome,
      note: "A matching override does not apply to this outcome.",
    });
  if (wantsAction) {
    const req = i.requestedAction ?? null;
    // An owner override for this exact choice lets the requested action stand.
    const lifted = !!useful && escalated && !orgBlocked;
    actionTrace = {
      requested: req,
      ceiling,
      ceilingSource: source,
      escalationRequired: escalated,
      permitted: outcome === "ALLOW" ? upTo(lifted && req ? req : ceiling) : [],
    };
  }
  return done();
}
