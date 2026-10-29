// @vitest-environment node
import { it, expect, describe } from "vitest";
import { syntheticReceipt } from "./receipt-presentation-fixture";
import { evaluateWithPolicy } from "@/lib/policy/engine";
import { evaluateRequirements } from "@/lib/requirements/evaluate";
import { parseFacts, parseRequirements } from "@/lib/requirements/validate";
import { DEFAULT_POLICY, type SubjectiveAction } from "@/lib/policy/types";
import { evaluationInput } from "@/server/state/validation";
import {
  splitSessionAuthority,
  sessionAuthority,
} from "@/server/state/session-authority";
import { contextMaterial, commitContext } from "@/lib/commit/commitments";
import type { CandidateFact, Requirement } from "@/lib/requirements/types";
import type { Context, StateVersion } from "@/lib/state/types";

const now = "2026-10-20T12:00:00.000Z";
const strong = syntheticReceipt(0.9);
const candidate = strong.candidate;
const cultural = { status: "available" as const, data: strong };
const unavailableCultural = {
  status: "unavailable" as const,
  reason: "timeout" as const,
};
const state = (): StateVersion => ({
  profileId: crypto.randomUUID(),
  stateVersion: 1,
  parentVersion: null,
  createdAt: now,
  mutationId: null,
  stateHash: "t",
  entries: [],
});

const stepFree: Requirement = {
  key: "step_free_access",
  operator: "eq",
  expected: true,
  importance: "hard",
  sourceRequirement: "USER",
};
const walking: Requirement = {
  key: "walking_minutes",
  operator: "lte",
  expected: 10,
  importance: "hard",
  sourceRequirement: "USER",
  unit: "min",
};
const quiet: Requirement = {
  key: "noise_level",
  operator: "in",
  expected: ["low", "moderate"],
  importance: "soft",
  sourceRequirement: "USER",
};
const fact = (over: Partial<CandidateFact>): CandidateFact => ({
  key: "step_free_access",
  value: true,
  state: "known",
  evidence: "VERIFIED",
  source: "place-provider",
  sourceType: "PLACE_PROVIDER",
  observedAt: now,
  ...over,
});
const decide = (
  context: Partial<Context>,
  c: typeof cultural | typeof unavailableCultural = cultural,
  action?: { requested: SubjectiveAction; ceiling: SubjectiveAction },
) =>
  evaluateWithPolicy({
    state: state(),
    candidate,
    context: { key: "evening", domain: "place", ...context },
    cultural: c,
    agentId: "agent",
    now,
    policy: action
      ? {
          ...DEFAULT_POLICY,
          actions: { default: action.ceiling, byDomain: {}, byAgent: {} },
        }
      : null,
    policyVersion: null,
    overrides: [],
    requestedAction: action?.requested,
  });

describe("requirement evaluation", () => {
  it("satisfies, violates and leaves unknown facts unknown", () => {
    const r = evaluateRequirements(
      [stepFree, walking, quiet],
      [fact({}), fact({ key: "walking_minutes", value: 14, unit: "min" })],
      now,
    );
    expect(r.results.map((x) => x.status)).toEqual([
      "SATISFIED",
      "VIOLATED",
      "UNKNOWN",
    ]);
    expect(r.hardViolated).toEqual(["walking_minutes"]);
    expect(r.hardUnknown).toEqual([]);
  });
  it("never lets an inferred, unknown or stale fact satisfy a hard rule", () => {
    const stale = { ...stepFree, maxFactAgeDays: 30 };
    expect(
      evaluateRequirements([stepFree], [fact({ evidence: "INFERRED" })], now)
        .results[0],
    ).toMatchObject({ status: "UNKNOWN", reason: "INFERRED_ONLY" });
    expect(
      evaluateRequirements(
        [stepFree],
        [fact({ state: "unknown", value: null })],
        now,
      ).results[0],
    ).toMatchObject({ status: "UNKNOWN", reason: "FACT_UNKNOWN" });
    expect(
      evaluateRequirements(
        [stale],
        [fact({ observedAt: "2026-01-01T00:00:00.000Z" })],
        now,
      ).results[0],
    ).toMatchObject({ status: "UNKNOWN", reason: "STALE" });
    expect(
      evaluateRequirements([stale], [fact({ observedAt: undefined })], now)
        .results[0].status,
    ).toBe("UNKNOWN");
  });
  it("treats disagreeing decisive sources as unresolved, not as a guess", () => {
    const r = evaluateRequirements(
      [stepFree],
      [
        fact({}),
        fact({ value: false, evidence: "USER_CONFIRMED", sourceType: "USER" }),
      ],
      now,
    );
    expect(r.results[0]).toMatchObject({
      status: "UNKNOWN",
      reason: "CONFLICT",
    });
  });
  it("reports a wrong-typed fact as unresolved", () => {
    expect(
      evaluateRequirements(
        [walking],
        [fact({ key: "walking_minutes", value: "far" })],
        now,
      ).results[0].reason,
    ).toBe("TYPE_MISMATCH");
  });
  it("reads a price requirement from the quoted context price", () => {
    const price: Requirement = {
      key: "price",
      operator: "lte",
      expected: 75,
      importance: "hard",
      sourceRequirement: "USER",
    };
    expect(
      decide({ requirements: [price], price: { amount: 90, currency: "USD" } })
        .outcome,
    ).toBe("REJECT");
    expect(
      decide({ requirements: [price], price: { amount: 60, currency: "USD" } })
        .outcome,
    ).toBe("ALLOW");
    expect(decide({ requirements: [price] }).outcome).toBe("ASK");
  });
});

