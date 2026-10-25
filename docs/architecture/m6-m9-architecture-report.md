# TastePolicy M6–M9 Architecture Report

Prepared at the M9 gate, 2026-10-24. Statements about what exists are backed by code and tests in this repository; statements about what was **not** verified say so. Companion: [Canonical Architecture v4](canonical-architecture-v4.md). Evidence index: [`docs/evaluation/m6-m9-freeze.md`](../evaluation/m6-m9-freeze.md).

## 1. Executive summary

M1–M5 produced one trustworthy cultural-preference evaluator. M6–M9 turn it into infrastructure other software can rely on: reachable by any agent (M6 CONNECT), controllable by the person (M7 CONTROL), enforceable over time (M8 ENFORCE) and provable to third parties without exposing the person (M9 VERIFY). Everything is a layer around the same evaluator; none can widen what it allows except by an explicit, expiring act of the person. All four milestones are implemented and gated on their own branches (PRs #10, #12, #13, #14). Hosted persistence/auth proof, vendor live runs and merge into `main` are the open items (§42).

## 2. Product category

A **Subjective Authority Layer**: not a recommender, not a payment or booking rail, not an identity provider. It answers one question for an agent acting for a person: _is it justified in making this subjective choice for them?_ The answer is cultural-preference authority only.

## 3. M1–M5 preserved foundation

Unchanged and regression-tested: Cultural Receipt v1, `stateDecision`, state versioning and hashing, interactive authorization, trajectory, proxy/group authorization, TasteBench. M6–M9 add tables and wrappers; no earlier migration was edited. The full historical suite runs on every head; the one known intermittent failure is a 5-second timeout in `trajectory.test.ts` that also fails on the base branch and is environment-driven (not modified).

## 4. M6 architecture

One contract (`src/lib/platform/contracts.ts`) generates the tool schemas for REST (`/api/v1/*`), generated OpenAPI, remote MCP (`/api/mcp`), A2A (`/api/a2a`), the SDK and the sandbox. One error catalog (`errors.ts`). Every door calls `PlatformService` through `gateway.ts`; `tests/conformance.test.ts` asserts identical authority facts across service, REST, SDK, MCP and A2A. Auth is a scoped, hashed, expiring developer credential (`PASSPORT_READ`, `TASTE_EVALUATE`, `RECEIPT_READ`); sessions are cookie-based and exact-origin.

## 5. M7 architecture

`src/lib/policy`: pure engine wrapping `stateDecision`. Policies are immutable, numbered, hash-addressed documents with an active pointer; decisions made under a policy record the version and trace in a separate table so the base evaluation and its replay check are untouched. Authoring is owner-session only; loosening and overrides need a fresh sign-in. Control plane at `/account/rules`, inspector at `/account/inspector`.

## 6. M8 architecture

`src/lib/lease`: pure, replayable state machine (`ASK_PENDING → ACTIVE ⇄ SUSPENDED`; terminal DECLINED, REVOKED, EXPIRED, RELEASED). A lease records a fingerprint (state hash, policy version, grant, overrides) and permits only `recommend`/`add_to_draft`. Drift suspends; only a newer ALLOW resumes. Row locks, a unique live-lease index, optimistic `expectedRev`, idempotent requests, append-only events with the projection verified against replay on every read. Owner page `/account/leases`.

## 7. M9 architecture

`src/lib/attest`: SD-JWT (RFC 9901) proofs of an ACTIVE lease, audience-bound, minimally disclosed, signed ES256; Token Status List (draft-21) in Postgres with one random never-reused index per proof; hosted verifier, library verifier, 35 conformance vectors. See §26–28.

## 8. Authority boundaries

The boundary is enforced in layers: (a) `authority: CULTURAL_ONLY` is a non-removable visible claim in every proof and a verifier requirement; (b) `continuation.permitted` and lease `permitted` are the same closed set (`recommend`, `add_to_draft`); (c) tool descriptions, agent card, OpenAPI and docs state it; (d) no code path maps ALLOW to an execution action, and no execution capability exists in the codebase. A lease or proof is not a credential and cannot be used to call TastePolicy.

## 9. Data model

Migrations: 0001–0005 (M1–M6 foundation: state, interactive, trajectory, subjects, platform) and additive 0006 (policy: `policy_versions`, `policy_active`, `policy_overrides`, `platform_policy_decisions`), 0007 (`platform_leases`, `lease_events`), 0008 (`attestation_status_lists`, `attestation_status_used`, `lease_status_entries`, `attestations`, `attestation_replays`, SQL `set_status` and sync triggers). All new tables have row-level security enabled and PUBLIC revoked; terminal/immutable rows are enforced by triggers (lease extension and revival, event edits, policy versions). Deleting a Passport cascades through all of them and marks every proof's status INVALID in the same transaction.

## 10. Protocol map

| Protocol                | Version                                                                                              | Surface                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| REST                    | `/api/v1`, OpenAPI 3.1 generated                                                                     | json, bearer                                                                                             |
| MCP                     | 2026-07-28 and 2025-era (stateless, JSON, Streamable HTTP), SDK `@modelcontextprotocol/server` 2.4.0 | `POST /api/mcp`                                                                                          |
| A2A                     | 1.0 JSON-RPC, card at `/.well-known/agent-card.json`                                                 | `POST /api/a2a`                                                                                          |
| OAuth resource metadata | RFC 9728 + OAuth 2.1 AS (ADR 0022)                                                                   | `/.well-known/oauth-protected-resource/api/mcp`; authorization server advertised only on a pinned origin |
| SD-JWT                  | RFC 9901                                                                                             | attestations                                                                                             |
| SD-JWT VC               | draft-19 (aligned, not certified)                                                                    | claim vocabulary                                                                                         |
| Token Status List       | draft-21                                                                                             | `/api/attest/status/{id}`                                                                                |
| JOSE                    | RFC 7515/7517/7519/7638/8725; ES256                                                                  | signing                                                                                                  |

## 11. MCP

Twelve tools from the contract, with explicit annotations (`readOnlyHint`, `destructiveHint:false`, `idempotentHint`, `openWorldHint:false`), `outputSchema`, `structuredContent`, `ttlMs`/`cacheScope:"private"` on `tools/list`, domain outcomes as normal results and failures as `isError` with a stable code. Dual-era tested with the official client; bearer only via `Authorization`; Origin validated; authentication precedes admission; JSON-RPC batches rejected; body read with the platform deadline.

## 12. A2A

Hand-rolled 1.0 JSON-RPC: `SendMessage` returns a COMPLETED task with the decision artifact (UNAVAILABLE is a normal artifact, not a failure); `GetTask` is scoped to the caller and masks others' tasks; `A2A-Version` enforced; streaming, push, `ListTasks` and extended card return the A2A error for unsupported operations. Verified with the official `@a2a-js/sdk` client. Gemini Enterprise registration needs A2A 0.3 and is **not** supported.

## 13. OpenAI integration

Real routes: Responses API `type:"mcp"` (bearer in `authorization`) and function calling against the OpenAPI. Config in `examples/integrations/openai-responses.json`, checked against the live tool names. ChatGPT custom connectors need OAuth: TastePolicy now runs an OAuth 2.1 authorization server (ADR 0022; protocol tested end to end against our own client and a real server) but **no live ChatGPT connection was made**. No model-driven run was performed (no OpenAI credentials).

## 14. Claude integration

Real routes: Claude Code (`claude mcp add --transport http` / `.mcp.json`), Agent SDK (`mcpServers` headers), Messages API MCP connector (beta `mcp-client-2025-11-20`). claude.ai connectors accept request headers (human-only to configure). No Anthropic model-driven run was performed.

## 15. Gemini integration

Real routes: Interactions API `mcp_server` tool with headers (Google's docs contradict themselves on Gemini 3 remote-MCP support; unverified), Google ADK `McpToolset` and `RemoteA2aAgent`, Gemini/Antigravity CLI config. Gemini Enterprise registration unsupported (A2A 0.3, end-user OAuth). No Gemini run was performed.

## 16. Qloo relationship

Qloo supplies cultural-affinity evidence to the one evaluator; it never authorizes. Provider unavailability yields UNAVAILABLE, recorded as such; receipts read recorded evidence and make no Qloo call. Policy, leases and attestations make no provider call.

## 17. Passport model

A private Passport per account with opaque `passportRef` (`tp_`+48 hex) and an independent public `subjectRef` (`tps_`+48 hex); internal profile ids never appear. Sharing is by authenticated, expiring, revocable grants with per-scope consent. Export and hard deletion are real and cascade.

## 18. Policy model

`PolicyDocument` v1: freshness days per evidence class, autonomy per default/kind/agent with an optional spend limit. Evidence classes are a fixed function of state-entry kind. Documents are validated strictly (bounded, enumerated).

## 19. Freshness model

Per class (`EXPLICIT_POSITIVE`, `CONTEXTUAL`, `EXPLORATION`): if the newest applicable entry is older than the person's limit, an ALLOW becomes ASK (`STALE_EVIDENCE`). Only ALLOW is lowered. Empty classes are never stale.

## 20. Conflict precedence

Base decision → hard rules final (`USER_HARD_BLOCK`, `CONTEXT_CONSTRAINT`, UNAVAILABLE) → freshness → autonomy ceiling → temporary override. Deterministic, order of overrides irrelevant, ignored overrides reported in the trace with the winning step named.

## 21. Progressive autonomy

Levels `OBSERVE`, `CONFIRM_ABOVE_LIMIT`, `AUTONOMOUS`; agent beats kind beats default; unknown price under a limit asks. Raising autonomy needs a fresh sign-in; lowering does not. The system may suggest promotion from recorded history; it never applies it.

## 22. Temporary overrides

User-authored, scoped (candidate, situation or kind; an agent alone is invalid), 1–30 days, revocable. `ALLOW_THROUGH_ASK` converts ASK; `ALLOW_THROUGH_CULTURAL_REJECT` additionally needs explicit confirmation and an exact candidate. Neither reaches a hard rule.

## 23. Simulation

`policy-simulate`, `policy-impact` (last 200 recorded evaluations), `policy-explain` re-run the same pure function on recorded inputs: no provider call, no persistence, no drift from live behaviour. Counterfactuals list only single changes that were re-run and confirmed to flip the answer; entry removal is shown as a user action, never taken.

## 24. Receipt model

Cultural Receipt v1 and the platform receipt wrapper are unchanged; a response under a policy adds `policy:{version, baseDecision, trace}` and the receipt keeps the recorded base decision. Receipts are recorded evidence; reading one makes no provider call. Strings supplied by agents (candidate name) are untrusted display text.

## 25. Lease model

See §6 and ADR 0016. Request from an ALLOW (active) or from an ASK of kind `AUTHORITY_CONFIRMATION` (pending the person's answer; approval is explicit, may shorten lifetime, never extend; refused if state, policy, grant or evaluation freshness changed). A `CLARIFICATION_REQUIRED` ASK cannot be leased or approved (ADR 0019). TTL 60 s–24 h, checkpoints, lazy expiry. Revocation propagation is pull-based and immediate: verification is authoritative and uncacheable; owner can end one lease or all. No push notification (limitation).

## 26. Attestation model

SD-JWT, `typ: dc+sd-jwt`, always-visible `iss`, `aud`, `iat`, `exp`, `jti`, `vct`, `authority`, `status`; selectively disclosable `decision`, `permitted`, `candidate_id`, `candidate_name`, `context_key`, `agent_id`, `policy`, `delegate_agent_id`. No lease, Passport, subject or account identifier. `exp` ≤ earliest of lease expiry, next checkpoint, Passport expiry, grant expiry, 15 minutes. Optional P-256 key binding with a verifier nonce.

## 27. Issuer/verifier model

Issuer id is the pinned `TASTEPOLICY_PUBLIC_ORIGIN`; one ES256 key from `TASTEPOLICY_ATTESTATION_KEY` (never generated, never served), published as public parameters at `/.well-known/jwt-vc-issuer` and `jwks.json`, `kid` = RFC 7638 thumbprint, retired keys via an env JWKS. Verifier checks algorithm allow-list, `typ`, issuer/key from configuration only (never from the token), signature, time, audience, `vct`, authority, disclosure integrity (unique, referenced, no claim-name collisions), key binding (nonce, audience, `sd_hash`), status list (signature, `sub`, freshness, bounds, size cap), lifetime cap and replay (per issuer+audience, consumed last). Status fetching is SSRF-defended (HTTPS only, parsed-address `BlockList`, connection-time validation, no redirects, size and absolute-time caps).

## 28. Federation

No federation protocol. A verifier holds an explicit trust list (issuer, keys, accepted `vct`); tested with a second independent issuer, which is rejected unless listed and cannot be vouched for by another issuer's key. OpenID Federation 1.0, ETSI trust lists, `did:web` and wallet protocols are out of scope (ADR 0017/0018).

## 29. Security threat model

Assets: the person's preference state; the authority boundary; credentials; issuer key. Adversaries: a malicious or buggy agent; a relying party; an anonymous network client; a co-issuer; an insider with DB read. Controls: scoped hashed credentials; owner-only authoring; fresh sign-in for loosening; ownership masking; idempotency and optimistic concurrency; tamper-evident event logs checked on read; RLS and immutability triggers; algorithm and `typ` pinning; configured-only trust; disclosure integrity; replay store; SSRF defence; fail-closed status; bounded inputs everywhere. Two independent security reviews (the M6 surfaces and the M9 attestations) found no way to forge, revive or replay a proof; every finding was fixed or documented (`docs/evaluation/m6-connect-review.md`, `m9-verify-review.md`). Residual: single env-held signing key; per-instance public rate limiting; bearer proofs without key binding are replayable within their ≤15-minute life by anyone who sees them (prefer binding).

## 30. Privacy model

Minimal by construction: proofs carry no taste data or identifiers; the holder chooses disclosures; each proof has its own status index so relying parties cannot link proofs of one lease; lists reveal only anonymous statuses (herd privacy depends on list fill, stated). Owner sees every proof issued, to whom and until when. Credentials read only a resolved policy summary, never history or overrides. Deletion cascades and invalidates proofs. Residual: `candidate_name` is agent-supplied and, once signed, travels with the proof.

## 31. Revocation

Lease → status bit in the same transaction (SQL trigger), including cascade deletion; policy publish, override end, grant revoke and Passport update settle live leases in-transaction. Visible externally after the signed list is next served: HTTP cache 60 s, signed-list reuse only while unchanged and ≤30 s, verifier freshness rule `ttl` + skew. Time-based endings are covered by the proof's own `exp`. A resumed lease does not re-validate earlier proofs: leaving ACTIVE invalidates the epoch's proofs permanently and resume starts a new epoch (ADR 0020).

## 32. Reliability

Idempotency keys on every mutation; optimistic version checks; row locks; advisory lock for index allocation; unique live-lease index; lazy time and drift (no job needed); event-log replay reconstructs every lease; failures fail closed. Restart safety rests on PostgreSQL; serverless instances share no state except the database (the public limiter is the one per-instance component).

## 33. Observability

Every response carries `X-Request-ID`; errors are catalogued codes with `retryable`; `/api/health` is liveness; `/api/ready` reports database, migration (0008 present), authentication, attestation and provider configuration without values. Audit timelines exist for leases and proofs. **No metrics/tracing backend is wired** (limitation); Vercel logs are the only runtime telemetry and request bodies/credentials are never logged.

## 34. Performance

Bounded by design: 16 KiB bodies, 30 authenticated requests/min/account, 100 evaluations/day/subject, 200-evaluation impact windows, 32 KiB status lists, signed-list reuse. **No load or latency testing was performed**; no numeric performance claims are made.

## 35. Developer experience

OpenAPI, typed SDK errors with `retryable`, offline sandbox (every decision and failure), vendor examples, `docs/developer/integrations.md`, a verifier kit, 35 conformance vectors, `/verify`, the inspector. Hosted use needs three configuration blocks (auth/database; `TASTEPOLICY_PUBLIC_ORIGIN` + attestation key; provider) documented in the product pages.

## 36. Brand system

THE BOUNDARY (taste | permission) carries the idea across screens: expressive taste on the left, precise structure on the right, its split showing how far taste alone decides (`RuleBoundary` in the control plane; the journey variant in the consumer arena). Instrument Serif headings, Inter body, theme tokens for light and dark.

## 37. Consumer UX

Plain language throughout: "Ask me every time / above a limit / Let it decide", "Skip the question and allow", agent questions answered with a duration, "Stop all agents", history in human words, preview before publishing. The WG-B progressive consumer journey is preserved.

## 38. Accessibility

Automated: axe-core WCAG 2.1 A/AA scan of the four new pages in light and dark (8 scans, zero violations, rule count asserted). Specs also check mobile overflow at 390 px, keyboard reachability, reduced motion, 44 px targets and live regions. Not done: assistive-technology testing and a human audit.

## 39. Test architecture

Pure logic (policy engine, lease machine, attestation library) in unit tests with seeded random sequences; the service layers on real SQL in PGlite through the whole migration chain; protocol conformance with the official MCP and A2A clients and the independent `@sd-jwt/sd-jwt-vc`; cross-surface conformance; Playwright with intercepted transport for UI; axe; an integrated story test; example checks; secret/bundle scans. PGlite is PostgreSQL but not a hosted multi-client deployment.

## 40. Conformance

`conformance/attestation-vectors-v1.json` (35 vectors, fixed context, regenerated by `npm run conformance:attest:generate`) and `npm run conformance:attest -- adapter.mjs [--strict-reasons]`; "TastePolicy Compatible" is a stated profile for verifiers (`docs/conformance/tastepolicy-compatible.md`), not a certification. Official MCP conformance package and `a2a-tck` were not run.

## 41. Deployment architecture

Next.js 16 on Vercel (one preview per branch), PostgreSQL via `DATABASE_URL`, migrations applied by `npm run db:migrate*` scripts in order (0001→0008), configuration only through environment variables, no secret in client bundles (scanned). The Vercel project currently holds database and provider variables only for the Win Gate branch; M6–M9 hosted persistence/auth/issuer proof is therefore **blocked**, not claimed.

## 42. Known limitations

Hosted persistence/auth/attestation proof on a Vercel preview not performed (needs a dedicated database and branch-scoped secrets; the same acceptance script passes against a local server on real PostgreSQL). ChatGPT/claude.ai connectors are protocol-ready but not live-tested; Gemini Enterprise A2A registration is unsupported. No vendor model-driven runs. The official MCP conformance suite was run: the protocol scenarios pass, scenarios that need the suite's reference fixture server are not applicable; no A2A TCK is installable. No metrics backend, no load testing, no push revocation notification. Signing key is an environment secret, not an HSM. SD-JWT VC and Token Status List are drafts. Public rate limiting is best-effort per instance. Flaky `trajectory.test.ts` timeout (inherited). Merge into `main` is pending the Win Gate.

## 43. Future expansion boundaries

Not authorized here (M10 and beyond): push revocation; hardware-backed keys; group/proxy attestations; multi-hop delegation; wallets (OpenID4VCI/VP); federation protocols; payments or any execution authority (never in scope). Each would need its own ADR; none may weaken §8.

## 44. Repair program R1–R5 (what changed after the first freeze)

| Repair | Defect found by review                                           | Fix                                                                                                                                                                                                      | Record                 |
| ------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| R1 M8  | Any ASK could be approved, including ones missing a fact (price) | ASK is typed (`AUTHORITY_CONFIRMATION` vs `CLARIFICATION_REQUIRED`); only the first can be leased/approved; approval explicit, bound to the exact choice, re-checked for drift and freshness; UI split   | ADR 0019               |
| R2 M9  | A resumed lease made old proofs valid again                      | Authority epochs; leaving ACTIVE invalidates the epoch's proofs permanently (DB refuses resurrection); resume starts a new epoch; per-audience epoch reference; proofs never outlive relied-on overrides | ADR 0020               |
| R3 M7  | No rule for groups/delegates                                     | Composition over the one engine and the M5 rule; individual veto absolute; temporary permissions personal; delegate rights contract                                                                      | ADR 0021               |
| R4 M6  | No account-linked auth for hosted assistants                     | OAuth 2.1 AS (PKCE S256, CIMD/DCR, consent, audience-bound 15-minute tokens, rotation + reuse detection, revocation), connected-assistants page                                                          | ADR 0022               |
| R5 M9  | "Network" was a manual list                                      | Issuer metadata, trust states, key lifecycle/revocation, `tastepolicy-compatible-v1` suite, consumer `/verify`                                                                                           | ADR 0023               |
| Cross  | Inherited 5 s test timeout; no real-server concurrency tests     | Arranged in a hook; real PostgreSQL suite found and fixed a lock-order deadlock between agent and owner lease operations                                                                                 | `tests/realpg.test.ts` |

## 45. Acceptance state and evidence

Status: **ACCEPTANCE CANDIDATE, not PASS.** Exact-head hosted acceptance on a deployed preview is blocked by missing environment (dedicated PostgreSQL, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `TASTEPOLICY_PUBLIC_ORIGIN`, `TASTEPOLICY_ATTESTATION_KEY`, and `QLOO_API_KEY`/`QLOO_API_BASE_URL`/`QLOO_AFFINITY_SCALE` for the cultural story; variable names only). Evidence that exists: CI `Verify` green on the head (unit, integration, real PostgreSQL service, compatible suite, build, Playwright incl. axe); local live run of `scripts/acceptance/hosted-acceptance.mjs` against `next start` on real PostgreSQL 16 (9 pass, 1 skip for the missing cultural provider); official MCP conformance scenarios initialize/ping/tools-list/dns-rebinding pass; independent `@sd-jwt/sd-jwt-vc` interop; `npm audit` and secret scans per the freeze checklist. Not proven: Qloo-backed hosted story, vendor model-driven runs, live ChatGPT/claude.ai connection, load behaviour at scale, A2A TCK.
