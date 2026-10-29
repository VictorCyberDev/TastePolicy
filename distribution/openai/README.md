# OpenAI portable plugin candidate

Status: DRAFT_PACKAGE, NOT_SUBMITTED, NOT_APPROVED, NOT_PUBLISHED. This folder can be packaged for the current portal. No manifest or ZIP proves a successful scan, actual host tool invocation, reviewer access or eligibility.

The root plugin.json and mcp.json use the Agent Plugins 1.0.0 formats and OpenAI extensions described in the official package/submission docs, refreshed 2026-10-29. One stable public remote MCP server uses OAuth with CIMD preference and the three supported scopes. No bearer token, client secret, reviewer credential, app mapping or lifecycle hook is included. The identity is the individual founder, not an invented corporation. The primary/composer logo is the existing TastePolicy brand asset. No screenshot of an unobserved host UI is supplied.

The manifest has exactly five positive and three negative review cases. They are a proposed protocol for a dedicated review account; they have NOT been run in the actual ChatGPT host and must not be marked passed. The ALLOW case needs a fresh verified Qloo candidate; a provider outage must remain UNAVAILABLE, never a forced score. Country targeting is an initial restricted proposal (NG, US, GB, CA, AU), not a legal determination or proof of platform availability. Review vendor rights, actual portal constraints and founder preferences before publication.

Before submission: complete individual publisher identity and stable-origin domain verification; copy the exact portal token into server-only OPENAI_APPS_CHALLENGE and verify its exact response at /.well-known/openai-apps-challenge; complete real OAuth consent and successful tool scan; provision a private dedicated review account and fixture; execute all eight review cases in the host; provide a reviewer-accessible real demo recording; resolve automated findings; confirm required platform attestations. Keep reviewer credentials and their transmission in the portal's private fields, outside the public package. No credentials are supplied here.

The public challenge route is implemented and returns 404 until the actual portal token is configured. Never invent a verification token. Portal setup supports OAuth account linking; fixed developer-key headers are deliberately absent.

Official sources:

- https://developers.openai.com/plugins/build/plugins
- https://developers.openai.com/plugins/deploy/submission

Run python scripts/package-openai-plugin.py to validate local structure and create an explicitly draft ZIP under .work-evidence. Passing local validation is not an OpenAI automated review result or permission to claim publication.
