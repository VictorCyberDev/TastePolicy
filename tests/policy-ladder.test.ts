// @vitest-environment node
import { it, expect } from "vitest";
import { syntheticReceipt } from "./receipt-presentation-fixture";
import { evaluateWithPolicy } from "@/lib/policy/engine";
import { classifyPolicyChange } from "@/lib/policy/composition";
import { policyDocument } from "@/lib/policy/validation";
import { classifyAsk } from "@/lib/lease/ask";
import {
  DEFAULT_POLICY,
  type SubjectiveAction,
  type OrganizationCeiling,
  type PolicyDocument,
  type PolicyOverride,
} from "@/lib/policy/types";
import type { Context, StateEntry, StateVersion } from "@/lib/state/types";

const now = "2026-10-20T12:00:00.000Z",
  old = "2026-01-01T00:00:00.000Z",
  allow = syntheticReceipt(0.9),
  candidate = allow.candidate,
  ctx: Context = { key: "trip", domain: "destination" };
const available = (r: typeof allow) => ({
  status: "available" as const,
  data: r,
});
const entry = (over: Partial<StateEntry>): StateEntry => ({
  signalId: crypto.randomUUID(),
  kind: "EXPLICIT_LIKE",
  scope: "GLOBAL_PREFERENCE",
  persistence: "DURABLE",
  source: "USER",
  sourceEventId: crypto.randomUUID(),
  createdAt: now,
  ...over,
});
const state = (...entries: StateEntry[]): StateVersion => ({
  profileId: crypto.randomUUID(),
  stateVersion: 1,
  parentVersion: null,
  createdAt: now,
  mutationId: null,
  stateHash: "t",
  entries,
});
const run = (
  s: StateVersion,
  o: {
    cultural?:
      | ReturnType<typeof available>
      | { status: "unavailable"; reason: "timeout" };
    policy?: PolicyDocument | null;
    overrides?: PolicyOverride[];
    context?: Context;
    agentId?: string;
    requestedAction?: SubjectiveAction;
    organization?: OrganizationCeiling | null;
  } = {},
) =>
  evaluateWithPolicy({
    state: s,
    candidate,
    context: o.context ?? ctx,
    cultural: o.cultural ?? available(allow),
    agentId: o.agentId ?? "agent-a",
    now,
    policy: o.policy === undefined ? null : o.policy,
    policyVersion: o.policy ? 1 : null,
    overrides: o.overrides ?? [],
    requestedAction: o.requestedAction,
    organization: o.organization,
  });
const policy = (p: Partial<PolicyDocument>): PolicyDocument => ({
  ...DEFAULT_POLICY,
  ...p,
});
const override = (
  scope: PolicyOverride["scope"],
  effect: PolicyOverride["effect"] = "ALLOW_THROUGH_ASK",
  extra: Partial<PolicyOverride> = {},
): PolicyOverride => ({
  overrideId: crypto.randomUUID(),
  effect,
  scope,
  createdAt: "2026-10-19T00:00:00.000Z",
  expiresAt: "2026-10-27T00:00:00.000Z",
  ...extra,
});

const ladder = (
  def: SubjectiveAction,
  extra: Partial<NonNullable<PolicyDocument["actions"]>> = {},
): PolicyDocument =>
  policy({ actions: { default: def, byDomain: {}, byAgent: {}, ...extra } });

