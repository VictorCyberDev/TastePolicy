// How policy composes with M5 subjects (SELF, PROXY/delegate) and groups.
// There is no second group engine: every member is decided by the one policy
// engine under that member's own policy, and the existing M5 group rule
// (UNANIMOUS_NO_VETO_V1) aggregates the final member decisions. Nothing here
// can raise an outcome above what a member's own decision allows.
import { groupPolicy } from "@/server/subjects/policy";
import {
  evaluateWithPolicy,
  autonomyFor,
  type PolicyEvaluationInput,
} from "./engine";
import {
  AUTONOMY_LEVELS,
  type PolicyDecision,
  type PolicyDocument,
} from "./types";

export type MemberKind = "SELF" | "PROXY";
export interface GroupMemberInput {
  subjectId: string;
  kind: MemberKind;
  // The member's own state, policy and overrides. A delegate never supplies
  // these for a PROXY subject: they belong to the subject's owner.
  input: PolicyEvaluationInput;
}
export interface ComposedMember {
  subjectId: string;
  kind: MemberKind;
  decision: PolicyDecision;
  // Whose rules decided: always the member's own.
  governedBy: "MEMBER_OWN_POLICY";
  // The rule that mattered for this member, in words a person can read.
  because: string;
}
export interface ComposedGroup {
  aggregate: ReturnType<typeof groupPolicy>;
  members: ComposedMember[];
  // The group rule that produced the aggregate.
  decidingRule: ReturnType<typeof groupPolicy>["aggregateBasis"];
  // True when one member's no ended it, whatever anyone else said.
  vetoed: boolean;
  explanation: string[];
}
const because = (d: PolicyDecision) =>
  d.outcome === "REJECT"
    ? "Their own rules say no."
    : d.outcome === "UNAVAILABLE"
      ? "Evidence for them is missing, which is never a yes."
      : d.outcome === "ASK"
        ? d.basis === "AUTONOMY_CEILING"
          ? "Their own rule says to ask them first."
          : "A fact about them is missing."
        : d.basis === "USER_TEMPORARY_OVERRIDE"
          ? "They gave a temporary permission."
          : "Their rules allow it.";
export function composeGroup(members: GroupMemberInput[]): ComposedGroup {
  const composed: ComposedMember[] = members.map((m) => {
    const decision = evaluateWithPolicy(m.input);
    return {
      subjectId: m.subjectId,
      kind: m.kind,
      decision,
      governedBy: "MEMBER_OWN_POLICY",
      because: because(decision),
    };
  });
  const aggregate = groupPolicy(
    composed.map((c) => ({
      subjectId: c.subjectId,
      decision: c.decision.outcome,
    })),
  );
  const vetoed = aggregate.rejectingMembers.length > 0;
  const explanation = [
    vetoed
      ? "At least one member said no, so the answer is no. Nobody can outvote a no."
      : aggregate.aggregateDecision === "UNAVAILABLE"
        ? "Evidence for a member is missing, so nothing is allowed."
        : aggregate.aggregateDecision === "ASK"
          ? "At least one member must be asked, so the group cannot go ahead yet."
          : "Every member's own rules allow it.",
  ];
  return {
    aggregate,
    members: composed,
    decidingRule: aggregate.aggregateBasis,
    vetoed,
    explanation,
  };
}

// ---- who may change a policy ----
const rank = (l: (typeof AUTONOMY_LEVELS)[number]) =>
  AUTONOMY_LEVELS.indexOf(l);
export type PolicyChangeKind = "TIGHTEN" | "LOOSEN" | "NONE" | "MIXED";
// Compare two policies by what they permit. Loosening = more autonomy, a
// longer freshness window, a higher spending limit, or a currency change that
// could admit more.
export function classifyPolicyChange(
  a: PolicyDocument,
  b: PolicyDocument,
): PolicyChangeKind {
  let tighter = false,
    looser = false;
  const cmp = (x: number, y: number) => {
    if (y < x) tighter = true;
    if (y > x) looser = true;
  };
  cmp(rank(a.autonomy.default), rank(b.autonomy.default));
  for (const d of new Set([
    ...Object.keys(a.autonomy.byDomain),
    ...Object.keys(b.autonomy.byDomain),
  ])) {
    const dom = d as keyof PolicyDocument["autonomy"]["byDomain"];
    cmp(
      rank(a.autonomy.byDomain[dom] ?? a.autonomy.default),
      rank(b.autonomy.byDomain[dom] ?? b.autonomy.default),
    );
  }
  for (const g of new Set([
    ...Object.keys(a.autonomy.byAgent),
    ...Object.keys(b.autonomy.byAgent),
  ]))
    cmp(
      rank(autonomyFor(a, g, "brand" as never)),
      rank(autonomyFor(b, g, "brand" as never)),
    );
  const la = a.autonomy.limit,
    lb = b.autonomy.limit;
  if (la && lb) {
    if (la.currency !== lb.currency) looser = true;
    else cmp(la.amount, lb.amount);
  } else if (!la && lb) looser = true;
  else if (la && !lb) tighter = true;
  for (const c of new Set([
    ...Object.keys(a.freshness),
    ...Object.keys(b.freshness),
  ])) {
    const k = c as keyof PolicyDocument["freshness"];
    const x = a.freshness[k],
      y = b.freshness[k];
    if (x === undefined && y !== undefined) tighter = true;
    else if (x !== undefined && y === undefined) looser = true;
    else if (x !== undefined && y !== undefined) cmp(x, y);
  }
  return tighter && looser
    ? "MIXED"
    : tighter
      ? "TIGHTEN"
      : looser
        ? "LOOSEN"
        : "NONE";
}
export type Actor = "OWNER" | "DELEGATE";
export type Operation =
  | "READ_POLICY"
  | "TIGHTEN_POLICY"
  | "LOOSEN_POLICY"
  | "CREATE_OVERRIDE"
  | "REVOKE_OVERRIDE"
  | "REVOKE_LEASE";
// The delegate rights, in one place:
//  read      TASTE_EVALUATION or MODEL_MANAGEMENT
//  tighten   MODEL_MANAGEMENT (more caution is always safe for the owner)
//  loosen / create a permission  never, unless the owner gave this exact
//            right explicitly (`loosenGranted`); a permission created that way
//            is the owner's override and is counted as the owner's.
//  revoke    anyone who can tighten may end an override or a lease.
export function mayDo(
  actor: Actor,
  op: Operation,
  o: { scopes?: readonly string[]; loosenGranted?: boolean } = {},
): boolean {
  if (actor === "OWNER") return true;
  const s = o.scopes ?? [];
  const manage = s.includes("MODEL_MANAGEMENT");
  switch (op) {
    case "READ_POLICY":
      return manage || s.includes("TASTE_EVALUATION");
    case "TIGHTEN_POLICY":
    case "REVOKE_OVERRIDE":
    case "REVOKE_LEASE":
      return manage;
    case "LOOSEN_POLICY":
    case "CREATE_OVERRIDE":
      return manage && o.loosenGranted === true;
  }
}
