# WG-B progressive consumer journey

Starting head: `01c6f0cee12d014957461aca4e8dfef4ecd32ff8`. Branch: `win-gate-hackathon-hardening`, PR #11 (Draft). GUIDE owns acceptance, a new fresh-human test, freeze and merge. This slice does not run or claim that test.

## Why

A fresh user understood TastePolicy but found `/arena/consumer` too text-heavy, too long, visually thin, short on imagery for some candidates and lacking progression: a chosen candidate left them on the same page with budget and clarification controls piled underneath. The accepted authorization behavior was not the problem; the presentation was. The thesis is unchanged: Qloo gives agents taste; TastePolicy gives that taste authority boundaries.

The interrupted session's local edits were not recoverable. This is a reconstruction from the locked requirements, built on the authoritative remote head.

## Stage architecture

One moment per screen. The stage is derived from accepted authorization state; the only UI-owned facts are “a real request is running” and “handoff”.

| Stage    | Screen                                                                   | Next                                     |
| -------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| TASTE    | Five chosen signals, one action                                          | confirm                                  |
| confirm  | “Are these the five things you meant?”, checkbox, one action             | DISCOVER                                 |
| DISCOVER | One dominant candidate card: ← Another one · Why this? · Looks good →    | CHECKING                                 |
| CHECKING | “TastePolicy is checking your boundaries…” for exactly the real request  | the actual decision                      |
| ALLOW    | ✓ This fits · Continue with this choice →                                | HANDOFF                                  |
| HANDOFF  | Preference check complete; where TastePolicy ends                        | Choose something else (navigation only)  |
| ASK      | ? One thing first · one focused question                                 | CHECKING → the actual resulting decision |
| REJECT   | × Not this one · Find something that respects that →                     | CHECKING → new proposal                  |
| proposal | A new candidate card (“New proposal · not checked yet”)                  | CHECKING → fresh evaluation → decision   |
| noRepair | NO_VERIFIABLE_REPAIR / no verified repair / stale; budget is not dropped | another place, or refresh                |
| PAUSE    | — I don’t know enough yet (UNAVAILABLE), visibly not REJECT              | manual check again                       |

Selecting a candidate removes the discovery deck; authorization, clarification, stop and repair never append beneath it. A quiet “← Back to the choice” on decision screens is navigation only: it drops the displayed decision, never a saved rule. A progress indicator (Taste · Discover · Check · Decision) gives the sense of forward movement. Focus moves to each stage's heading; stage transitions use a short fade that is removed under `prefers-reduced-motion`.

`useConsumerAuthorization`, state/session semantics, anchor verification, `/api/state/interactive/plan`, `/answer`, `/repair`, exclusion, idempotency, state-version protections, Qloo normalization and Cultural Receipt semantics are unchanged. The old single `ConsumerAuthorization` component was split into presentational pieces (`ClarifyPanel`, `DemoBoundaries`, `EvidencePanel`); stage screens live in `ConsumerStages.tsx`. `/arena` is untouched and remains the audit surface; the consumer flow does not depend on it.

## Authorization screens

- **CHECKING** is shown only while the real request (evaluate, answer or repair) is in flight. There is no artificial delay and ALLOW is never hardcoded; the browser tests hold the mocked evaluation open and assert the stage precedes the decision.
- **ALLOW** is its own screen. “Continue with this choice →” only switches to the HANDOFF screen. It issues no request, collects no input and presents no booking, reservation, purchase or payment control. The handoff names where preference authorization ends: booking, purchase or payment needs separate execution authorization.
- **ASK** is its own screen. The budget case reads “Your budget is $100.” then “What does this place cost?” through the existing `/api/state/interactive/plan` and `/answer`. The answer stays interaction-scoped; durable state is unchanged. “I don’t know” still returns ASK and never guesses.
- **REJECT** is its own stop screen. The only action calls the existing bounded repair.
- **Repair** appears as a separate replacement proposal. Repair verification is not authorization: the replacement receives a fresh `/api/state/evaluate` before ALLOW can show, and the original exclusion survives.
- **NO_VERIFIABLE_REPAIR** keeps the accepted truthful limitation. With a budget: “I can’t verify another option within your budget yet. Your rule is still active. I won’t guess a price.”
- **UNAVAILABLE** is its own screen: “Missing taste evidence is not the same as disliking this.” No receipt or provider evidence is fabricated; no automatic retry.

## Visual completeness and provenance

Every candidate has a meaningful visual, in this order:

1. a trustworthy licensed property photo where one exists: no such provider exists in this repository and none was added, so this tier is empty;
2. an accepted Wikimedia Commons LOCATION_CONTEXT image where the existing adapter returns one (credited, licensed, “presentation only, not Qloo evidence”, exact property not verified);
3. a local premium **taste portrait**: a deterministic gradient/arc composition seeded from the candidate id (six palettes, varied light position and tilt) with a monogram, labelled “Taste portrait · presentation only”.

