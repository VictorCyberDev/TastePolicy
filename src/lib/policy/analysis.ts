import { evaluateWithPolicy, type PolicyEvaluationInput } from "./engine";
import {
  DEFAULT_POLICY,
  type PolicyDecision,
  type PolicyDocument,
  type PolicyOverride,
} from "./types";

// Pure analysis on recorded inputs: no provider call, no persistence, and the
// same function the live path uses, so simulations cannot drift from reality.
export interface Counterfactual {
  change:
    | "OVERRIDE_THIS_CANDIDATE"
    | "RAISE_AUTONOMY"
    | "IGNORE_FRESHNESS"
    | "REMOVE_ENTRY";
  detail: string;
  // Changes the user must make themselves; never applied automatically.
  userAction: true;
  resultOutcome: PolicyDecision["outcome"];
}
export function counterfactuals(
  i: PolicyEvaluationInput,
  at: string,
): Counterfactual[] {
  const current = evaluateWithPolicy(i);
  const out: Counterfactual[] = [];
  const consider = (
    change: Counterfactual["change"],
    detail: string,
    next: PolicyEvaluationInput,
  ) => {
    const r = evaluateWithPolicy(next);
    if (r.outcome !== current.outcome)
      out.push({ change, detail, userAction: true, resultOutcome: r.outcome });
  };
  const policy = i.policy ?? DEFAULT_POLICY;
  consider(
    "OVERRIDE_THIS_CANDIDATE",
    "Allow this exact candidate for a limited time",
    {
      ...i,
      overrides: [
        ...i.overrides,
        {
          overrideId: "00000000-0000-4000-8000-000000000000",
          effect: "ALLOW_THROUGH_ASK",
          scope: { candidateId: i.candidate.id },
          createdAt: at,
          expiresAt: new Date(Date.parse(at) + 86_400_000).toISOString(),
        },
      ],
    },
  );
  consider("RAISE_AUTONOMY", "Let this agent act without asking", {
    ...i,
    policy: {
      ...policy,
      autonomy: { default: "AUTONOMOUS", byDomain: {}, byAgent: {} },
    },
  });
  consider("IGNORE_FRESHNESS", "Do not treat older evidence as stale", {
    ...i,
    policy: { ...policy, freshness: {} },
  });
  for (const e of i.state.entries.filter((e) => e.constraint))
    consider("REMOVE_ENTRY", `Remove your saved rule ${e.signalId}`, {
      ...i,
      state: {
        ...i.state,
        entries: i.state.entries.filter((x) => x.signalId !== e.signalId),
      },
    });
  return out;
}
export interface ImpactItem {
  ref: string;
  input: PolicyEvaluationInput;
}
export interface ImpactReport {
  total: number;
  changed: number;
  transitions: Record<string, number>;
  examples: { ref: string; from: string; to: string; basis: string }[];
}
export function impactAnalysis(
  items: ImpactItem[],
  draft: PolicyDocument | null,
  draftOverrides?: PolicyOverride[],
  exampleLimit = 20,
): ImpactReport {
  const report: ImpactReport = {
    total: items.length,
    changed: 0,
    transitions: {},
    examples: [],
  };
  for (const { ref, input } of items) {
    const before = evaluateWithPolicy(input),
      after = evaluateWithPolicy({
        ...input,
        policy: draft,
        overrides: draftOverrides ?? input.overrides,
      });
    if (before.outcome === after.outcome) continue;
    report.changed++;
    const key = `${before.outcome}->${after.outcome}`;
    report.transitions[key] = (report.transitions[key] ?? 0) + 1;
    if (report.examples.length < exampleLimit)
      report.examples.push({
        ref,
        from: before.outcome,
        to: after.outcome,
        basis: after.basis,
      });
  }
  return report;
}
