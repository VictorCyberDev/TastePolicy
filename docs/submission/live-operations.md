# Bounded presentation smoke handoff

M1 provider acceptance is complete; [final report](../evaluation/milestone-1-live-acceptance-2026-10-13.md) is authoritative. Do not repeat wire discovery, distribution studies or the full verifier for presentation-only work.

1. Verify the exact M1.5R SHA and baseline/provider diff. Provider/policy/verifier semantics must remain unchanged.
2. If a credential is securely available locally, configure it server-side only with the assigned event host and verified unit scale. Never paste it in chat, use CLI secret arguments or add it to browser fields/CI. Otherwise label only the optional smoke LIVE_PRESENTATION_SMOKE_ENVIRONMENT_BLOCKED.
3. Start the actual production-build application. Resolve the five reviewed concepts and explicitly select identities. Prefill is not current identity verification.
4. Respect the observed five-request/second event limit. Wait at least 1,100 ms between operations; do not add retries or runtime provider behavior in a presentation milestone.
5. Discover place, select a naturally returned candidate, evaluate SELECT_ENTITY, inspect the human/JSON receipt. A complete smoke uses at most 9 provider dispatches (5 search + 2 discovery + 2 evaluation), no repeat/research calls. Stop on 429/auth failure.
6. Record actual timestamp/SHA, candidate/decision/affinity/scale/explainability, browser errors and provenance. No raw headers or provider dumps. No predetermined result.
7. Keep live, recorded, synthetic and unavailable proof separate. The accepted M1 report is historical evidence, not a new smoke.

The unchanged verifier remains available for separately authorized integration acceptance; its existing pacing is verifier-only. Read scripts/README.md, policy-v1.md and canonical architecture v2. No Vercel secret/configuration changes, merges or later milestones are authorized here.