describe("M24 acceptance scenarios (deterministic decision semantics)", () => {
  const reqs = [stepFree, walking, quiet];
  const known = [
    fact({}),
    fact({ key: "walking_minutes", value: 8, unit: "min" }),
  ];
  it("A · strong taste + requirements satisfied → ALLOW", () => {
    const d = decide({ requirements: reqs, facts: known });
    expect(d.outcome).toBe("ALLOW");
    expect(d.basis).toBe("CULTURAL_PLUS_CONTEXT");
  });
  it("B · strong taste + critical fact unknown → ASK", () => {
    const d = decide({ requirements: reqs, facts: [known[1]] });
    expect(d).toMatchObject({ outcome: "ASK", basis: "UNRESOLVED_CONTEXT" });
    expect(d.rules).toEqual(["REQUIRED_FACT:step_free_access"]);
  });
  it("C · strong taste + hard requirement violated → REJECT", () => {
    const d = decide({
      requirements: reqs,
      facts: [fact({ value: false }), known[1]],
    });
    expect(d).toMatchObject({ outcome: "REJECT", basis: "CONTEXT_CONSTRAINT" });
    expect(d.rules).toEqual(["REQUIREMENT_VIOLATION:step_free_access"]);
  });
  it("C′ · a violation is final even when Qloo is unavailable", () => {
    const d = decide(
      { requirements: reqs, facts: [fact({ value: false }), known[1]] },
      unavailableCultural,
    );
    expect(d.outcome).toBe("REJECT");
  });
  it("D · required provider evidence unavailable → UNAVAILABLE", () => {
    const d = decide({
      requirements: reqs,
      facts: [
        fact({ state: "unavailable", value: null, evidence: "VERIFIED" }),
        known[1],
      ],
    });
    expect(d).toMatchObject({
      outcome: "UNAVAILABLE",
      basis: "REQUIRED_EVIDENCE_MISSING",
    });
    expect(d.rules).toEqual([
      "REQUIREMENT_EVIDENCE_UNAVAILABLE:step_free_access",
    ]);
  });
  it("D′ · unavailable Qloo evidence is still UNAVAILABLE, not a rejection", () => {
    expect(
      decide({ requirements: reqs, facts: known }, unavailableCultural).outcome,
    ).toBe("UNAVAILABLE");
  });
  it("E · appropriate recommendation above the action ceiling → ASK", () => {
    const d = decide({ requirements: reqs, facts: known }, cultural, {
      requested: "PRESENT_AS_SELECTED",
      ceiling: "SHORTLIST",
    });
    expect(d).toMatchObject({ outcome: "ASK", basis: "ACTION_CEILING" });
    expect(d.action?.escalationRequired).toBe(true);
    expect(d.action?.permitted).toEqual([]);
  });
  it("E′ · the same choice within the ceiling → ALLOW SHORTLIST", () => {
    const d = decide({ requirements: reqs, facts: known }, cultural, {
      requested: "SHORTLIST",
      ceiling: "SHORTLIST",
    });
    expect(d.outcome).toBe("ALLOW");
    expect(d.action?.permitted).toEqual(["SUGGEST", "RANK", "SHORTLIST"]);
  });
  it("a soft requirement never changes the outcome", () => {
    expect(
      decide({
        requirements: [quiet],
        facts: [fact({ key: "noise_level", value: "loud" })],
      }).outcome,
    ).toBe("ALLOW");
  });
  it("legacy contexts decide exactly as before", () => {
    expect(decide({}).outcome).toBe("ALLOW");
    expect(decide({}).basis).toBe("CULTURAL_POLICY");
  });
  it("does not mistake an ASK for approval: answering adds a user-confirmed fact", () => {
    const answered = [
      known[1],
      fact({
        evidence: "USER_CONFIRMED",
        sourceType: "USER",
        source: "margaret-answer",
      }),
    ];
    expect(decide({ requirements: reqs, facts: answered }).outcome).toBe(
      "ALLOW",
    );
  });
});

