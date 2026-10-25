import { platformFail as fail } from "@/lib/platform/types";
import {
  AUTONOMY_LEVELS,
  FRESHNESS_CLASSES,
  OVERRIDE_EFFECTS,
  POLICY_SCHEMA,
  SUBJECTIVE_ACTIONS,
  type SensitiveRules,
  type SubjectiveAction,
  type AutonomyLevel,
  type OverrideEffect,
  type PolicyDocument,
} from "./types";
import type { TargetType } from "@/types/domain";

const DOMAINS: TargetType[] = ["brand", "destination", "place"];
const AGENT = /^[a-zA-Z0-9_-]{1,64}$/;
function plain(v: unknown, allowed: string[]): Record<string, unknown> {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !allowed.includes(k))
  )
    fail("INVALID_INPUT");
  return v as Record<string, unknown>;
}
function level(v: unknown): AutonomyLevel {
  if (!AUTONOMY_LEVELS.includes(v as AutonomyLevel)) fail("INVALID_INPUT");
  return v as AutonomyLevel;
}
export function subjectiveAction(v: unknown): SubjectiveAction {
  if (!SUBJECTIVE_ACTIONS.includes(v as SubjectiveAction))
    fail("INVALID_INPUT");
  return v as SubjectiveAction;
}
function actionCeilings(raw: unknown): PolicyDocument["actions"] {
  const a = plain(raw, ["default", "byDomain", "byAgent"]),
    byDomain: NonNullable<PolicyDocument["actions"]>["byDomain"] = {},
    byAgent: NonNullable<PolicyDocument["actions"]>["byAgent"] = {};
  for (const [k, l] of Object.entries(plain(a.byDomain ?? {}, DOMAINS)))
    byDomain[k as TargetType] = subjectiveAction(l);
  const agents = Object.entries(
    plain(a.byAgent ?? {}, Object.keys((a.byAgent as object) ?? {})),
  );
  if (agents.length > 20) fail("INVALID_INPUT");
  for (const [k, l] of agents) {
    if (!AGENT.test(k)) fail("INVALID_INPUT");
    byAgent[k] = subjectiveAction(l);
  }
  return { default: subjectiveAction(a.default), byDomain, byAgent };
}
function sensitiveRules(raw: unknown): SensitiveRules {
  const out: SensitiveRules = {};
  for (const [k, r] of Object.entries(plain(raw, DOMAINS))) {
    const x = plain(r, [
      "alwaysAsk",
      "maxAction",
      "freshExplicitDays",
      "noOverride",
    ]);
    for (const f of ["alwaysAsk", "noOverride"])
      if (x[f] !== undefined && typeof x[f] !== "boolean")
        fail("INVALID_INPUT");
    const rule: SensitiveRules[TargetType] = {};
    if (x.alwaysAsk !== undefined) rule.alwaysAsk = x.alwaysAsk as boolean;
    if (x.noOverride !== undefined) rule.noOverride = x.noOverride as boolean;
    if (x.maxAction !== undefined)
      rule.maxAction = subjectiveAction(x.maxAction);
    if (x.freshExplicitDays !== undefined) {
      const d = x.freshExplicitDays;
      if (!Number.isInteger(d) || (d as number) < 1 || (d as number) > 3650)
        fail("INVALID_INPUT");
      rule.freshExplicitDays = d as number;
    }
    out[k as TargetType] = rule;
  }
  return out;
}
export function policyDocument(raw: unknown): PolicyDocument {
  const v = plain(raw, [
    "schemaVersion",
    "freshness",
    "autonomy",
    "actions",
    "sensitive",
  ]);
  if (v.schemaVersion !== POLICY_SCHEMA) fail("INVALID_INPUT");
  const f = plain(v.freshness ?? {}, [...FRESHNESS_CLASSES]),
    freshness: PolicyDocument["freshness"] = {};
  for (const [k, d] of Object.entries(f)) {
    if (!Number.isInteger(d) || (d as number) < 1 || (d as number) > 3650)
      fail("INVALID_INPUT");
    freshness[k as keyof typeof freshness] = d as number;
  }
  const a = plain(v.autonomy, ["default", "byDomain", "byAgent", "limit"]),
    byDomain: PolicyDocument["autonomy"]["byDomain"] = {},
    byAgent: PolicyDocument["autonomy"]["byAgent"] = {};
  for (const [k, l] of Object.entries(plain(a.byDomain ?? {}, DOMAINS)))
    byDomain[k as TargetType] = level(l);
  const agents = Object.entries(
    a.byAgent && typeof a.byAgent === "object" && !Array.isArray(a.byAgent)
      ? a.byAgent
      : a.byAgent === undefined
        ? {}
        : fail("INVALID_INPUT"),
  );
  if (agents.length > 20) fail("INVALID_INPUT");
  for (const [k, l] of agents) {
    if (!AGENT.test(k)) fail("INVALID_INPUT");
    byAgent[k] = level(l);
  }
  const doc: PolicyDocument = {
    schemaVersion: POLICY_SCHEMA,
    freshness,
    autonomy: { default: level(a.default), byDomain, byAgent },
  };
  if (a.limit !== undefined) {
    const l = plain(a.limit, ["amount", "currency"]);
    if (
      typeof l.amount !== "number" ||
      !Number.isFinite(l.amount) ||
      l.amount <= 0 ||
      l.amount > 10_000_000 ||
      typeof l.currency !== "string" ||
      !/^[A-Z]{3}$/.test(l.currency)
    )
      fail("INVALID_INPUT");
    doc.autonomy.limit = { amount: l.amount, currency: l.currency };
  }
  const usesLimit = [
    doc.autonomy.default,
    ...Object.values(byDomain),
    ...Object.values(byAgent),
  ].includes("CONFIRM_ABOVE_LIMIT");
  if (usesLimit && !doc.autonomy.limit) fail("INVALID_INPUT");
  // Additive and optional: a document without them keeps the legacy contract.
  if (v.actions !== undefined) doc.actions = actionCeilings(v.actions);
  if (v.sensitive !== undefined) doc.sensitive = sensitiveRules(v.sensitive);
  return doc;
}
export interface OverrideRequest {
  effect: OverrideEffect;
  scope: {
    candidateId?: string;
    contextKey?: string;
    domain?: TargetType;
    agentId?: string;
  };
  days: number;
  confirmCulturalReject: boolean;
}
export function overrideRequest(raw: unknown): OverrideRequest {
  const v = plain(raw, [
    "idempotencyKey",
    "passportRef",
    "effect",
    "scope",
    "days",
    "confirmCulturalReject",
  ]);
  if (!OVERRIDE_EFFECTS.includes(v.effect as OverrideEffect))
    fail("INVALID_INPUT");
  const s = plain(v.scope, ["candidateId", "contextKey", "domain", "agentId"]);
  const scope: OverrideRequest["scope"] = {};
  if (s.candidateId !== undefined) {
    if (
      typeof s.candidateId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(s.candidateId)
    )
      fail("INVALID_INPUT");
    scope.candidateId = s.candidateId;
  }
  if (s.contextKey !== undefined) {
    if (typeof s.contextKey !== "string" || !AGENT.test(s.contextKey))
      fail("INVALID_INPUT");
    scope.contextKey = s.contextKey;
  }
  if (s.domain !== undefined) {
    if (!DOMAINS.includes(s.domain as TargetType)) fail("INVALID_INPUT");
    scope.domain = s.domain as TargetType;
  }
  if (s.agentId !== undefined) {
    if (typeof s.agentId !== "string" || !AGENT.test(s.agentId))
      fail("INVALID_INPUT");
    scope.agentId = s.agentId;
  }
  // An override must name what it is about; an agent alone is not a scope.
  if (!scope.candidateId && !scope.contextKey && !scope.domain)
    fail("INVALID_INPUT");
  const days = v.days ?? 7;
  if (!Number.isInteger(days) || (days as number) < 1 || (days as number) > 30)
    fail("INVALID_INPUT");
  if (
    v.confirmCulturalReject !== undefined &&
    typeof v.confirmCulturalReject !== "boolean"
  )
    fail("INVALID_INPUT");
  const confirm = v.confirmCulturalReject === true;
  if (v.effect === "ALLOW_THROUGH_CULTURAL_REJECT" && !confirm)
    fail("INVALID_INPUT");
  // The broad cultural-reject override must be narrow: a candidate, never a whole domain.
  if (v.effect === "ALLOW_THROUGH_CULTURAL_REJECT" && !scope.candidateId)
    fail("INVALID_INPUT");
  return {
    effect: v.effect as OverrideEffect,
    scope,
    days: days as number,
    confirmCulturalReject: confirm,
  };
}
