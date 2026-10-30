# M26 execution ledger: real-user activation and ChatGPT closure

Branch `m26-real-user-activation`, from production `main` at `b020c4f`.

## Real-user product gap (closed in code)

Before: signup created only a Better Auth account and routed to `/dashboard`, which showed Margaret whenever no Passport existed; `/experience` was hard-coded to Margaret; real Passport creation lived in a developer workspace with manual entity IDs.

Now:

- Product state is resolved from `/api/account/inspect` alone (`src/lib/product/state.ts`): VISITOR, AUTHENTICATED_UNONBOARDED, ACTIVE, or UNAVAILABLE (an outage is never mistaken for a visitor or a new user). DEMO is a labelled page, not a person's state.
- Signup always lands on `/onboarding`. Login goes to `/dashboard`, or to `/onboarding` when the account has no Passport (recovery). A half-finished onboarding resumes at the missing step.
- `/onboarding`: five favourites in the person's own words, resolved by live Qloo (`/api/demo/resolve`), explicit confirmation of ambiguous or missing matches, Passport creation through the existing `create` op, "what matters" (needs) with an optional typed starting area, and the action ceiling ladder published through the existing policy path.
- `/experience` is the signed-in person's own: their saved anchors, needs and ceiling, personal Qloo discovery reusing the M25 place stack, and evaluation against their real Passport (`choose` op: the existing `evaluate` plus the explained evaluation). Visitors are asked to sign in; unonboarded accounts are sent to setup.
- `/dashboard` shows only saved data (taste, needs, ceiling, pending asks, decisions, connected apps), with edit-needs, sign out, data export, start-over and delete-account.
- Margaret moved to `/demo/margaret` (plus the existing scenario pages and the judge walkthrough). `tests/product-activation.test.ts` fails the build if any real-user surface mentions her or imports her fixtures.
- New server pieces: migration `0014_passport_needs.sql`, `ActivationService` (`taste`, `needs-set`, `choose`), `/api/places/area` (typed neighbourhood search via Nominatim; the device location is never read).

## Known limits

- Individual favourites cannot be edited in place. "Start over" deletes the Passport (with confirmation) and re-runs onboarding.
- The ceiling is not changed by `/dashboard` itself: "Change it" opens the existing rules page. Widening on `/experience` publishes a real policy and may ask the person to sign in again.
- "What are you looking for?" selects place, destination or brand. Free text is not interpreted.
- Evaluations per person are rate-limited by the existing platform quota (100 a day).

## Tests

- `tests/activation.test.ts`: real SQL in PGlite: no Passport for a new account, taste anchors, needs persistence, isolation between two accounts, malformed needs, `choose` with a published ceiling.
- `tests/product-activation.test.ts`: state resolution, needs round trip, Margaret isolation scan.
- `tests/e2e/activation.spec.ts`: P0 fresh signup to onboarding to experience to dashboard persistence; no-Passport recovery; returning account edit and sign-out; visitor.
  These drive the browser against a stateful stand-in for the account API (`tests/e2e/account-fixture.ts`, labelled synthetic). The evaluator is the production code. The real server path is covered by the PGlite tests and the production acceptance run below.

## ChatGPT and plugin status (observed evidence only)

- CIMD client-authentication-method negotiation: the plural-choice repair is in `oauth-service.ts` with tests in `tests/oauth.test.ts` (merged earlier). It was not re-observed against the real ChatGPT host in this session.
- MCP endpoint answers 401 without credentials (expected). `/.well-known/openai-apps-challenge` returns 404: the portal has not issued a token, and none is invented.
- Official registry entry `io.github.VictorCyberDev/tastepolicy` 0.2.0 reports `active`.
- Package checked against the current official submission and package docs. Conforming: `$schema`, `name`, `version`, listing field lengths, four HTTPS URLs, five positive and three negative cases, OAuth with `cimd`, no secrets, no hooks or `apps`. Not yet satisfiable here: `review.demo_recording_url` (needs a real recording), domain verification token, reviewer account, portal scan, attestations.
- **Identity mismatch to resolve before submission:** `distribution/openai/plugin.json` names the developer "Victor Nnajiofor"; the site footer and legal pages say "Victor Nnamdi". The portal's verified developer identity must match what is shown. This was not changed.
- Distribution status: CONNECTED_NOT_SUBMITTED. A custom plugin was connected in an earlier session; nothing was submitted, approved or published, and no real ChatGPT tool invocation or review-case run has been observed.

## Gate results (superseded)

The M26 gates (953 unit, 189/189 e2e) were superseded by the final-freeze gates below.

## Production acceptance (live Qloo, real database)

Two synthetic accounts (desktop and mobile viewports), each deleted through the product's own "Delete my account" at the end. This section records the first acceptance runs, made while the fixes below were being deployed. The final, complete runs on the frozen deployment are in the next section.

Observed: signup lands on `/onboarding`; live Qloo resolved the typed favourites (a favourite typed under the wrong kind correctly showed "No match found" instead of guessing); Passport created; needs, ceiling saved; `/experience` showed the person's own anchors and needs with a live Qloo recommendation, real open street imagery, and a real decision (ASK: entrance and walking time unknown); `/dashboard` persisted the needs across a reload; no Margaret text on any real-user page.

Defects found by production acceptance and fixed before it passed (each now has a regression test):

