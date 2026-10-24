# M7 CONTROL — subjective policy control plane

Design record: ADR 0015. This page is the product and API contract.

## What a person can do

At `/account/rules` an account holder decides how much an agent may do on a taste match:

- **Autonomy**: _Ask me every time_ (`OBSERVE`), _Ask me above a limit_ (`CONFIRM_ABOVE_LIMIT`), _Let it decide_ (`AUTONOMOUS`). Set a default, then optionally per kind of choice (brand, place, destination) or per named agent. Agent beats kind beats default.
- **Freshness**: say how old taste information may be (per evidence class). Older information makes an agent ask again.
- **Temporary permissions**: allow a kind of choice, an exact choice or a situation for 1–30 days. They expire, can be ended at once, and never reach a hard rule. Allowing past a taste rejection needs an explicit confirmation and an exact choice.
- **Preview before publishing**: replay recent checks under the draft and see what would change.
- **History and restore**: every published version is immutable; restoring publishes the old document as a new version.
- `/account/inspector` explains any recorded answer step by step and lists only single changes that were re-run and confirmed to change it.

Rules cannot make an agent more permissive than the taste check unless a person gives an explicit override. Nothing here grants purchase, payment or booking authority.

## Decision order

Base evaluator (unchanged) → hard rules are final (`USER_HARD_BLOCK`, `CONTEXT_CONSTRAINT`, `UNAVAILABLE`) → freshness → autonomy ceiling → temporary override. Every response carries `policy.trace`. No policy and no override: the response is byte-for-byte the M6 response (no `policy` field).

Added `decisionBasis` values: `STALE_EVIDENCE`, `AUTONOMY_CEILING`, `USER_TEMPORARY_OVERRIDE`. Clients must treat unknown bases as informational; `decision` is the contract.

## API

Account (session, exact origin):

| Operation         | Notes                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `policy-get`      | active document, history, overrides, suggestions                                                   |
| `policy-publish`  | `{passportRef, document, expectedVersion, note?, idempotencyKey}`; loosening needs a fresh sign-in |
| `override-create` | fresh sign-in; max 20 active; 1–30 days                                                            |
| `override-revoke` | immediate                                                                                          |
| `policy-simulate` | one recorded evaluation under a draft                                                              |
| `policy-impact`   | last 200 evaluations under a draft                                                                 |
| `policy-explain`  | trace + verified counterfactuals for one evaluation                                                |

Agents: `GET|POST /api/v1/policy` (and MCP `tastepolicy_get_policy`), scope `PASSPORT_READ`, returns only the resolved autonomy per kind, limit and freshness days. Not the history, overrides or any state.

## Data

Migration `0006_policy_control_plane.sql` is additive (`policy_versions`, `policy_active`, `policy_overrides`, `platform_policy_decisions`), RLS-enabled, cascades with the Passport. Apply with `npm run db:migrate:policy`.

## Groups, delegates and proxies (ADR 0021)

Each member is decided by their own policy; the M5 rule `UNANIMOUS_NO_VETO_V1` aggregates. One no ends it; a temporary permission releases only its owner; a delegate may read and tighten, never loosen or grant a permission unless the owner explicitly gave that right. See `src/lib/policy/composition.ts` and `tests/policy-composition.test.ts`.