The portrait guarantees no empty card and never claims an exact property identity. Decision screens carry a small seeded portrait chip. Portrait and photo metadata are presentation only: the browser tests assert none of it reaches `/api/state/evaluate` inputs, and a unit test asserts the portrait module has no policy or evaluation dependency. The accepted Wikimedia matching, URL/license validation, classification and fallback code is unchanged; only CSS now also hides the portrait monogram beneath a licensed photo.

## Copy reduction

The long hero, explainer strip, footer paragraph, per-card paragraphs, swipe boundary paragraph and the four-line decision panel were removed. Primary screens carry one eyebrow or status, one heading, one or two short sentences, one dominant action and at most one secondary action. Technical material (Qloo evidence, captured-answer provenance, saved rules, developer JSON) sits behind “Why this?” / “Developer details”. Canonical outcomes remain visible secondarily as a small “Internal policy: …” line.

## Tests

Stage-transition coverage was added without removing the existing state, provenance and safety assertions: starts at TASTE; confirmation progresses to DISCOVER; choosing removes the deck; CHECKING precedes the decision; ALLOW and HANDOFF screens; handoff performs no network request, no state change and exposes no executable control; ASK uses the accepted plan/answer endpoints and leaves durable state unchanged; REJECT stop screen; separate replacement proposal; no evaluation from repair alone; fresh evaluation for the replacement; original exclusion survives; NO_VERIFIABLE_REPAIR keeps the budget; UNAVAILABLE is not REJECT; swipe-left creates no rule; swipe-right only checks; every candidate has a visual; honest provenance; image metadata never enters authorization; mobile 390×844 without horizontal overflow; keyboard-only completion; reduced motion; light/dark; no console or page errors. A static unit test asserts the consumer journey only reaches the accepted authorization/discovery routes and contains no booking, payment or OTA surface.

Button accessible names now equal their visible text (“Looks good →”, “← Another one”) instead of a differing `aria-label`.

## Boundaries

No booking, payment, inventory, OTA, date or card collection, generic travel search, threshold change, Qloo semantics change or WG-C evidence change. No M6, PR #10, WG-G or merge. PR #11 stays Draft.

## Persistence and preserved semantics

Authoritative hosted persistence is Neon PostgreSQL. This slice is presentation-only: it adds no migration, table, function, trigger, connection setting or persistence provider, and introduces no Supabase, Firebase, second database or in-memory production substitute. The consumer journey calls only the already accepted `/api/state/session`, `/read`, `/mutate`, `/evaluate`, `/api/state/interactive/plan`, `/answer`, `/repair` and the demo resolve/discover routes (a unit test asserts this route set). State/session semantics, explicit five-anchor verification, state mutation, exclusion, idempotency keys, state-version protections, UNAVAILABLE behavior, Cultural Receipt semantics and Qloo normalization are untouched. The repository's SQL tests run against a local PostgreSQL-compatible test harness; that is test infrastructure only and does not describe the deployed database. No database credential was read, printed or logged.

## Local validation (final tree)

- Format, lint (two pre-existing warnings), typecheck, build and `npm run verify`: passed.
- Unit/integration: 555 tests in 25 files, passed on every full run (verify plus two further consecutive runs on the final tree).
- Database gate (`npm run test:database`, 4 files): 209 tests passed in the full local stack, then passed twice more consecutively when run alone on an idle machine.
- Playwright: 68 tests passed on the final tree, including the rewritten consumer-authorization and consumer-media specs (13 cases).
- TasteBench validate/contract/report: passed on three consecutive final-tree runs; dataset, annotation and semantic hash (`bc302b1b…dc5c7`) were identical every time, with only latency fields varying. No TasteBench code or data changed.
- Production `npm audit --omit=dev`: zero vulnerabilities.
- Secret-pattern scans (changed/untracked files and tracked repository): no hits. Built client bundle: no `QLOO_API_KEY`, `DATABASE_URL`, `x-api-key`, private key or connection-string text, and no PGlite or test-data logic. No `innerHTML` use in the arena feature.

Disclosed transient event: earlier in the work, the pre-existing trajectory test “filesystem close/reopen preserves trajectory and actual SQL projection” (default 5 s timeout) exceeded it by roughly 0.2 s on two database-gate runs executed while heavy background jobs were still running. The test and its timeout were not modified or skipped. The same gate passed on the untouched base head, and passed on this tree in the full stack and then twice consecutively when run standalone on an idle machine. It is documented as a transient resource-contention event; the test is timing-sensitive on slow runners.

Exact-head CI, Vercel deployment and hosted acceptance are recorded in the PR handoff for the pushed head. These local results do not claim live outcomes or human timing, and do not claim WG-B overall PASS.
