# M9 VERIFY — verifiable attestations

Design records: ADR 0017 (formats and standards), ADR 0018 (trust, status, replay, federation, handoff). Conformance: `docs/conformance/tastepolicy-compatible.md`.

## What it is

A lease (M8) is checked by calling TastePolicy with a credential. An **attestation** lets a third party check it with no credential: a short-lived SD-JWT (RFC 9901) that says _this agent may recommend this choice for this situation until this time_, plus a pointer to a public status list that says whether that has been withdrawn. The holder decides which details to reveal. Everything is cultural authority only (`authority: CULTURAL_ONLY` is always visible and a Compatible verifier rejects tokens without it). It never means a purchase, payment or booking is allowed.

## For an agent (issuing)

`POST /api/v1/attestation` (MCP `tastepolicy_issue_attestation`, SDK `attestation()`), credential scope `TASTE_EVALUATE`, for an **ACTIVE** lease you hold:

```json
{
  "leaseRef": "tl_…",
  "audience": "https://merchant.example",
  "holderKey": { "kty": "EC", "crv": "P-256", "x": "…", "y": "…" },
  "delegateAgentId": "Agent-B"
}
```

`audience` (https origin, required) is who may verify it. `holderKey` (public JWK only) binds it to a key, so a presentation needs a key-binding JWT. `delegateAgentId` (needs `holderKey`) hands a proof to another agent: it names that agent, shows you as `act`, shares the lease's status entry and cannot be handed on. The response lists the claims you may disclose: `decision`, `permitted`, `candidate_id`, `candidate_name`, `context_key`, `agent_id`, `lease_ref`, `subject_ref`, `policy`. Present only what the verifier needs with `present()` (`src/sdk/attest.ts`). Lifetime ≤ min(lease, 15 minutes). A proof is never created for an ASK_PENDING, suspended or ended lease.

## For a verifier

1. **Hosted:** `POST /api/attest/verify` `{presentation, audience, nonce?, dryRun?}`. No credential. `dryRun:true` checks without consuming the proof; otherwise a proof is accepted once per audience (replay protection).
2. **Your own code:** `src/sdk/attest.ts` exports `verifyPresentation`. You configure the issuers you trust (issuer id, keys from `/.well-known/jwt-vc-issuer`, accepted `vct`) and your audience; nothing is discovered from the token. It checks algorithm allow-list, `typ`, issuer and key, signature, time, audience, `vct`, authority statement, disclosure integrity, key binding (nonce, audience, `sd_hash`), status list (signature, `sub`, expiry, bounds, size), and replay if you give it a store. Fetch status lists with `fetchStatusList` (HTTPS only, address validated at connect time, no redirects, 64 KiB, 3 s).
3. **Conformance:** `npm run conformance:attest -- your-adapter.mjs`. 34 vectors.
4. Or paste a proof into `/verify`.

## Status and propagation

Public `GET /api/attest/status/{id}` serves a `statuslist+jwt` (2-bit; 131,072 entries; `ttl` 60 s). The lease's entry moves in the **same database transaction** as every lease change (a trigger calls one SQL function), including revocation, suspension, expiry handling and Passport or account deletion. Policy publish, ending an override, revoking a grant and updating a Passport settle all live leases of that Passport in the same transaction. So withdrawal is visible when the change commits, then bounded by the list's `ttl` and verifier caching. Time-based expiry is carried by the attestation's own `exp` (≤ 15 minutes). Indices are random and never reused.

## Keys and configuration

| Variable                                       | Meaning                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `TASTEPOLICY_PUBLIC_ORIGIN`                    | issuer id and status URI base (https; pins discovery documents)                            |
| `TASTEPOLICY_ATTESTATION_KEY`                  | ES256 private JWK; never logged or served                                                  |
| `TASTEPOLICY_ATTESTATION_PREVIOUS_PUBLIC_KEYS` | JWKS of retired public keys so older proofs stay checkable                                 |
| `TASTEPOLICY_TRUSTED_ISSUERS`                  | optional co-issuers the hosted verifier trusts: `{"https://other":{"jwks":{…},"vct":[…]}}` |

Without them issuing and the hosted verifier answer `NOT_CONFIGURED`; there is no default or generated key. Key custody is an environment secret, not an HSM. Apply the migration with `npm run db:migrate:attestations`.

## Privacy

Always visible: issuer, audience, times, `jti`, type, authority statement, status pointer. Never present in any attestation: state entries, taste data, provider evidence, Passport or account identifiers. Even `subject_ref` is optional to disclose. The status list reveals only an anonymous status at a random index; its herd privacy depends on how full the list is. The owner sees every proof issued, for which audience and until when, in `/account/leases`.

## Limits

No OpenID4VCI/OpenID4VP, no wallets, no `did:web`, no W3C VC JSON-LD, no federation protocol (an explicit trust list instead), no multi-hop delegation, no hardware-backed key. SD-JWT VC and Token Status List are IETF drafts as of 2026-10-24; this profile is aligned with them, not certified.
