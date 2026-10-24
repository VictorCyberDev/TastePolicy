import "server-only";
import type { Repositories } from "@/server/state/repositories";
import type { MemberAuthorization, TasteSubject } from "@/lib/subjects/types";
import type { StateEvaluation } from "@/lib/state/types";
import { evaluateWithPolicy } from "@/lib/policy/engine";
import { fail, member } from "./common";

// Each group member is decided under that member's own M7 policy before the
// existing M5 group rule aggregates. There is no group policy engine here:
// a member whose state profile belongs to a Passport carries that Passport's
// published policy and temporary permissions; any other member (a temporary
// session profile, a delegate-attested proxy) has none and is unchanged.
async function decide(
  r: Repositories,
  s: TasteSubject,
  e: StateEvaluation,
  ref: string,
  version: number | null,
  at: string,
): Promise<MemberAuthorization> {
  const state = await r.states.version(s.stateProfileId, e.stateVersion);
  if (!state) fail("INTEGRITY_ERROR");
  let document = null;
  if (version !== null) {
    const row = await r.policy.version(ref, version);
    if (!row) fail("INTEGRITY_ERROR");
    document = row.document;
  }
  const overrides = await r.policy.overrides(ref);
  const d = evaluateWithPolicy({
    state,
    candidate: e.action.candidate,
    context: e.context,
    cultural: e.cultural,
    agentId: e.agentId,
    now: at,
    policy: document,
    policyVersion: version,
    overrides,
  });
  // The wrapped evaluator must agree with the evidence that was recorded.
  if (d.baseOutcome !== e.decision.outcome) fail("INTEGRITY_ERROR");
  const base = member(s, e);
  return {
    ...base,
    decision: d.outcome,
    decisionBasis: d.basis,
    policy: {
      version,
      baseDecision: d.baseOutcome,
      rules: d.rules,
      overrideIds: d.rules
        .filter((x) => x.startsWith("OVERRIDE:"))
        .map((x) => x.slice(9))
        .sort(),
      appliedAt: at,
    },
  };
}
// Group authorization time: the member's current policy and permissions.
export async function applyMemberPolicy(
  r: Repositories,
  s: TasteSubject,
  e: StateEvaluation,
  at: string,
): Promise<MemberAuthorization> {
  const ref = await r.policy.passportRefForProfile(s.stateProfileId);
  if (!ref) return member(s, e);
  const active = await r.policy.active(ref),
    overrides = await r.policy.overrides(ref);
  if (!active && !overrides.length) return member(s, e);
  return decide(r, s, e, ref, active?.version ?? null, at);
}
// Historical replay: rebuild the captured decision from the captured policy
// version and the captured time. Today's rules are never consulted; whether they
// changed since is reported separately.
export async function replayMemberPolicy(
  r: Repositories,
  s: TasteSubject,
  e: StateEvaluation,
  captured: MemberAuthorization,
): Promise<{
  member: MemberAuthorization;
  currentPolicyVersion: number | null;
}> {
  const ref = await r.policy.passportRefForProfile(s.stateProfileId);
  const current = ref ? ((await r.policy.active(ref))?.version ?? null) : null;
  if (!captured.policy)
    return { member: member(s, e), currentPolicyVersion: current };
  if (!ref) fail("INTEGRITY_ERROR");
  return {
    member: await decide(
      r,
      s,
      e,
      ref,
      captured.policy.version,
      captured.policy.appliedAt,
    ),
    currentPolicyVersion: current,
  };
}
