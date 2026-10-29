import { evaluateWithPolicy } from "@/lib/policy/engine";
import {
  DEFAULT_POLICY,
  SUBJECTIVE_ACTIONS,
  type SubjectiveAction,
} from "@/lib/policy/types";
import type {
  SessionAuthority,
  StateEvaluation,
  StateVersion,
} from "@/lib/state/types";

export interface SessionAuthorityInput {
  requestedAction: SubjectiveAction;
  ceiling: SubjectiveAction;
}
const action = (v: unknown): SubjectiveAction | null =>
  SUBJECTIVE_ACTIONS.includes(v as SubjectiveAction)
    ? (v as SubjectiveAction)
    : null;

// The anonymous demo profile has no published policy, so the person's chosen
// "how far AI may go" travels with the request and is run through the very
// same engine a published policy uses. Only the demo state route accepts it.
export function splitSessionAuthority(raw: unknown): {
  rest: unknown;
  authority: SessionAuthorityInput | null | "INVALID";
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { rest: raw, authority: null };
  const { sessionAuthority, ...rest } = raw as Record<string, unknown>;
  if (sessionAuthority === undefined) return { rest, authority: null };
  const a = sessionAuthority as Record<string, unknown> | null;
  const requestedAction = action(a?.requestedAction);
  const ceiling = action(a?.ceiling);
  if (
    !a ||
    typeof a !== "object" ||
    Object.keys(a).some((k) => k !== "requestedAction" && k !== "ceiling") ||
    !requestedAction ||
    !ceiling
  )
    return { rest, authority: "INVALID" };
  return { rest, authority: { requestedAction, ceiling } };
}

export function sessionAuthority(
  state: StateVersion,
  evaluation: StateEvaluation,
  input: SessionAuthorityInput,
  now: string,
): SessionAuthority {
  const d = evaluateWithPolicy({
    state,
    candidate: evaluation.action.candidate,
    context: evaluation.context,
    cultural: evaluation.cultural,
    agentId: evaluation.agentId,
    now,
    policy: {
      ...DEFAULT_POLICY,
      actions: { default: input.ceiling, byDomain: {}, byAgent: {} },
    },
    policyVersion: null,
    overrides: [],
    requestedAction: input.requestedAction,
  });
  return {
    requestedAction: input.requestedAction,
    ceiling: d.action?.ceiling ?? input.ceiling,
    ceilingSource: d.action?.ceilingSource ?? "DEFAULT",
    escalationRequired: d.action?.escalationRequired ?? false,
    outcome: d.outcome,
    basis: d.basis,
    rules: d.rules,
    permitted: d.action?.permitted ?? [],
  };
}
