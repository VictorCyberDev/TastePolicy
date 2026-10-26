# R6 hosted acceptance — status

Evidence labels: LIVE (real provider), HOSTED (deployed exact head), CONTROLLED, SYNTHETIC, LOCAL, CI, NOT EXECUTED, BLOCKED.

## Environment discovery (executed)

- Vercel project `tastepolicy` (team `start-up16`), linked to `VictorCyberDev/TastePolicy`. Vercel Authentication (SSO protection) is off. Previews build per branch; **no production deployment exists** (`tastepolicy.vercel.app` returns 404).
- Previews of the M6, M7, M8, M9 heads (`c263032`, `f0211e6`, `efca97e`, `6c973f0`) built READY. Their `/api/ready` answers `not_ready` with every dependency `unconfigured`: the project's environment variables (`DATABASE_URL`, `QLOO_API_KEY`, `QLOO_API_BASE_URL`, `QLOO_AFFINITY_SCALE`, `NEXT_PUBLIC_APP_URL`) are scoped to the Win Gate branch only, and no auth, attestation or origin variables exist for any other branch.
- Neon project `tastepolicy` (default branch `main`, schema at migration level 0004 — Win Gate). A copy-on-write branch `m9-acceptance` was created for acceptance; it has not been migrated or connected to a deployment.

## What is BLOCKED and why

**HOSTED acceptance (DB, Qloo, OAuth, MCP, A2A, M7/M8/M9 scenarios) — BLOCKED_HUMAN.** Running it needs a database connection string and a Qloo key in the deployment's environment. Reading the Neon connection string through the Neon tool was refused by the session's auto-mode permission classifier. Re-scoping the existing sensitive Win Gate variables to another branch would change how the owner's secrets are exposed and was not done without the owner's decision. No secret was read, printed or copied.

Exact human actions that unblock it (any one route):

1. In Vercel (project `tastepolicy` → Settings → Environment Variables), for Preview and Git branch `m6-m9-final-reconciliation`: set `DATABASE_URL` (the Neon `m9-acceptance` branch connection string), `QLOO_API_KEY`, `QLOO_API_BASE_URL=https://hackathon.api.qloo.com`, `QLOO_AFFINITY_SCALE=unit`, `BETTER_AUTH_SECRET` (random, ≥32 chars), `BETTER_AUTH_URL` and `TASTEPOLICY_PUBLIC_ORIGIN` (the branch alias URL), `TASTEPOLICY_ATTESTATION_KEY` (an ES256 private JWK), `TASTEPOLICY_MIGRATE_ON_BUILD=1`; or
2. Authorize the assistant to re-scope the existing Win Gate variables to all previews and to read the Neon connection string.
   Then run `scripts/acceptance/hosted-acceptance.mjs` against the deployment (it needs only the deployment URL).

## LIVE external agents — NOT EXECUTED

No signed-in ChatGPT, Claude or Gemini session or browser automation was available to this session, so no vendor connector was attempted. Nothing is claimed. Standards-based surfaces exist (remote MCP with OAuth, A2A card); an MCP client library connects to them in tests (`tests/mcp.test.ts`, `tests/oauth.test.ts`). Gemini Enterprise A2A is not supported.

## What was executed instead (LOCAL / CI)

Full suite on real PostgreSQL 16 (see the PR for the run), migration bootstrap and upgrade rehearsals (`tests/realpg-migrate.test.ts`), controlled load and contention (`docs/evaluation/load-local.md`), Playwright with axe in CI, the Compatible v1 suite (110 checks), the independent security review (`docs/security/threat-model.md`).
