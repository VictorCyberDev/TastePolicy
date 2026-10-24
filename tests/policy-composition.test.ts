// @vitest-environment node
import { it, expect } from "vitest";
import { syntheticReceipt } from "./receipt-presentation-fixture";
import {
  composeGroup,
  classifyPolicyChange,
  mayDo,
  type GroupMemberInput,
} from "@/lib/policy/composition";
import { groupPolicy } from "@/server/subjects/policy";
import {
  DEFAULT_POLICY,
  type PolicyDocument,
  type PolicyOverride,
} from "@/lib/policy/types";
import type { Context, StateEntry, StateVersion } from "@/lib/state/types";

const now = "2026-10-20T12:00:00.000Z",
  allow = syntheticReceipt(0.9),
  candidate = allow.candidate,
  ctx: Context = { key: "trip", domain: "destination" };
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
const policy = (p: Partial<PolicyDocument>): PolicyDocument => ({
  ...DEFAULT_POLICY,
  ...p,
});
const member = (
  subjectId: string,
  o: {
    kind?: "SELF" | "PROXY";
    state?: StateVersion;
    policy?: PolicyDocument | null;
    overrides?: PolicyOverride[];
    cultural?: ReturnType<typeof syntheticReceipt>;
  } = {},
): GroupMemberInput => ({
  subjectId,
  kind: o.kind ?? "SELF",
  input: {
    state: o.state ?? state(),
    candidate,
    context: ctx,
    cultural: { status: "available", data: o.cultural ?? allow },
    agentId: "agent-a",
    now,
    policy: o.policy === undefined ? null : o.policy,
    policyVersion: o.policy ? 1 : null,
    overrides: o.overrides ?? [],
  },
});
const observe = policy({
  autonomy: { default: "OBSERVE", byDomain: {}, byAgent: {} },
});
const veto = state(
  entry({
    kind: "DURABLE_FEEDBACK",
    scope: "CANDIDATE_ONLY",
    candidateId: candidate.id,
    constraint: { kind: "EXCLUDE_CANDIDATE" },
  }),
);
const grant = (extra: Partial<PolicyOverride> = {}): PolicyOverride => ({
  overrideId: crypto.randomUUID(),
  effect: "ALLOW_THROUGH_ASK",
  scope: {},
  createdAt: "2026-10-19T00:00:00.000Z",
  expiresAt: "2026-10-27T00:00:00.000Z",
  ...extra,
});

