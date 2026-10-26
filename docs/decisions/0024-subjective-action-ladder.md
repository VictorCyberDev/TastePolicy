# ADR 0024 — Progressive subjective authority: the action ladder

Status: accepted (final reconciliation). Supersedes nothing; extends ADR 0015/0021.

## Context

The M7 policy had three autonomy levels (OBSERVE, CONFIRM_ABOVE_LIMIT, AUTONOMOUS). They say how much an agent may do on a match, but not _what_ it does with a choice. "Recommend", "shortlist", "add to a draft" and "present as selected" are different degrees of speaking for a person.

## Decision

An ordered ladder: SUGGEST < RANK < SHORTLIST < ADD_TO_DRAFT < PRESENT_AS_SELECTED. Buying, booking and paying are not rungs; they are outside TastePolicy.

- **Additive.** `PolicyDocument.actions` (`default`, `byDomain`, `byAgent`) and `sensitive` are optional. A document without them, and a client that sends no `requestedAction`, behave exactly as before.
- **Legacy mapping (explicit).** `recommend` = SHORTLIST, `add_to_draft` = ADD_TO_DRAFT. A legacy ALLOW permits SUGGEST, RANK, SHORTLIST, ADD_TO_DRAFT and never PRESENT_AS_SELECTED. `continuation.permitted` keeps the legacy words; `continuation.permittedActions` is the ladder form; lease `permitted` is derived from `permittedActions`.
- **Request.** `requestedAction` on evaluate states how far the agent intends to go. A request above the resolved ceiling turns an ALLOW into an ASK with basis `ACTION_CEILING` and rule `ACTION:<requested>><ceiling>`, which is `AUTHORITY_CONFIRMATION` (the owner may allow that one exact choice). Without a ladder the ceiling is the legacy one (ADD_TO_DRAFT), so PRESENT_AS_SELECTED always asks until the owner opts in.
- **Ceiling resolution.** agent, then kind of choice, then default. A sensitive-domain `maxAction` and an organization ceiling can only lower it. Agent names are looked up as own properties only.
- **Trace.** Every decision with a ladder carries `action {requested, ceiling, ceilingSource, escalationRequired, permitted}`.
- **Precedence is unchanged.** Hard blocks, saved limits, UNAVAILABLE and group vetoes are final; the ladder only lowers an ALLOW. A temporary permission can lift an ASK for the exact choice, never a hard rule, never a sensitive domain with `noOverride`, never an organization ceiling.
- **Widening needs recent authentication** like every other widening policy change (`classifyPolicyChange` compares effective ceilings, sensitive protections and caps).

## Sensitive subjective domains

The repository's domains are brand, destination and place. Sensitivity is therefore an owner declaration per domain, not an inference from content. Per domain: `alwaysAsk`, `maxAction`, `freshExplicitDays` (newest explicit like must be recent, else a CLARIFICATION), `noOverride`. This is a subjective-authority safety layer, not a medical, legal or financial decision system.

## Organization ceiling (foundation only)

`TASTEPOLICY_ORG_ID` and `TASTEPOLICY_ORG_MAX_ACTION` set one ceiling for a deployment. It can only lower; a request above it is a REJECT (`ORG_ACTION_CEILING`), not a confirmable ASK, and it also caps lease ladders. Every decision records `ceilingSource: ORGANIZATION`. Not implemented: multiple organizations per deployment, membership, SSO/SCIM, an admin console.

## Evidence classes

Policy freshness was already per evidence class (HARD_CONSTRAINT, EXPLICIT_NEGATIVE, EXPLICIT_POSITIVE, CONTEXTUAL, EXPLORATION). All state evidence in the repository has source USER, so "group-derived" and "delegated/proxy" evidence are not state classes: groups and proxies are decided per member at decision time (ADR 0021), and inferred cultural affinity is Qloo evidence inside the base evaluator, not owner state.

## Consequences

One migration (0009) relaxes only the "non-empty" check on the legacy `permitted` column, because a ceiling of SUGGEST or RANK has no legacy word. Tests: `tests/policy-ladder.test.ts`, `tests/ladder-service.test.ts`, portable vectors `conformance/action-ladder-vectors-v1.json`.
