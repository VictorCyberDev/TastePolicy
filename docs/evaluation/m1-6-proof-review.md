# M1.6 proof review — 2026-10-14

Recorded implementation verification over baseline main 70e72f7457b76df8d5112263fb68a0afba162f4a. This record is not merge authorization or proof of live Qloo in this run.

## Architecture and implementation

Canonical architecture v2 read completely before implementation. [Design record](../decisions/0005-m16-local-proof-boundary.md) was written first. Existing evaluateAction/provider/policy/receipt services remain authoritative and byte-for-byte unchanged. Signature Receipt and Comparison are views over the same receipt; Stability-lite validates and replays the existing policy three times, retaining exact numeric boundary margins. No provider perturbation/four-signal profile is attempted. The local gateway and one-request stdio adapter expose only semantic evaluation/explanation/stability, not raw Qloo or execution. No new HTTP route, persistence, MCP dependency, LLM or M2 work.

## Local/browser evidence

- npm ci, format:check, lint, strict typecheck, tests, production build, verify, runtime audit and git diff --check passed.
- 197 unit/integration tests (156 preserved + 41 focused M1.6 regressions); 15 Playwright tests (12 preserved/extended + 3 proof cases).
- Actual production-build Chromium views reviewed: desktop/light synthetic ALLOW and ASK proof; dark 390×844 synthetic REJECT/mobile; all outcomes, real unconfigured UNAVAILABLE, Judge Mode, keyboard disclosures, reduced motion, long names/IDs/JSON and source labels covered by browser tests.
- Opening Capability Comparison and Structured Stability output made zero additional /api/demo requests. Three panels share the same candidate ID/action; proposal-only contains no score, Qloo evidence contains no TastePolicy policy result, and TastePolicy uses the captured result.
- Browser/page error checks passed. Page width remained bounded at 390×844. Synthetic test screenshots retain visible labels; none is committed or described as live.
- An older test's broad pre locator became ambiguous with the additional stability JSON. It was adapted to the existing labeled receipt; original assertion/coverage was preserved.

## Second-process evidence

A dedicated test-only subprocess with injected synthetic provider returned available / SYNTHETIC TEST DATA / Test destination 5 / ASK / cultural-receipt-v1 through the existing services. Production adapter with the valid historical public example and no configured credential returned unavailable/not_configured, without fallback. A raw-operation request returned error/INVALID_INPUT. Captured explanation and stability round-trips passed with explicit synthetic/recorded labels, without provider construction. Bad JSON, oversized input, incomplete-body deadline, unsupported operations, invalid profile/target, provider timeout and unexpected private errors have safe regression coverage.

Node 24's native experimental TypeScript transformation is used to execute the existing body reader without adding dependencies. Its feature warning is on stderr; stdout remains one machine JSON response. This local interoperability proof is not a stable SDK or public production gateway.

## Security and limits

Tracked/untracked source secret-pattern scan: no hits. Built browser JS QLOO_API_KEY scan: no hits. Production fixture-import scan and dangerous HTML scan: no hits. Verified M1 provider/policy/taste/receipt/domain/environment/budget/verifier modules, canonical architecture, dependency lock and Next security config are unchanged. Production/development dependency sets are unchanged; runtime audit reported zero findings. No Vercel secret/configuration changes or real Qloo calls occurred.

Optional smoke: **LIVE_M1_6_PRESENTATION_SMOKE_ENVIRONMENT_BLOCKED** because no private key was available locally. M1's accepted live report remains historical evidence; this new presentation/proof surface was verified with clearly synthetic data and safe unavailable behavior. Native CLI schema checks do not authenticate captured receipt origin; receipts are not signed, immutable or tamper-proof. Replay proves local deterministic policy reproducibility only, not provider robustness, human preference probability or scientific calibration.

**MCP_DEFERRED —** local JSON stdio proves the required second-process boundary without protocol SDK risk or a new public quota surface. M2, Taste State, ContextGraph, feedback, transaction/execution authority and continuation schema remain unimplemented. Final exact-SHA CI/Vercel status is reported in the completion checkpoint; independent guide review controls merge.
