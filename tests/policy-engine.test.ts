// @vitest-environment node
import { it, expect } from "vitest";
import { syntheticReceipt } from "./receipt-presentation-fixture";
import { stateDecision } from "@/server/state/policy";
import { evaluateWithPolicy, evidenceClass } from "@/lib/policy/engine";
import { counterfactuals, impactAnalysis } from "@/lib/policy/analysis";
import {
  DEFAULT_POLICY,
  type PolicyDocument,
  type PolicyOverride,
} from "@/lib/policy/types";
import type { Context, StateEntry, StateVersion } from "@/lib/state/types";

const now = "2026-10-20T12:00:00.000Z",
  old = "2026-01-01T00:00:00.000Z",
  allow = syntheticReceipt(0.9),
  reject = syntheticReceipt(0.2),
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

it("classifies every state entry kind", () => {
  expect(
    (
      [
        ["CONSTRAINT", "HARD_CONSTRAINT"],
        ["DURABLE_FEEDBACK", "EXPLICIT_NEGATIVE"],
        ["EXPLICIT_LIKE", "EXPLICIT_POSITIVE"],
        ["CONTEXTUAL_PREFERENCE", "CONTEXTUAL"],
        ["EXPLORATION_INTENT", "EXPLORATION"],
      ] as const
    ).every(([kind, cls]) => evidenceClass(entry({ kind })) === cls),
  ).toBe(true);
});
it("with no policy and no override the decision is exactly the base evaluator's", () => {
  for (const cultural of [
    available(allow),
    available(reject),
    { status: "unavailable" as const, reason: "timeout" as const },
  ]) {
    const s = state(entry({}));
    const r = run(s, { cultural });
    const base = stateDecision(s, candidate, ctx, cultural, now);
    expect([r.outcome, r.basis, r.rules]).toEqual([
      base.outcome,
      base.basis,
      base.rules,
    ]);
    expect(r.policyVersion).toBeNull();
  }
});
it("freshness lowers only ALLOW, names the stale class, and ignores empty classes", () => {
  const p = policy({ freshness: { EXPLICIT_POSITIVE: 90, CONTEXTUAL: 30 } });
  const stale = run(state(entry({ createdAt: old })), { policy: p });
  expect([stale.outcome, stale.basis, stale.rules]).toEqual([
    "ASK",
    "STALE_EVIDENCE",
    ["STALE:EXPLICIT_POSITIVE"],
  ]);
  expect(run(state(entry({ createdAt: now })), { policy: p }).outcome).toBe(
    "ALLOW",
  );
  expect(
    run(state(entry({ createdAt: old })), {
      policy: p,
      cultural: available(reject),
    }).outcome,
  ).toBe("REJECT");
  expect(run(state(), { policy: p }).outcome).toBe("ALLOW"); // no entries of a class, no staleness
});
it("autonomy ceiling: OBSERVE always asks; CONFIRM_ABOVE_LIMIT compares price; agent beats domain beats default", () => {
  const s = state(entry({}));
  const obs = policy({
    autonomy: { default: "OBSERVE", byDomain: {}, byAgent: {} },
  });
  expect(run(s, { policy: obs }).basis).toBe("AUTONOMY_CEILING");
  const lim = policy({
    autonomy: {
      default: "CONFIRM_ABOVE_LIMIT",
      byDomain: {},
      byAgent: {},
      limit: { amount: 100, currency: "USD" },
    },
  });
  const priced = (amount: number, currency = "USD"): Context => ({
    ...ctx,
    price: { amount, currency },
  });
  expect(run(s, { policy: lim, context: priced(80) }).outcome).toBe("ALLOW");
  expect(run(s, { policy: lim, context: priced(120) }).rules).toEqual([
    "AUTONOMY:ABOVE_LIMIT",
  ]);
  expect(run(s, { policy: lim }).rules).toEqual(["AUTONOMY:PRICE_UNKNOWN"]);
  expect(run(s, { policy: lim, context: priced(10, "EUR") }).rules).toEqual([
    "AUTONOMY:PRICE_UNKNOWN",
  ]);
  const layered = policy({
    autonomy: {
      default: "OBSERVE",
      byDomain: { destination: "CONFIRM_ABOVE_LIMIT" },
      byAgent: { trusted: "AUTONOMOUS" },
      limit: { amount: 100, currency: "USD" },
    },
  });
  expect(run(s, { policy: layered, agentId: "trusted" }).outcome).toBe("ALLOW");
  expect(run(s, { policy: layered, agentId: "other" }).rules).toEqual([
    "AUTONOMY:PRICE_UNKNOWN",
  ]);
});
it("an override raises ASK to ALLOW only when active and in scope", () => {
  const s = state(entry({})),
    obs = policy({
      autonomy: { default: "OBSERVE", byDomain: {}, byAgent: {} },
    });
  const mine = override({ candidateId: candidate.id });
  expect(run(s, { policy: obs, overrides: [mine] })).toMatchObject({
    outcome: "ALLOW",
    basis: "USER_TEMPORARY_OVERRIDE",
  });
  for (const o of [
    override({ candidateId: "someone-else" }),
    override({ candidateId: candidate.id, agentId: "agent-b" }),
    override({ candidateId: candidate.id }, "ALLOW_THROUGH_ASK", {
      revokedAt: "2026-10-19T01:00:00.000Z",
    }),
    override({ candidateId: candidate.id }, "ALLOW_THROUGH_ASK", {
      expiresAt: "2026-10-20T11:59:59.000Z",
    }),
    override({ candidateId: candidate.id }, "ALLOW_THROUGH_ASK", {
      createdAt: "2026-10-21T00:00:00.000Z",
    }),
  ])
    expect(run(s, { policy: obs, overrides: [o] }).outcome).toBe("ASK");
});
it("a cultural REJECT needs the explicit override effect; ASK-only overrides do not reach it", () => {
  const s = state(entry({}));
  const soft = override({ candidateId: candidate.id });
  expect(
    run(s, { cultural: available(reject), overrides: [soft] }).outcome,
  ).toBe("REJECT");
  const hardOverride = override(
    { candidateId: candidate.id },
    "ALLOW_THROUGH_CULTURAL_REJECT",
  );
  expect(
    run(s, { cultural: available(reject), overrides: [hardOverride] }),
  ).toMatchObject({ outcome: "ALLOW", basis: "USER_TEMPORARY_OVERRIDE" });
});
it("hard rules and missing evidence are final: no override, autonomy or freshness changes them, and the ignored override is reported", () => {
  const block = entry({
    kind: "CONSTRAINT",
    scope: "CANDIDATE_ONLY",
    candidateId: candidate.id,
    constraint: { kind: "EXCLUDE_CANDIDATE" },
  });
  const o = override(
    { candidateId: candidate.id },
    "ALLOW_THROUGH_CULTURAL_REJECT",
  );
  const r = run(state(block), { overrides: [o], policy: policy({}) });
  expect([r.outcome, r.basis]).toEqual(["REJECT", "USER_HARD_BLOCK"]);
  expect(
    r.trace.some((t) => t.step === "OVERRIDE" && t.action === "IGNORED"),
  ).toBe(true);
  const price = entry({
    kind: "CONSTRAINT",
    constraint: { kind: "MAX_PRICE", amount: 50, currency: "USD" },
  });
  expect(
    run(state(price), {
      context: { ...ctx, price: { amount: 90, currency: "USD" } },
      overrides: [o],
    }).basis,
  ).toBe("CONTEXT_CONSTRAINT");
  const unavailable = {
    status: "unavailable" as const,
    reason: "timeout" as const,
  };
  const u = run(state(entry({})), { cultural: unavailable, overrides: [o] });
  expect([u.outcome, u.basis]).toEqual([
    "UNAVAILABLE",
    "REQUIRED_EVIDENCE_MISSING",
  ]);
});
it("is deterministic: same inputs, same decision and trace; order of overrides does not matter", () => {
  const s = state(entry({})),
    obs = policy({
      autonomy: { default: "OBSERVE", byDomain: {}, byAgent: {} },
    });
  const a = override({ candidateId: candidate.id }),
    b = override({ domain: "destination" });
  const x = run(s, { policy: obs, overrides: [a, b] }),
    y = run(s, { policy: obs, overrides: [b, a] });
  expect(x).toEqual(y);
});
it("counterfactuals list only verified single changes and mark them user actions", () => {
  const s = state(entry({ createdAt: old })),
    p = policy({
      freshness: { EXPLICIT_POSITIVE: 30 },
      autonomy: { default: "OBSERVE", byDomain: {}, byAgent: {} },
    });
  const input = {
    state: s,
    candidate,
    context: ctx,
    cultural: available(allow),
    agentId: "a",
    now,
    policy: p,
    policyVersion: 1,
    overrides: [],
  };
  const cf = counterfactuals(input, now);
  // Stale AND observe-only: raising autonomy alone would not flip it, so it is not offered.
  expect(cf.map((c) => c.change)).toEqual(["OVERRIDE_THIS_CANDIDATE"]);
  const observeOnly = counterfactuals(
    { ...input, state: state(entry({})) },
    now,
  );
  expect(observeOnly.map((c) => c.change).sort()).toEqual(
    ["OVERRIDE_THIS_CANDIDATE", "RAISE_AUTONOMY"].sort(),
  );
  expect(cf.every((c) => c.userAction && c.resultOutcome === "ALLOW")).toBe(
    true,
  );
  const block = entry({
    kind: "CONSTRAINT",
    scope: "CANDIDATE_ONLY",
    candidateId: candidate.id,
    constraint: { kind: "EXCLUDE_CANDIDATE" },
  });
  const blocked = counterfactuals(
    { ...input, state: state(block, entry({})) },
    now,
  );
  expect(blocked.map((c) => c.change)).toEqual(["REMOVE_ENTRY"]);
});
it("impact analysis counts transitions between the current and a draft policy", () => {
  const s = state(entry({ createdAt: old })),
    base = {
      state: s,
      candidate,
      context: ctx,
      cultural: available(allow),
      agentId: "a",
      now,
      policy: null,
      policyVersion: null,
      overrides: [],
    };
  const items = [
    { ref: "e1", input: base },
    { ref: "e2", input: { ...base, cultural: available(reject) } },
  ];
  const draft = policy({ freshness: { EXPLICIT_POSITIVE: 30 } });
  const r = impactAnalysis(items, draft);
  expect(r).toMatchObject({
    total: 2,
    changed: 1,
    transitions: { "ALLOW->ASK": 1 },
  });
  expect(r.examples).toEqual([
    { ref: "e1", from: "ALLOW", to: "ASK", basis: "STALE_EVIDENCE" },
  ]);
  expect(impactAnalysis(items, null).changed).toBe(0);
});
