# ADR 0027 — Federation-compatible issuers: discover, inspect, explicitly trust, verify

Status: accepted (final reconciliation). Extends ADR 0023.

What exists: `inspectIssuer(origin)` fetches `/.well-known/tastepolicy-issuer` and the JWKS through the SSRF-guarded fetcher and reports metadata problems, key states (ACTIVE, NEXT, RETIRED, REVOKED, UNLISTED) and that **trust is UNKNOWN**. `admitIssuer(inspection, {issuer, activeKid})` returns the verifier entry only if the inspection is clean and the caller confirms the issuer and the active key id, which must be obtained out of band. Key ids must equal the key's own thumbprint (a published key cannot borrow another's name). Only the ACTIVE and NEXT keys are pinned; declared-revoked keys are excluded. Nothing is stored: the operator puts the entry in `TASTEPOLICY_TRUSTED_ISSUERS`. `npm run issuer:inspect -- <origin> [--confirm-kid <kid>]` prints the inspection and, only with the confirmation, the entry.

What does not exist: automatic admission, a registry, a web of trust, cross-issuer revocation propagation, ledger infrastructure. Self-hosted issuers that publish the same documents and follow `tastepolicy-compatible-v1` can be admitted the same way.

Verifier results now separate `signature` (VALID, INVALID, NOT_CHECKED) from `trustedAuthority`: a proof signed by an issuer you hold but have marked UNTRUSTED is `signature: VALID, valid: false`.