describe("boundary validation", () => {
  it("parses well-formed requirements and refuses malformed ones", () => {
    expect(parseRequirements([stepFree, walking, quiet])).toHaveLength(3);
    for (const bad of [
      [{ ...walking, operator: "near" }],
      [{ ...walking, expected: "ten" }],
      [{ ...quiet, expected: [] }],
      [{ ...stepFree, key: "Step Free" }],
      [{ ...stepFree, extra: 1 }],
      "nope",
    ])
      expect(parseRequirements(bad)).toBeNull();
  });
  it("refuses Qloo as the source of a place fact and malformed known facts", () => {
    expect(parseFacts([fact({})])).toHaveLength(1);
    expect(parseFacts([fact({ source: "Qloo" })])).toBeNull();
    expect(parseFacts([fact({ sourceType: "QLOO" as never })])).toBeNull();
    expect(parseFacts([fact({ state: "known", value: null })])).toBeNull();
    expect(parseFacts([fact({ state: "unknown", value: true })])).toBeNull();
  });
  it("accepts requirements through the evaluation boundary and drops nothing", () => {
    const body = {
      agentId: "agent",
      expectedStateVersion: 1,
      candidate: { ...candidate, type: "place" },
      context: {
        key: "evening",
        domain: "place",
        requirements: [stepFree],
        facts: [fact({})],
      },
    };
    const parsed = evaluationInput(body);
    expect(parsed?.context.requirements).toHaveLength(1);
    expect(parsed?.context.facts).toHaveLength(1);
    expect(
      evaluationInput({
        ...body,
        context: { ...body.context, requirements: [{ nope: 1 }] },
      }),
    ).toBeNull();
  });
  it("commits requirements and facts so a changed fact is drift", () => {
    const base = { key: "evening", domain: "place" };
    const a = commitContext(contextMaterial(base)!);
    const b = commitContext(
      contextMaterial({
        ...base,
        requirements: [stepFree],
        facts: [fact({})],
      })!,
    );
    const c = commitContext(
      contextMaterial({
        ...base,
        requirements: [stepFree],
        facts: [fact({ value: false })],
      })!,
    );
    // Presentation fields and timestamps are not material.
    const d = commitContext(
      contextMaterial({
        ...base,
        requirements: [{ ...stepFree, label: "Step-free entrance" }],
        facts: [fact({ observedAt: "2026-10-21T00:00:00.000Z", note: "x" })],
      })!,
    );
    expect(new Set([a, b, c]).size).toBe(3);
    expect(d).toBe(b);
  });
});

describe("session authority (anonymous demo)", () => {
  it("rejects a malformed or self-widening authority block", () => {
    expect(
      splitSessionAuthority({ sessionAuthority: { ceiling: "SHORTLIST" } })
        .authority,
    ).toBe("INVALID");
    expect(
      splitSessionAuthority({
        sessionAuthority: {
          ceiling: "SHORTLIST",
          requestedAction: "RANK",
          extra: 1,
        },
      }).authority,
    ).toBe("INVALID");
    expect(splitSessionAuthority({ a: 1 }).authority).toBeNull();
  });
  it("runs the real engine against the person's chosen ceiling", () => {
    const evaluation = {
      action: { kind: "SELECT_ENTITY", candidate },
      context: { key: "evening", domain: "place" },
      cultural,
      agentId: "agent",
    } as never;
    const over = sessionAuthority(
      state(),
      evaluation,
      { requestedAction: "PRESENT_AS_SELECTED", ceiling: "SHORTLIST" },
      now,
    );
    expect(over).toMatchObject({
      outcome: "ASK",
      basis: "ACTION_CEILING",
      escalationRequired: true,
      permitted: [],
    });
    const within = sessionAuthority(
      state(),
      evaluation,
      { requestedAction: "SHORTLIST", ceiling: "SHORTLIST" },
      now,
    );
    expect(within.outcome).toBe("ALLOW");
    expect(within.permitted).toEqual(["SUGGEST", "RANK", "SHORTLIST"]);
  });
});