it("no second group engine: the composed aggregate equals the M5 rule over final member decisions", () => {
  const g = composeGroup([
    member("a"),
    member("b", { policy: observe }),
    member("c", { state: veto }),
  ]);
  expect(g.aggregate).toEqual(
    groupPolicy(
      g.members.map((m) => ({
        subjectId: m.subjectId,
        decision: m.decision.outcome,
      })),
    ),
  );
  expect(g.members.every((m) => m.governedBy === "MEMBER_OWN_POLICY")).toBe(
    true,
  );
});
it("veto: one member's REJECT ends it even when everyone else allows with high affinity", () => {
  const g = composeGroup([
    member("a"),
    member("b"),
    member("c", { state: veto }),
  ]);
  expect(g.aggregate.aggregateDecision).toBe("REJECT");
  expect(g.vetoed).toBe(true);
  expect(g.aggregate.rejectingMembers).toEqual(["c"]);
  expect(g.explanation[0]).toMatch(/nobody can outvote a no/i);
});
it("a member's temporary permission cannot lift another member's veto, and a hard rule beats the member's own override", () => {
  const withOverride = composeGroup([
    member("a"),
    member("c", { state: veto, overrides: [grant()] }),
  ]);
  expect(withOverride.aggregate.aggregateDecision).toBe("REJECT");
  const c = withOverride.members[1].decision;
  expect(
    c.trace.some((t) => t.step === "OVERRIDE" && t.action === "IGNORED"),
  ).toBe(true);
});
it("member autonomy: a member who must be asked holds the whole group at ASK; their own permission releases only them", () => {
  const asked = composeGroup([member("a"), member("b", { policy: observe })]);
  expect(asked.aggregate.aggregateDecision).toBe("ASK");
  expect(asked.aggregate.askingMembers).toEqual(["b"]);
  const permitted = composeGroup([
    member("a"),
    member("b", { policy: observe, overrides: [grant()] }),
  ]);
  expect(permitted.aggregate.aggregateDecision).toBe("ALLOW");
  // group temporary authority = every asked member's own override; one missing keeps it at ASK
  const partial = composeGroup([
    member("a", { policy: observe, overrides: [grant()] }),
    member("b", { policy: observe }),
  ]);
  expect(partial.aggregate.aggregateDecision).toBe("ASK");
});
it("stale member preference: freshness applies per member and keeps the group from proceeding", () => {
  const old = state(entry({ createdAt: "2025-01-01T00:00:00.000Z" }));
  const fresh = policy({ freshness: { EXPLICIT_POSITIVE: 30 } });
  const g = composeGroup([
    member("a"),
    member("b", { state: old, policy: fresh }),
  ]);
  expect(g.aggregate.aggregateDecision).toBe("ASK");
  expect(g.members[1].decision.basis).toBe("STALE_EVIDENCE");
});
it("missing evidence for any member is UNAVAILABLE, never a yes", () => {
  const g = composeGroup([
    member("a"),
    {
      ...member("b"),
      input: {
        ...member("b").input,
        cultural: { status: "unavailable", reason: "timeout" },
      },
    },
  ]);
  expect(g.aggregate.aggregateDecision).toBe("UNAVAILABLE");
});
it("delegate/proxy: the subject's own policy governs; a PROXY member is decided like any other, never by the delegate", () => {
  const g = composeGroup([
    member("self"),
    member("proxy", { kind: "PROXY", policy: observe }),
  ]);
  expect(g.members[1].kind).toBe("PROXY");
  expect(g.members[1].decision.basis).toBe("AUTONOMY_CEILING");
  expect(g.aggregate.aggregateDecision).toBe("ASK");
});
it("policy changes are classified by what they permit", () => {
  const ask = observe,
    auto = DEFAULT_POLICY;
  expect(classifyPolicyChange(auto, ask)).toBe("TIGHTEN");
  expect(classifyPolicyChange(ask, auto)).toBe("LOOSEN");
  expect(classifyPolicyChange(ask, ask)).toBe("NONE");
  const limit = (n: number, c = "USD") =>
    policy({
      autonomy: {
        default: "CONFIRM_ABOVE_LIMIT",
        byDomain: {},
        byAgent: {},
        limit: { amount: n, currency: c },
      },
    });
  expect(classifyPolicyChange(limit(100), limit(50))).toBe("TIGHTEN");
  expect(classifyPolicyChange(limit(100), limit(500))).toBe("LOOSEN");
  expect(classifyPolicyChange(limit(100), limit(100, "EUR"))).toBe("LOOSEN");
  expect(
    classifyPolicyChange(
      policy({ freshness: { EXPLICIT_POSITIVE: 30 } }),
      policy({ freshness: { EXPLICIT_POSITIVE: 90 } }),
    ),
  ).toBe("LOOSEN");
  expect(
    classifyPolicyChange(
      policy({ freshness: { EXPLICIT_POSITIVE: 30 } }),
      policy({}),
    ),
  ).toBe("LOOSEN");
});
it("delegate rights: read and tighten and revoke with management; loosening or granting a permission only when the owner explicitly granted it", () => {
  const manage = ["MODEL_MANAGEMENT"],
    evalOnly = ["TASTE_EVALUATION"];
  expect(mayDo("DELEGATE", "READ_POLICY", { scopes: evalOnly })).toBe(true);
  expect(mayDo("DELEGATE", "TIGHTEN_POLICY", { scopes: evalOnly })).toBe(false);
  expect(mayDo("DELEGATE", "TIGHTEN_POLICY", { scopes: manage })).toBe(true);
  expect(mayDo("DELEGATE", "REVOKE_LEASE", { scopes: manage })).toBe(true);
  expect(mayDo("DELEGATE", "LOOSEN_POLICY", { scopes: manage })).toBe(false);
  expect(mayDo("DELEGATE", "CREATE_OVERRIDE", { scopes: manage })).toBe(false);
  expect(
    mayDo("DELEGATE", "LOOSEN_POLICY", { scopes: manage, loosenGranted: true }),
  ).toBe(true);
  expect(mayDo("DELEGATE", "LOOSEN_POLICY", { loosenGranted: true })).toBe(
    false,
  );
  expect(mayDo("OWNER", "LOOSEN_POLICY")).toBe(true);
});
