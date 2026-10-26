# Threat model and review record (living)

Evidence class for every row: **LOCAL / CI** (tests in this repository) unless stated. No row is a claim about a hosted deployment; see `docs/evaluation/r6-hosted-acceptance.md`.

## Boundaries

ALLOW is preference authority only. Qloo affinity, memory, a recommendation and a verified proof are not authorization. UNAVAILABLE is never REJECT. A delegate cannot silently gain authority. Group members are decided independently before aggregation. Old authority epochs never become valid again.

## Identity, session, OAuth

| Threat                                           | Control                                                                                                                       | Test                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Account takeover / stale auth for sensitive acts | recent sign-in for widening policy, approvals, key creation, deletion                                                         | `lease.test.ts`, `ladder-service.test.ts`, `policy.test.ts` |
| CSRF / origin                                    | origin check on cookie-session POSTs; JSON only                                                                               | `platform.test.ts`, `oauth-routes.test.ts`                  |
| OAuth redirect abuse, PKCE downgrade             | exact redirect match, S256 only, direct error pages for client/redirect errors                                                | `oauth.test.ts`                                             |
| Refresh theft / reuse                            | rotation, atomic single use, reuse revokes the family, client binding checked before spending, 90-day cap, live user required | `oauth.test.ts`, `realpg-m6.test.ts`                        |
| Audience confusion                               | OAuth tokens are MCP-only; REST refuses them                                                                                  | `oauth.test.ts`                                             |
| CIMD / DCR abuse                                 | guarded fetch (https, connect-time address check, no redirects, size/time caps); client table capped, oldest unlinked evicted | `oauth.test.ts`, `safe-fetch` tests                         |
| Rate-limit bypass by header rotation             | client identity headers believed only on Vercel or a named trusted header; IPv6 keyed by /64                                  | `client-key.test.ts`, `review-fixes.test.ts`                |
| Sign-in starved by anonymous traffic             | separate sign-in limiter                                                                                                      | `client-key.test.ts`                                        |
| Deleted account keeps assistants                 | deletion revokes linked families; refresh needs a live user                                                                   | `oauth.test.ts`                                             |

## Authorization and policy

IDOR / cross-account: opaque references are never bearer capabilities; every read re-checks ownership or a live grant (`platform.test.ts`, `subjects.test.ts`). Scope escalation: per-tool scopes in the shared gateway, including through A2A operations (`a2a-authority.test.ts`). Policy widening: `classifyPolicyChange` compares effective behaviour; MIXED counts as widening. Action-ladder bypass: omitted `requestedAction` does not loosen; org ceiling wins over earlier ASK and cannot be lifted by confirmation or override; resume recomputes the ladder; prototype-key agent names resolve to nothing (`policy-ladder.test.ts`, `review-fixes.test.ts`, `ladder-service.test.ts`). Hard rules, UNAVAILABLE and group vetoes are final.

## Runtime

Stale evaluation (state/policy/grant/override/candidate/context drift), TOCTOU (revalidating transaction after the provider call), concurrent issuance (unique live-lease index), lock ordering (accounts before lease rows), lease revival (terminal states absorb), expiry extension (approval/checkpoint/resume only shorten) — `lease.test.ts`, `lease-commitments.test.ts`, `evaluate-lifecycle.test.ts`, `realpg-m8.test.ts`, `realpg-load.test.ts`. Typed ASK: only AUTHORITY_CONFIRMATION can become a pending lease.

## Attestation and verification

Algorithm/`kid`/`jwk` header confusion, revoked and unknown keys, issuer and audience confusion, replay (consumed last), holder-key binding (nonce, audience, `sd_hash`), disclosure tampering, status-list tampering and bounds, epoch resurrection (database function plus a guard trigger so direct writes are refused), status lists must carry `ttl` and not be from the future, commitment comparison with explicit failure reasons, discovery never grants trust, key ids must equal thumbprints — `attest-*.test.ts`, `federation` cases in `attest-service.test.ts`, conformance vectors (40 + commitments + ladder).

## Protocol

JSON-RPC: version header required, batches/arrays refused, bounded bodies, closed operation allowlist, foreign tasks masked as not found. SSRF: all outbound fetches (CIMD, status lists, issuer metadata) go through the guarded fetcher.

## Independent review record

Four fresh reviewers read the code without the author's conclusions (three slices; a first single reviewer returned nothing and was replaced). Two slices returned reports; findings and dispositions:

| Finding                                                                        | Severity (reviewer) | Disposition                                                                                             |
| ------------------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------- |
| Organization ceiling bypass when an earlier rule already made the answer ASK   | High                | **Fixed**; regression test                                                                              |
| Resumed lease kept its wider original ladder                                   | Should-fix          | **Fixed**; regression test                                                                              |
| Prototype-key lookups on agent-keyed maps                                      | Should-fix          | **Fixed**; regression test                                                                              |
| Empty verifier `expect` silently compared nothing                              | Medium              | **Fixed** (refused)                                                                                     |
| IPv6 /64 rotation and single shared bucket without a trusted proxy header      | Medium              | **Fixed** (/64 keys, startup warning); the shared-bucket case is documented as stricter-not-looser      |
| Admission pinned retired/unlisted keys                                         | Low                 | **Fixed** (active and next only)                                                                        |
| Status list without `ttl`; future `iat`                                        | Low                 | **Fixed**; a 5 s leeway keeps same-moment issuance valid                                                |
| Limiter fails open on database error                                           | Low                 | **Fixed** (tightened per-instance budget while degraded)                                                |
| "INVALID is permanent" only inside `set_status`                                | Low                 | **Fixed** (migration 0010 guard trigger)                                                                |
| Global per-process budget shared by anonymous sign-in and authenticated agents | Should-fix          | **Fixed** for sign-in (own limiter); the authenticated MCP/A2A budget stays per instance (**residual**) |
| Dynamic registration can fill the client table                                 | Should-fix          | **Fixed** (evict oldest unlinked)                                                                       |
| Rate limiting trusted client-supplied headers off Vercel                       | Should-fix          | **Fixed**                                                                                               |
| Deleted account's OAuth families not revoked                                   | Worth considering   | **Fixed**                                                                                               |
| Hosted verify with `dryRun:false` burns the `jti` for an unbound proof         | Low                 | **Accepted, documented**: unbound proofs are first come; use holder binding or verify locally           |
| Self-asserted client names                                                     | Worth considering   | Accepted: consent shows the client host and redirect host                                               |
| Wrong-client redemption burns a code                                           | Worth considering   | Accepted: 256-bit, 120 s code                                                                           |
| `trustedOrigin` compares `Origin` with `Host`                                  | Worth considering   | Accepted for now; pinning to the public origin is future work                                           |
| Unauthenticated MCP requests cost one database lookup                          | Worth considering   | Accepted residual                                                                                       |
| Grantee evaluations count against the owner's daily quota                      | Worth considering   | Accepted: requires a valid grant from the owner                                                         |

One slice (attestation and crypto) found no remote authentication bypass; the policy/lease slice found the High above. Not done: a third-party penetration test; fuzzing; a formal proof.