1. `needs-set` rejected the `idempotencyKey` the browser attaches to every mutation (HTTP 400). The PGlite test had omitted the key and the browser stand-in did not validate keys. Fixed; the stand-in now rejects unknown keys and a test drives the whole first-run journey through the real HTTP handler with the browser's bodies.
2. A late account response could pull someone back a step during onboarding. Fixed and tested with a delayed response.
3. "This feels like her" appeared on a real person's page. Fixed; the e2e now fails on third-person copy there.

Left behind: one synthetic production account from the first failed acceptance attempt (created before the fix, never given a Passport, email `m26-acceptance-desktop-…@example.test`). It could not be signed into afterwards because its password was not kept. It holds no taste data.

## Final freeze (supersedes every earlier "final" in this file)

- Final source: `main` at `21cc2c4fe618d63382fd943a1f7704660fc9eda1`.
- Final production: `dpl_2WEGQtuHywj7ecszGuP6NBMJghAn`, READY, `https://tastepolicy.vercel.app`. This ledger commit lives on branch `m26-real-user-activation` only, so production was not redeployed for documentation.
- Last source change: Margaret-specific pronouns on `/judge` Act 3 ("This feels like Margaret, but I need to confirm the entrance") and on `/demo/margaret` ("Margaret's Tasteprint, drawn from the things she loves"). The personal `/experience` keeps second person. A new e2e (`pronouns: ...`) asserts all three pages.
- Final gates after that change: Prettier clean; ESLint 0 errors (1 existing `<img>` warning); `tsc` clean; 75 test files passed and 7 skipped; 953 tests passed, 28 skipped; `next build` succeeded; full Chromium e2e 190 passed (includes axe checks).

### Margaret live walkthrough (production, desktop and mobile, anonymous)

`/demo/margaret` loaded with the corrected copy. Live Qloo resolved the anchors (the candidate evidence names Casablanca, Miles Davis, Eataly). Qloo discovered The Algonquin Hotel Times Square with candidate-specific evidence ("Qloo finds it close to Casablanca, Miles Davis, Eataly. A cultural match is a reason to look, not a reason to go."). The place and media layer loaded (OpenStreetMap facts; KartaView/Wikimedia imagery with attribution; See the journey / See the approach / Look around). First check: **ASK** (walking time unknown; OpenStreetMap already reports the entrance as accessible, so only the walk was asked). Margaret's answer (8 minutes) was recorded as her word; the same candidate re-evaluated to **ALLOW at SHORTLIST**. The simulated agent request to present it as the final choice gave **ASK** (action ceiling, "further than you allowed"). On the next candidate, Melody's Piano Bar, OpenStreetMap reports the entrance as not step-free: **REJECT** despite a strong cultural match. "Why this happened" separated Cultural evidence, Place facts, Place imagery, Your requirements, Authority and Final decision. No page errors on either viewport. The acceptance script's anchor-name capture was empty because of a selector; the anchor resolution is evidenced by the candidate evidence line.

### Real user live cycle (production, one fresh throwaway account)

Signup landed on `/onboarding`. Live Qloo resolved Miles Davis, Casablanca (1942), Severance (2022), Piranesi and Eataly. Onboarding saved needs (step-free entrance, short walk) and a Shortlist ceiling. Personal recommendation: Bar Centrale. First check: **ASK** (entrance and walking time unknown). Answers (entrance yes, 8 minutes) were recorded as the person's word; the same candidate re-evaluated to **ALLOW (shortlist)**. A request above the saved ceiling gave **ASK**. On the next candidate (One World Trade Center) the person stated that the entrance has steps: **REJECT** (a user-confirmed hard incompatibility, not provider data). The receipt separated evidence, place facts, imagery, requirements, authority and decision. No Margaret text and no third-person copy on personal pages. After a reload the dashboard still showed the needs and limit; after sign-out the dashboard asked to sign in and showed no personal data; after signing back in the taste, needs and limit were intact. The account was then deleted through the normal "Delete my account" flow.

### Production health

`/`, `/judge`, `/demo/margaret`, `/experience`, `/dashboard`, `/onboarding`, `/product` and `/api/ready` returned 200. `/api/ready` reported database, migrations, authentication, attestation, cultural provider, public origin and OAuth all up/current/configured. Runtime logs for the final deployment, filtered to error level during the acceptance flows, contained only the known `pg` SSL-mode warning and a `pg` "client already executing a query" deprecation warning (both written to stderr; no failed requests).

### Known limitations

- The earlier throwaway account from the first failed M26 acceptance attempt (no Passport, no taste data) remains in production.
- Individual favourites cannot be edited in place; "Start over" deletes the Passport and re-runs onboarding.
- The ceiling is changed through the existing rules page or by widening during a check; the dashboard links to it.
- "What are you looking for?" selects place, destination or brand; free text is not interpreted.
- Place facts depend on OpenStreetMap coverage; many places have no entrance data, which correctly produces ASK.
- ChatGPT distribution remains CONNECTED_NOT_SUBMITTED. Open external checkpoints: verified developer identity (the plugin names "Victor Nnajiofor", the site "Victor Nnamdi"; not changed), portal domain-verification token, reviewer account, demo recording URL, portal scan and attestations, a real ChatGPT tool invocation, and submission, review and publication.
