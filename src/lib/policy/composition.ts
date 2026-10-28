// Policy changes: which ones widen authority. (Group composition lives in
// src/server/subjects/member-policy.ts: each member is decided under their own
// policy and the M5 group rule aggregates. There is no second group engine.)
import {
  actionLevel,
  own,
  AUTONOMY_LEVELS,
  DEFAULT_POLICY,
  type AutonomyLevel,
  type PolicyDocument,
} from "./types";

const rank = (l: AutonomyLevel) => AUTONOMY_LEVELS.indexOf(l);
export type PolicyChangeKind = "TIGHTEN" | "LOOSEN" | "NONE" | "MIXED";
// Compare two policies by what they permit. The comparison is over *effective*
// behaviour, not over the shape of the document: for every agent and every kind
// of choice, what level applies (agent, then kind, then default)? Anything that
// lets an agent act with less asking, a longer freshness window, no freshness
// check, or a higher / newly added spending limit is looser; the opposite is
// tighter; both at once is MIXED, and a mixed change is never treated as safe.
export function classifyPolicyChange(
  before: PolicyDocument | null,
  after: PolicyDocument,
): PolicyChangeKind {
  const a = before ?? DEFAULT_POLICY;
  let tighter = false,
    looser = false;
  const cmp = (x: number, y: number) => {
    if (y < x) tighter = true;
    if (y > x) looser = true;
  };
  const agents = new Set([
    "",
    ...Object.keys(a.autonomy.byAgent),
    ...Object.keys(after.autonomy.byAgent),
    ...Object.keys(a.actions?.byAgent ?? {}),
    ...Object.keys(after.actions?.byAgent ?? {}),
  ]);
  const kinds = new Set([
    "",
    ...Object.keys(a.autonomy.byDomain),
    ...Object.keys(after.autonomy.byDomain),
    ...Object.keys(a.actions?.byDomain ?? {}),
    ...Object.keys(after.actions?.byDomain ?? {}),
    ...Object.keys(a.sensitive ?? {}),
    ...Object.keys(after.sensitive ?? {}),
  ]);
  const level = (d: PolicyDocument, agent: string, kind: string) =>
    (agent ? own(d.autonomy.byAgent, agent) : undefined) ??
    (kind
      ? d.autonomy.byDomain[
          kind as keyof PolicyDocument["autonomy"]["byDomain"]
        ]
      : undefined) ??
    d.autonomy.default;
  for (const g of agents)
    for (const k of kinds) cmp(rank(level(a, g, k)), rank(level(after, g, k)));
  // Action ceiling per (agent, kind): a higher ceiling lets the agent go
  // further without asking. A document without `actions` is the legacy
  // ceiling, ADD_TO_DRAFT, so unchanged legacy documents compare equal.
  const ceil = (d: PolicyDocument, agent: string, kind: string) => {
    const x = d.actions;
    let c = x
      ? ((agent ? own(x.byAgent, agent) : undefined) ??
        (kind ? x.byDomain[kind as keyof typeof x.byDomain] : undefined) ??
        x.default)
      : "ADD_TO_DRAFT";
    const cap = kind
      ? d.sensitive?.[kind as keyof NonNullable<typeof d.sensitive>]?.maxAction
      : undefined;
    if (cap && actionLevel(cap) < actionLevel(c)) c = cap;
    return actionLevel(c);
  };
  for (const g of agents)
    for (const k of kinds) cmp(ceil(a, g, k), ceil(after, g, k));
  // Sensitive-domain rules: removing a protection is looser, adding is tighter.
  for (const dom of new Set([
    ...Object.keys(a.sensitive ?? {}),
    ...Object.keys(after.sensitive ?? {}),
  ])) {
    const x = a.sensitive?.[dom as keyof NonNullable<typeof a.sensitive>],
      y = after.sensitive?.[dom as keyof NonNullable<typeof after.sensitive>];
    // permissiveness: 0 when the protection is on, 1 when it is off
    cmp(x?.alwaysAsk ? 0 : 1, y?.alwaysAsk ? 0 : 1);
    cmp(x?.noOverride ? 0 : 1, y?.noOverride ? 0 : 1);
    const fx = x?.freshExplicitDays,
      fy = y?.freshExplicitDays;
    if (fx === undefined && fy !== undefined) tighter = true;
    else if (fx !== undefined && fy === undefined) looser = true;
    else if (fx !== undefined && fy !== undefined) cmp(fx, fy);
  }
  const la = a.autonomy.limit,
    lb = after.autonomy.limit;
  if (!la && lb)
    looser = true; // a limit makes some prices act without asking
  else if (la && !lb)
    tighter = true; // price unknown again: ask
  else if (la && lb) {
    if (la.currency !== lb.currency) {
      looser = true; // prices in the new currency may now pass...
      tighter = true; // ...prices in the old one now ask
    } else cmp(la.amount, lb.amount);
  }
  for (const c of new Set([
    ...Object.keys(a.freshness),
    ...Object.keys(after.freshness),
  ])) {
    const k = c as keyof PolicyDocument["freshness"];
    const x = a.freshness[k],
      y = after.freshness[k];
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
// True when the change must be treated as widening authority.
export const widensAuthority = (k: PolicyChangeKind) =>
  k === "LOOSEN" || k === "MIXED";
