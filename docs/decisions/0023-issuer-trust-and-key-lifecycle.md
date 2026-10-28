# ADR 0023 — Issuer trust, discovery and key lifecycle (M9 repair R5)

Status: accepted.

## Problem

M9 verified proofs only from issuers a verifier was configured with (a manual list). That is trust-by-configuration, not a network: nothing said how a verifier learns about a new issuer, what discovery may and may not imply, how keys rotate, or what happens when a key is compromised.

## Options read

- **OpenID Federation 1.0** (Final, 17 Feb 2026): trust anchors, signed entity statements, trust chains. Right for large multi-party ecosystems; requires anchors, subordinate statements, policy languages and chain resolution. Far heavier than one profile of three claims needs today.
- **OAuth AS metadata / JWT VC Issuer Metadata**: signed or plain metadata at a well-known URL plus JWKS. Good for discovery, deliberately silent on trust.
- **Operator-curated trust list**: a verifier states which issuers it trusts. Simple, explicit, auditable.

## Decision (simplest that is honest)

1. **Discovery ≠ trust.** Issuers publish `tastepolicy-issuer-metadata-v1` at `/.well-known/tastepolicy-issuer` (issuer, vct, boundary, supported actions, algorithms, jwks URI, key lifecycle, status mechanism, hosted verifier, conformance profile, historical-verification window) plus the existing `jwt-vc-issuer`/`jwks.json`. A verifier may fetch it (SSRF-guarded) to show an issuer, but the metadata sets `trust.discoveryGrantsTrust: false` and the validator rejects documents that claim otherwise. The metadata must not claim more actions than `recommend`/`add_to_draft`.
2. **Trust is a local decision with four states**: `TRUSTED` (explicit entry), `UNTRUSTED` (entry says not, or expired `notAfter`), `REVOKED` (entry withdrawn), `UNKNOWN` (no entry). The reference verifier returns `issuerTrust` with every result and refuses everything but TRUSTED.
3. **Multi-issuer.** hosted / enterprise / self-hosted / partner issuers are separate entries, each with its own JWKS and `vct` allow-list. Entering a partner issuer requires that issuer to pass `tastepolicy-compatible-v1` (a human operator's step; recorded in the entry's provenance, not enforced by code).
4. **Federation.** TastePolicy is **not federated**. A verifier-local trust list is the model today. OpenID Federation is the documented upgrade path when more than a handful of issuers exist; the entry states above map onto trust-chain outcomes.
5. **Key lifecycle.** One active signing key; an optional _next_ public key is published ahead of a switch (so verifiers can cache it); retired keys stay published for the historical window (≥ 1 h: proof life 15 min + status-list lifetime); a **compromised kid** goes into `TASTEPOLICY_ATTESTATION_REVOKED_KIDS`: it is removed from the JWKS, announced in the metadata `keys.revoked`, and verifiers holding `revokedKids` reject it with `KEY_REVOKED` even if they cached it. The configuration refuses to start if the active signing key is listed revoked.
6. **Compromise runbook.** Rotate (new key active, old kid revoked), publish new metadata (`metadataVersion` bump), end all live leases of the affected passports if the compromise could have forged proofs (leases are authority; proofs are views of them), tell partner verifiers to set `REVOKED`/`revokedKids`. Status lists are signed by the same key, so a verifier that revokes the kid also stops trusting lists signed by it.
7. **Suite.** `tastepolicy-compatible-v1` (versioned independently of the draft SD-JWT VC / status-list versions) = attestation vectors (40) + authority semantics (ASK typing, continuation sets, lease epochs) + issuer-metadata vectors, run by `npm run conformance:compatible`.

## Not claimed

Production KMS/HSM, automated trust-list distribution, signed metadata, chain resolution, third-party issuers in the wild.
