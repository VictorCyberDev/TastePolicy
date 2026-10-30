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
