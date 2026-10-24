# ADR 0021 — Policy composition with SELF, delegate (PROXY) and groups (M7)

Status: accepted. Revised after GUIDE review: the first version modelled composition in a helper that production never called; composition is now the production group path.

## Problem

M7 policies belong to one Passport. M5 introduced SELF and PROXY subjects and groups under `UNANIMOUS_NO_VETO_V1`. Nothing said how the two compose: could a group override an individual veto, could a delegate loosen the subject's policy, whose temporary permission counts?

## Decision

1. **No second group engine.** `GroupService.authorize` (M5) routes every member through `applyMemberPolicy` (`src/server/subjects/member-policy.ts`): the member's recorded M1–M5 evidence → that member's own published policy and temporary permissions (`evaluateWithPolicy`, the one M7 engine) → the member's final decision → the unchanged M5 aggregation `groupPolicy` (`UNANIMOUS_NO_VETO_V1`). The policy that applies to a member is the policy of the Passport that owns the member's state profile. A member without one (a temporary session profile, a delegate-attested proxy model) is unchanged and its stored shape is byte-identical to M5.
2. **Individual veto is absolute.** A member REJECT yields group REJECT; UNAVAILABLE never becomes ALLOW; a member who must be asked holds the group at ASK. The group layer cannot raise any outcome.
3. **Temporary authority is personal.** An override belongs to the Passport that created it and is evaluated only for that Passport's member. "Group temporary authority" therefore means every asked member's own permission; one missing keeps the group at ASK. An override never lifts a hard rule (traced as IGNORED).
4. **Captured and replayable.** Each group result stores, per member, the final decision plus `policy: {version, baseDecision, rules, overrideIds, appliedAt}`. The DB keeps the recorded evidence-level decision in the foreign-keyed column and the final decision in the captured member document. Replay rebuilds each member from the _captured_ policy version and time (policy versions are immutable) and fails with an integrity error on any mismatch; it never consults today's rules. The replay response separates the historical decision, `policyChangedSince` per member (has the member's active policy moved since), and `permissionActiveNow`.
5. **Delegates.** A grantee (session or credential) has no access to the owner's rules: reading them, publishing, creating or ending permissions, simulation and impact all refuse (`tests/policy-delegate.test.ts`, through the real service). The only delegate rights are those of the grant (evaluate, receipts, summary). Any future delegated-edit path must classify the change with `classifyPolicyChange` and refuse anything `widensAuthority` (LOOSEN or MIXED) unless the owner granted that exact right.
6. **Widening is judged on effective behaviour.** `classifyPolicyChange` compares, for every agent and every kind of choice, which autonomy level applies (agent, then kind, then default), the spending limit (added or raised widens; removed tightens; a currency change is MIXED), and freshness windows (longer or removed widens). MIXED counts as widening. Publishing a widening policy needs a recent sign-in; tightening never does. This replaces the earlier ad-hoc `isLoosening`, which ignored a newly added limit and mis-compared agent rules.
7. **Staleness, autonomy, revocation, version change** use the same engine paths as for individuals; membership is versioned (M5); lease drift on a policy version change belongs to M8.

## Honest limitation

M5 groups are session-token objects and the database forbids an account's state profile from also being a demo session (M6 keeps Judge Mode and accounts apart). So policy-aware members exist today only where a state profile is owned by a Passport (for example a proxy model bound to one); the integration tests bind Passports to proxy profiles directly. There is no product flow yet that builds a group from several accounts' Passports; that would be a new surface and is not part of this milestone.
