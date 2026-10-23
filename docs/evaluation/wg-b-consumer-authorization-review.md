# WG-B consumer authorization experience

Starting head: `24f714eb99a53d834cbc7f566b844ecc9b5addca`. Branch: `win-gate-hackathon-hardening`, PR #11. Exact resulting review/deployment head and sanitized hosted evidence are recorded in the PR's consumer-authorization handoff. GUIDE owns acceptance, fresh-human timing, freeze and merge.

## Existing contracts, new presentation

`/arena/consumer` uses the existing reviewed resolution/discovery routes. Each explicit choice check creates/reuses the protected temporary demo session, reads the current SELF profile and initializes only a fresh empty state with the five explicitly reviewed anchors. An existing different profile is refused without mutation. Same-anchor profiles retain their saved constraints; ordinary checks use `/api/state/evaluate` so reload cannot bypass saved rules through a cultural-only check. No second evaluator or threshold arithmetic runs in the browser.

The surface reuses `/api/state/session`, `/read`, `/mutate`, `/evaluate` and `/api/state/interactive/plan`, `/answer`, `/repair`. Idempotency keys are retained for manual retries of the same mutation/answer/repair payload. No automatic retry occurs. Stale state requires explicit refresh and another check. Frontend orchestration never supplies profile IDs as authority.

| Canonical result | Consumer wording        | Continuation                                   |
| ---------------- | ----------------------- | ---------------------------------------------- |
| ALLOW            | This fits               | Recommend / add to draft only                  |
| ASK              | One thing first…        | Ask before continuing                          |
| REJECT           | Not this one            | Do not proceed; offer a verifiable alternative |
| UNAVAILABLE      | I don’t know enough yet | Pause without assuming dislike                 |

Continuation derives from the accepted `boundedContinuation` contract. Gestures, answers and repair never grant booking, purchase, payment, account, private-data, legal or execution authority. Canonical outcomes remain visible secondarily. Technical state, rule identities and captured envelopes sit under Developer details; the engineering Arena is unchanged.

## Explicit state and interaction boundaries

“I have a $100 budget” submits TOO_EXPENSIVE / CONTEXT / CONTEXT_SCOPED for `arena_dinner`, then genuinely evaluates the missing-price proposal. PRICE_REQUIRED and currency come from the captured clarification plan. “Use this price” submits a PRICE answer; “I don’t know” submits UNKNOWN. Other accepted disposition questions are presented without inventing answers. The service's actual final decision is shown. Original ASK, original Cultural Receipt and immutable state remain unchanged; a supplied amount is explicit interaction evidence, not a verified venue quote or durable preference.

“Never choose this place for me” submits SPECIFIC_DISLIKE / CANDIDATE_ONLY / DURABLE, then evaluates under the returned state. Swipe-left and “Another one” remain navigation, with zero feedback mutation. Explicit exclusion advances state; merely answering, discovering repair or evaluating replacement does not.

A root REJECT may request one bounded existing repair. Only REPAIR_AVAILABLE with a separately verified different candidate at the same state version is presented. Verification is not a new authorization: the replacement has no primary ALLOW until the user explicitly checks it through a fresh `/state/evaluate`, using verification's action/context/state version/agent. The original REJECT and repair envelope remain separate captured evidence. No cascading automatic repair or score optimization is introduced.

## Preserved price-repair limitation

The requested single-profile sequence (budget → price answer → exclusion → successful replacement) cannot complete successful substitution under the accepted service. The applicable budget remains durable/context-scoped after the interaction answer. Existing repair deliberately returns NO_VERIFIABLE_REPAIR when an applicable MAX_PRICE remains, since no authoritative replacement price exists. The consumer explains this refusal and keeps every rule. It neither transfers the original price nor silently removes the budget.

Successful repair is tested separately in a fresh same-anchor demo profile with an explicit candidate exclusion and no price constraint. This preserves all applicable rules. GUIDE must accept the truthful refusal/separate-scenario demonstration or explicitly authorize another contract; this slice does not change repair semantics to force a preferred live sequence.

## Unavailability and evidence

Actual unavailable cultural evaluation displays UNAVAILABLE without inferring dislike. A failed request does not fabricate a Cultural Receipt. The separate optional rehearsal visibly states “Demo rehearsal”, “No live outage is claimed”, “No Qloo call”, “No authorization” and “No fabricated receipt”. It does not replace a real decision or override a known exclusion.

The accepted Wikimedia adapter, matching, URL/license validation, LOCATION_CONTEXT classification and fallback are untouched. Replacement cards naturally use that same presentation layer. No photo metadata enters state evaluation, clarification, repair or Cultural Receipt. Captured Qloo evidence reused by clarification is labeled captured; it is not described as a new provider request.

## Verification and review boundary

SQL-backed hook regressions execute migrations 0001/0002 and the production PostgreSQL repository/services. They assert real ASK/ALLOW/REJECT/UNAVAILABLE behavior, immutable state after answers/repair, original exclusion after fresh replacement authorization, same-anchor reuse, different-anchor refusal and durable idempotent answer replay after a lost response. Browser fixtures are visibly SYNTHETIC TEST DATA and reuse accepted policy/planner functions; they do not constitute live evidence. Existing photography and engineering Arena regressions remain in the full suite.

Mobile controls include keyboard alternatives, visible focus, large touch targets, reduced-motion compatibility, readable long labels and progressive disclosure. The separately documented Next.js 16.4.0 → 16.4.2 security patch is a validation prerequisite, not a preference-authority change. TasteBench dataset, predictions and metric formulas remain unchanged. No fresh-human timing or recruitment occurs in this task; no WG-G, M6, A2A or M7 work is included.

Local validation: 551 unit/integration tests passed, including six new SQL-backed orchestration tests; the dedicated database gate passed 209 tests; Playwright passed 66 cases, including eight new consumer-authorization cases. Existing photo cases retain their assertions and now supply the state-backed evaluation contract. Format/lint/typecheck/build/verify and TasteBench validate/contract/report passed. TasteBench prediction/result/metric semantic artifact hashes equal the accepted baseline. Production audit on Next.js 16.4.2 reports zero vulnerabilities. Exact-head CI and hosted proof are separately recorded in the PR handoff; these local results do not claim live outcomes or human timing.