it("a request above the owner's ceiling is ASK (authority confirmation); at or below stays ALLOW with the permitted rungs", () => {
  const p = ladder("SHORTLIST");
  const above = run(state(), { policy: p, requestedAction: "ADD_TO_DRAFT" });
  expect([above.outcome, above.basis, above.rules]).toEqual([
    "ASK",
    "ACTION_CEILING",
    ["ACTION:ADD_TO_DRAFT>SHORTLIST"],
  ]);
  expect(above.action).toMatchObject({
    requested: "ADD_TO_DRAFT",
    ceiling: "SHORTLIST",
    ceilingSource: "DEFAULT",
    escalationRequired: true,
    permitted: [],
  });
  expect(classifyAsk(above.basis, above.rules)).toBe("AUTHORITY_CONFIRMATION");
  const at = run(state(), { policy: p, requestedAction: "SHORTLIST" });
  expect(at.outcome).toBe("ALLOW");
  expect(at.action).toMatchObject({
    escalationRequired: false,
    permitted: ["SUGGEST", "RANK", "SHORTLIST"],
  });
  // base evaluator ALLOW became ASK only because of the ladder
  expect(above.baseOutcome).toBe("ALLOW");
});
it("the ceiling resolves agent over domain over default, and records the source", () => {
  const p = ladder("SUGGEST", {
    byDomain: { destination: "ADD_TO_DRAFT" },
    byAgent: { "agent-a": "PRESENT_AS_SELECTED" },
  });
  const r = (agentId: string, domain: "destination" | "place") =>
    run(state(), {
      policy: p,
      agentId,
      context: { key: "trip", domain },
      cultural: available(allow),
      requestedAction: "RANK",
    }).action;
  expect(r("agent-a", "destination")?.ceilingSource).toBe("AGENT");
  expect(r("agent-b", "destination")).toMatchObject({
    ceiling: "ADD_TO_DRAFT",
    ceilingSource: "DOMAIN",
  });
});
it("unconfigured ladder: legacy ceiling is ADD_TO_DRAFT, so PRESENT_AS_SELECTED asks while legacy requests are unchanged", () => {
  const legacy = run(state(), { policy: null });
  expect(legacy.action).toBeUndefined();
  expect(legacy.outcome).toBe("ALLOW");
  const top = run(state(), { requestedAction: "PRESENT_AS_SELECTED" });
  expect([top.outcome, top.basis]).toEqual(["ASK", "ACTION_CEILING"]);
  expect(run(state(), { requestedAction: "ADD_TO_DRAFT" }).outcome).toBe(
    "ALLOW",
  );
});
it("hard rules beat the ladder: a blocked choice stays REJECT whatever is requested", () => {
  const block = entry({
    kind: "CONSTRAINT",
    scope: "CANDIDATE_ONLY",
    candidateId: candidate.id,
    constraint: { kind: "EXCLUDE_CANDIDATE" },
  });
  const r = run(state(block), {
    policy: ladder("PRESENT_AS_SELECTED"),
    requestedAction: "PRESENT_AS_SELECTED",
  });
  expect([r.outcome, r.basis]).toEqual(["REJECT", "USER_HARD_BLOCK"]);
  expect(r.action?.permitted).toEqual([]);
  const unavailable = run(state(), {
    cultural: { status: "unavailable", reason: "timeout" },
    policy: ladder("PRESENT_AS_SELECTED"),
    requestedAction: "SUGGEST",
  });
  expect(unavailable.outcome).toBe("UNAVAILABLE");
});
it("a temporary override lets the exact requested action stand but never defeats a hard rule", () => {
  const o = override({ candidateId: candidate.id });
  const r = run(state(), {
    policy: ladder("SUGGEST"),
    requestedAction: "ADD_TO_DRAFT",
    overrides: [o],
  });
  expect([r.outcome, r.basis]).toEqual(["ALLOW", "USER_TEMPORARY_OVERRIDE"]);
  expect(r.action?.permitted).toEqual([
    "SUGGEST",
    "RANK",
    "SHORTLIST",
    "ADD_TO_DRAFT",
  ]);
  const price = entry({
    kind: "CONSTRAINT",
    constraint: { kind: "MAX_PRICE", amount: 50, currency: "USD" },
  });
  expect(
    run(state(price), {
      policy: ladder("SUGGEST"),
      requestedAction: "ADD_TO_DRAFT",
      overrides: [o],
      context: { ...ctx, price: { amount: 90, currency: "USD" } },
    }).basis,
  ).toBe("CONTEXT_CONSTRAINT");
});
it("sensitive domains: always ask is confirmable, fresh-evidence is a clarification, the cap lowers, noOverride holds", () => {
  const sens = (rule: object) =>
    policy({ sensitive: { destination: rule } as PolicyDocument["sensitive"] });
  const always = run(state(), { policy: sens({ alwaysAsk: true }) });
  expect([always.outcome, always.basis, always.rules]).toEqual([
    "ASK",
    "SENSITIVE_DOMAIN",
    ["SENSITIVE:ALWAYS_ASK"],
  ]);
  expect(classifyAsk(always.basis, always.rules)).toBe(
    "AUTHORITY_CONFIRMATION",
  );
  const stale = run(
    state(entry({ createdAt: old, scope: "GLOBAL_PREFERENCE" })),
    { policy: sens({ freshExplicitDays: 30 }) },
  );
  expect(stale.rules).toEqual(["SENSITIVE:FRESH_EXPLICIT_EVIDENCE_REQUIRED"]);
  expect(classifyAsk(stale.basis, stale.rules)).toBe("CLARIFICATION_REQUIRED");
  const fresh = run(state(entry({})), {
    policy: sens({ freshExplicitDays: 30 }),
  });
  expect(fresh.outcome).toBe("ALLOW");
  const capped = run(state(), {
    policy: policy({
      actions: { default: "PRESENT_AS_SELECTED", byDomain: {}, byAgent: {} },
      sensitive: { destination: { maxAction: "RANK" } },
    }),
    requestedAction: "SHORTLIST",
  });
  expect([capped.outcome, capped.basis, capped.action?.ceilingSource]).toEqual([
    "ASK",
    "SENSITIVE_DOMAIN",
    "SENSITIVE_DOMAIN",
  ]);
  const o = override({ candidateId: candidate.id });
  const held = run(state(), {
    policy: sens({ alwaysAsk: true, noOverride: true }),
    overrides: [o],
  });
  expect(held.outcome).toBe("ASK");
  expect(held.trace.at(-1)).toMatchObject({
    step: "OVERRIDE",
    action: "IGNORED",
  });
  expect(
    run(state(), { policy: sens({ alwaysAsk: true }), overrides: [o] }).outcome,
  ).toBe("ALLOW");
});
it("an organization ceiling can only lower: owner confirmation cannot lift it, and it never touches hard rules", () => {
  const org: OrganizationCeiling = {
    organizationId: "acme",
    maxAction: "SHORTLIST",
  };
  const r = run(state(), {
    policy: ladder("PRESENT_AS_SELECTED"),
    requestedAction: "ADD_TO_DRAFT",
    organization: org,
  });
  expect([r.outcome, r.basis, r.action?.ceilingSource]).toEqual([
    "REJECT",
    "ACTION_CEILING",
    "ORGANIZATION",
  ]);
  expect(r.rules[0]).toMatch(/^ORG_ACTION_CEILING:/);
  // an override cannot raise an organization REJECT
  expect(
    run(state(), {
      policy: ladder("PRESENT_AS_SELECTED"),
      requestedAction: "ADD_TO_DRAFT",
      organization: org,
      overrides: [override({ candidateId: candidate.id })],
    }).outcome,
  ).toBe("REJECT");
  // a lower subject ceiling stays lower: the organization never widens it
  expect(
    run(state(), {
      policy: ladder("SUGGEST"),
      requestedAction: "RANK",
      organization: org,
    }).action?.ceiling,
  ).toBe("SUGGEST");
});
it("policy validation: ladder and sensitive rules are additive and strictly validated; legacy documents are unchanged", () => {
  const legacy = {
    schemaVersion: "taste-policy-v1",
    freshness: {},
    autonomy: { default: "AUTONOMOUS", byDomain: {}, byAgent: {} },
  };
  expect(policyDocument(legacy)).toEqual(legacy);
  const full = policyDocument({
    ...legacy,
    actions: { default: "SHORTLIST", byDomain: { place: "RANK" }, byAgent: {} },
    sensitive: { place: { alwaysAsk: true, freshExplicitDays: 90 } },
  });
  expect(full.actions?.default).toBe("SHORTLIST");
  for (const bad of [
    { actions: { default: "BUY" } },
    { actions: { default: "RANK", byDomain: { movie: "RANK" } } },
    { sensitive: { place: { maxAction: "pay" } } },
    { sensitive: { place: { freshExplicitDays: 0 } } },
    { sensitive: { place: { surprise: true } } },
    { actions: { default: "RANK", extra: 1 } },
  ])
    expect(() => policyDocument({ ...legacy, ...bad })).toThrow();
});
it("classifier: raising a ceiling or dropping a sensitive protection widens authority; lowering tightens; unchanged legacy is NONE", () => {
  const base = ladder("SHORTLIST");
  expect(classifyPolicyChange(base, ladder("PRESENT_AS_SELECTED"))).toBe(
    "LOOSEN",
  );
  expect(classifyPolicyChange(base, ladder("RANK"))).toBe("TIGHTEN");
  expect(classifyPolicyChange(null, policy({}))).toBe("NONE");
  expect(classifyPolicyChange(null, ladder("SUGGEST"))).toBe("TIGHTEN");
  expect(classifyPolicyChange(null, ladder("PRESENT_AS_SELECTED"))).toBe(
    "LOOSEN",
  );
  const guarded = policy({
    sensitive: { destination: { alwaysAsk: true, noOverride: true } },
  });
  expect(classifyPolicyChange(guarded, policy({}))).toBe("LOOSEN");
  expect(classifyPolicyChange(policy({}), guarded)).toBe("TIGHTEN");
  expect(
    classifyPolicyChange(
      policy({ sensitive: { destination: { maxAction: "RANK" } } }),
      policy({ sensitive: { destination: { maxAction: "ADD_TO_DRAFT" } } }),
    ),
  ).toBe("LOOSEN");
});
