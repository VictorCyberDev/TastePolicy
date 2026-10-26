# ADR 0017 — Verifiable attestations: formats and standards

Status: accepted for M9. Research of 2026-10-24 from primary pages (IETF datatracker and rfc-editor, W3C, OpenID, npm registry). Items not confirmed from a fetched primary page are marked UNVERIFIED.

## Problem

A lease (ADR 0016) is verified by calling TastePolicy with a credential. A third party (a merchant, another agent, a publisher) has no credential and should not need one. It needs a small, portable statement it can check on its own: _this agent may recommend this choice for this situation, until this time, and this has not been withdrawn_. The statement must say as little as possible about the person.

## Standards used

| Standard                              | Version / status                                                                    | Date        | URL                                                            | Use                                                                                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| SD-JWT: Selective Disclosure for JWTs | **RFC 9901**, Proposed Standard                                                     | Nov 2025    | https://www.rfc-editor.org/rfc/rfc9901                         | container, selective disclosure, key-binding JWT (`kb+jwt`: `nonce`, `aud`, `iat`, `sd_hash`)                                       |
| SD-JWT VC                             | `draft-ietf-oauth-sd-jwt-vc-19`, **not an RFC** (state "Waiting for AD Go-Ahead")   | 31 Aug 2026 | https://datatracker.ietf.org/doc/draft-ietf-oauth-sd-jwt-vc/   | claim vocabulary only: `typ: dc+sd-jwt`, `vct`, `iss`, `iat`, `exp`, `cnf`, `status`; issuer metadata `/.well-known/jwt-vc-issuer`  |
| Token Status List                     | `draft-ietf-oauth-status-list-21`, in the RFC Editor queue, no RFC number confirmed | 21 Jun 2026 | https://datatracker.ietf.org/doc/draft-ietf-oauth-status-list/ | `statuslist+jwt`, 2-bit statuses (VALID, INVALID, SUSPENDED), `status.status_list.{idx,uri}`                                        |
| JWS / JWK / JWT / BCP                 | RFC 7515 / 7517 / 7519 / 8725                                                       | 2015–2020   | rfc-editor.org                                                 | signing, keys, validation rules                                                                                                     |
| JWK Thumbprint                        | RFC 7638                                                                            | 2015        | rfc-editor.org                                                 | `kid`                                                                                                                               |
| Fully-specified JOSE algorithms       | RFC 9864 (`Ed25519`)                                                                | Oct 2025    | https://www.rfc-editor.org/rfc/rfc9864                         | read from the introduction; the "deprecation of polymorphic EdDSA" reading is the researcher's, UNVERIFIED as an explicit table row |

Library: `jose` **6.2.13** (MIT, no dependencies; already present through Better Auth) for all JOSE operations. Signing algorithm **ES256** (holder keys: P-256 only; Ed25519 points are not validated for small order by the platform crypto library) (widest verifier support); `Ed25519` accepted on verification.

## Decision

1. **Format.** An attestation is an SD-JWT (RFC 9901) whose payload follows the claim vocabulary of SD-JWT VC draft-19. We state it as _"profile aligned with SD-JWT VC draft-19"_, never as conformant, because the draft is not final and we skip its Type Metadata, `vct#integrity` and display sections.
2. **Disclosure.** Always visible (needed to verify and to prevent misuse): `iss`, `iat`, `exp`, `jti`, `aud`, `vct`, `status`, `authority` (`CULTURAL_ONLY`, a non-removable statement of the boundary). Selectively disclosable (the owner's proof-privacy setting decides which optional ones exist at all; default MINIMAL, see 0031): `decision`, `permitted`, `candidate_id`, `candidate_name`, `context_key`, `agent_id`, `policy`, `delegate_agent_id`. Lease and Passport identifiers are deliberately absent: they would link proofs shown to different relying parties. No state entries, taste data, provider evidence, Passport or account identifiers are ever included.
3. **Holder binding is optional.** If the holder supplies a public key, `cnf.jwk` is set and presentations must carry a key-binding JWT with the verifier's `nonce` and `aud`. Without it the attestation is a short-lived bearer statement bound only by `aud`, `exp` and `jti`.
4. **Lifetime.** `exp` ≤ min(lease expiry, now + 15 minutes). An attestation never outlives its lease.
5. **Status is a hint, the lease is the authority.** The attestation points to a Token Status List entry that reflects the lease (ACTIVE→VALID, SUSPENDED→SUSPENDED, anything terminal→INVALID). See ADR 0018 for freshness.
6. **Own SD-JWT code, independent cross-check.** Issuance and verification are about 250 lines on `jose`. Pre-1.0 libraries (`@sd-jwt/*` 0.23.x, `@owf/token-status-list` 0.5.0; released almost weekly) are used **only in tests** as independent implementations that must accept what we issue and agree on status lists. They are pinned exactly.

## Not used, and why

- **W3C VC Data Model 2.0, VC-JOSE-COSE, Bitstring Status List** (Recommendations, May 2025 / 13 Oct 2026 per the researcher). Sound, but JSON-LD shape and `@context` handling add attack surface and weight we do not need. The SD-JWT claim set maps onto them if a consumer wants that shape.
- **JSON-LD Data Integrity / BBS.** Canonicalisation and context fetching; not needed.
- **OpenID4VCI 1.0 (final, 16 Sep 2025) / OpenID4VP 1.0 (final, 9 Jul 2025).** Wallet protocols; disproportionate for an issuer and a verifier that already speak HTTPS to each other. We keep their idea of a verifier-supplied `nonce` plus `aud`.
- **did:web.** A W3C Community Group draft, not standards-track; DNS-dependent trust.
- **DPoP (RFC 9449).** Binds OAuth access tokens, not attestations.
- **OpenID Federation 1.0 (final, 17 Feb 2026).** Heavy for a handful of issuers; see ADR 0018.

## Security

- Verifiers pass an explicit algorithm list; `none` and `HS*` are rejected; `jku`, `jwk`, `x5u`, `x5c` header parameters are ignored, keys come only from the verifier's configured issuer keys.
- `typ`, `iss`, `aud`, `exp`, `iat`, `vct` are required and checked. Disclosure digests must be unique and every presented disclosure must be referenced; `sd_hash` is checked on key-binding.
- Private signing key custody is an environment secret, not an HSM. Rotation is by `kid` with the previous public key kept in the JWKS.
- Status list fetching is an SSRF surface; see ADR 0018.

## Compatibility

Our verifier must accept what `@sd-jwt/sd-jwt-vc` issues in the shared subset, and `@sd-jwt/sd-jwt-vc` must verify what we issue. Both directions are tested.
