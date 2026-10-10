# TastePolicy

**Cultural intelligence and authorization for autonomous agents.**

Phase 0 — Engineering Foundation. Public, open-source modular monolith for a Qloo Agentic Hackathon submission and potential startup.

## Current status

TastePolicy does **not** evaluate actions, infer preferences, recommend entities, or produce receipts. The homepage is an honest architecture/status view. Qloo integration will be added in a later milestone. This repository foundation alone does not establish hackathon eligibility; verify official rules before submission.

## Local setup

Use Node.js 24 LTS and npm (see `.nvmrc` and `package-lock.json`).

```sh
git clone https://github.com/VictorCyberDev/TastePolicy.git
cd TastePolicy
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. `GET /api/health` returns `{"status":"ok","service":"tastepolicy"}` plus a generated request ID.

## Environment contract

No application environment variable or external-service credential is required in Phase 0. `NODE_ENV` is managed by Next.js; if provided it must be development/test/production. Optional `NEXT_PUBLIC_APP_URL` is a valid HTTP(S) canonical URL without embedded credentials. Optional `SUPABASE_URL` is validated when present. Blank optional values mean absent.

QLOO_API_KEY, OPENAI_API_KEY and SUPABASE_SERVICE_ROLE_KEY are future **server-only** secrets. NEXT_PUBLIC_SUPABASE_ANON_KEY is a future public browser credential; it does not grant service-role privileges. No provider is called or initialized. Missing keys do not imply successful provider availability. Future adapters must report not_configured explicitly. Never send the object exported by `src/lib/env/server.ts` to a browser. Next.js server-only import guards enforce this boundary.

## Commands

```sh
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run test
npm run test:unit
npm run format
npm run format:check
npm run verify
# Run after build; starts its own production server on port 3000:
npx playwright install --with-deps chromium
npm run test:e2e
```

`verify` checks formatting, ESLint, strict TypeScript, Vitest and production build. Playwright separately exercises the production homepage, mobile layout, dark mode, health response, headers and browser errors. CI runs both without external secrets. Keep port 3000 free for E2E.

## Architecture

Single Next.js App Router application with React, Tailwind and strict TypeScript. `src/app` holds presentation/HTTP entry points; `src/components` shared UI; `src/features` future orchestration; `src/lib` configuration, errors and safe logging; `src/server` future domain/provider boundaries; `src/types` design contracts. Interfaces are design intentions, not completed systems. See [architecture](docs/architecture/overview.md) and [ADRs](docs/decisions/0001-modular-monolith.md).

## Deployment

Ready for Vercel: import this repository, select Next.js, use Node 24, npm ci and npm run build. No provider credentials are needed. Optionally set NEXT_PUBLIC_APP_URL to the resulting canonical URL. No project has been linked or deployed by Phase 0. No database is connected. See SECURITY.md before future integrations.

## Next milestone

TastePolicy Milestone 1 — Qloo Cultural Intelligence Vertical Slice.

## License

Apache License 2.0. See [LICENSE](LICENSE). Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md).
