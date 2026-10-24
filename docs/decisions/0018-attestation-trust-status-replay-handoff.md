# ADR 0018 — Attestation trust, status, replay, federation and handoff

Status: accepted for M9. Builds on ADR 0016 (leases) and ADR 0017 (formats).

## Issuer and keys

The issuer identifier is the pinned public origin (`TASTEPOLICY_PUBLIC_ORIGIN`). Keys are published at `/.well-known/jwt-vc-issuer` (`{issuer, jwks}`, SD-JWT VC) and `/.well-known/jwks.json`. `kid` is the RFC 7638 thumbprint. The signing key is an ES256 private JWK in `TASTEPOLICY_ATTESTATION_KEY`; an optional `TASTEPOLICY_ATTESTATION_PREVIOUS_PUBLIC_KEYS` keeps retired public keys verifiable. Without a key the service answers `NOT_CONFIGURED`; there is no fallback key and no key is ever generated at runtime in a hosted environment.

## Status

One Token Status List per issuer shard (`bits` 2, size 131,072 entries) served at `/api/attest/status/{id}` as `application/statuslist+jwt`, `ttl` 60 s. An index is chosen uniformly at random among free entries so the index leaks nothing about order or owner, and 131,072 entries give the bitstring-list herd-privacy floor once the list is reasonably full (a nearly empty list gives little herd privacy; documented, not hidden). **Each attestation has its own entry** (the status index is in an always-visible claim, so a per-lease index would let relying parties link proofs of one lease). Status mapping: ACTIVE→VALID (0), SUSPENDED→SUSPENDED (2), ASK_PENDING and all terminal states→INVALID (1).

Propagation is eager. The lease service updates the entry in the same transaction as every lease event, and settles all live leases of a Passport inside the same transaction as: policy publish, override end or revoke, grant revoke, Passport state update and deletion. A lease whose drift would only be noticed lazily is therefore already INVALID/SUSPENDED in the list when the triggering change commits. Time-based endings are noticed lazily, so the issuer clamps `exp` to the earliest of lease expiry, next checkpoint, Passport expiry, grant expiry and 15 minutes; a skipped check-in therefore cannot leave a proof valid longer than the lease was. Status lists carry `exp = iat + 2·ttl` and verifiers reject a list older than `ttl` plus skew. The remaining lag is the list's `ttl` plus verifier caching, stated in `ttl`; a verifier that needs zero lag uses the authoritative lease verification.

## Verifiers

A verifier (`src/lib/attest/verify.ts`, dependency-free apart from `jose`) is configured, not discovered: a list of trusted issuers, each with its keys (inline JWKS or an HTTPS issuer-metadata URL fetched through an SSRF-safe fetcher: HTTPS only, no redirects beyond a small bound, private and link-local ranges blocked, 64 KiB cap, 3 s deadline), the accepted `vct` values and the expected `aud`. It checks, in order: structure, algorithm allow-list, `typ`, issuer allow-list and key, signature, `iat`/`exp` with 60 s skew, `aud`, `vct`, disclosure digests (unique, all referenced, `_sd_alg` sha-256), status entry (list `sub` equals the `uri`, `exp`/`ttl`, `idx` in range, status), key-binding JWT when `cnf` is present, and replay.

The hosted verifier `POST /api/attest/verify` does the same for relying parties that prefer an API. It only trusts this issuer plus any allow-listed co-issuer configured by the operator.

## Replay

`jti` is single-use per (issuer, audience) in a database table (`attestation_replays`, key `(issuer|jti, audience)`); verifiers cap `exp - iat` (default one hour) so retention always outlasts a proof, so serverless instances share it. With key binding the verifier's `nonce` must match the key-binding JWT. A presentation whose `jti` was already accepted for that audience is rejected as replay. Verification that does not consume (`dryRun`) is available for diagnostics and is never used to gate an action.

## Federation

No federation protocol is adopted. The honest minimum is an explicit **trust list** held by each verifier: issuer identifier, JWKS or metadata URL, accepted `vct`, accepted attestation profile version. Cross-issuer verification is tested with a second, independent issuer using different keys; an issuer that is not on the list is rejected. OpenID Federation 1.0 and ETSI trust lists are out of scope (ETSI status UNVERIFIED).

## Cross-agent handoff

Authority is not transferable by copying a token. A holder may ask for a **handoff attestation**: the lease actor requests an attestation for the same lease with `holder_key` (the receiving agent's public JWK) and `delegate_agent_id`. The result is bound to that key (`cnf`), keeps `agent_id` as the lease's agent and names the receiver in `delegate_agent_id` (a label bound to the key, not an identity assertion), is no broader than the lease (`permitted` ⊆ lease, `exp` ≤ lease expiry), follows the lease's status, and **cannot be handed on**: only the lease actor can request issuance, and handoff attestations do not authorise issuance. If the lease is suspended or revoked, every attestation derived from it fails status checks.

## Conformance

`conformance/attestation-vectors-v1.json` holds deterministic positive and negative vectors (fixed keys, fixed clock) and `npm run conformance:attest -- <verifier-module>` runs any verifier against them. "TastePolicy Compatible" is a stated profile (`docs/conformance/tastepolicy-compatible.md`), a checklist plus the vectors. TastePolicy does not certify third parties; a project may state it passes the vectors at a given vector-set version and nothing more.

## Not decided here

Revocation transparency logs, attestation of group/proxy authorizations, multi-hop delegation, hardware-backed key custody, mobile wallets.
