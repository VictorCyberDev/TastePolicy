# ADR 0021 — Policy composition with SELF, delegate (PROXY) and groups (M7 repair R3)

Status: accepted.

## Problem

M7 policies belong to one Passport. M5 introduced SELF and PROXY subjects and groups under `UNANIMOUS_NO_VETO_V1`. Nothing said how the two compose: could a group policy override an individual veto, could a delegate loosen the subject's policy, whose temporary permission counts?

## Decision

1. **No second group engine.** Every member is decided by the one policy engine (`evaluateWithPolicy`) under that member's own state, policy and overrides. The existing M5 rule (`groupPolicy`) aggregates the final member decisions. `src/lib/policy/composition.ts` only wires those two together and explains the result.
2. **Individual veto is absolute.** A member REJECT (hard rule, cultural reject) yields group REJECT. Missing evidence for any member is UNAVAILABLE. A member who must be asked holds the group at ASK. Nothing at group level raises an outcome.
3. **Temporary authority is personal.** An override applies only to the member who created it. Group "temporary authority" is therefore the set of the asked members' own overrides: one missing keeps the group at ASK. An override never lifts a hard rule (unchanged engine behaviour, traced as IGNORED).
4. **Delegates.** A PROXY subject's rules are the subject owner's. A delegate (a person acting under a permission attestation or share) may: read (`TASTE_EVALUATION` or `MODEL_MANAGEMENT`); tighten and end permissions/leases (`MODEL_MANAGEMENT`); loosen policy or create a permission only if the owner granted that exact right explicitly. Policy mutation in the service is session-only and owner-only, so delegates cannot publish today; `mayDo` and `classifyPolicyChange` define the contract any future delegated-edit path must satisfy. A permission created by a delegate under an explicit loosen grant counts as the owner's.
5. **Staleness and autonomy** are per member and use the same engine paths as for individuals.
6. **Revocation / removal / version change** use the existing M5 versioning (membership is versioned; a removed member no longer participates) and M8 drift (policy version change suspends leases).

## UX

`/account/rules` states, in plain language, whose rules apply, that one no ends it, what a delegate can and cannot do, and who can end things. A composed result carries a per-member `because` and the deciding group rule for any surface that shows a group answer.

## Not claimed

Groups are still session-token (M5) objects, not Passport-bound; there is no hosted multi-account group. This ADR fixes the semantics and tests them over the real engine; it does not add a group persistence layer.
