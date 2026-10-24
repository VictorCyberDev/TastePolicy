# M9 VERIFY — review notes

## Independent security review (13 findings, none allowing forgery, revival or replay bypass)

| #   | Finding                                                                                    | Resolution                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | Proofs could outlive lazily-detected endings (missed checkpoint, grant or Passport expiry) | `exp` = earliest of lease expiry, next checkpoint, Passport expiry, grant expiry, 15 min; tested                           |
| 2   | IPv6 filter bypass (`::ffff:7f00:1`, NAT64, 6to4, Teredo)                                  | address policy is a `BlockList` over parsed addresses; every embedding form blocked; tested in all spellings               |
| 3   | Delegation could name any agent in `agent_id`                                              | `agent_id` stays the lease agent; receiver in `delegate_agent_id` bound to the holder key; documented as a label           |
| 4   | One status index per lease linked proofs across relying parties                            | one random never-reused index per proof, trigger updates all of a lease's entries                                          |
| 5   | Public rate limiter spoofable and shareable                                                | platform-set client identity, per-route pools, hard map cap, signed-list reuse only while unchanged (version-keyed, ≤30 s) |
| 6   | Ed25519 holder keys not checked for small-order points                                     | holder keys are P-256 only                                                                                                 |
| 7   | 32-bit bit math in status lists                                                            | safe-integer math with explicit range check; tested up to 2^53                                                             |
| 8   | Replay key lacked issuer; no lifetime cap                                                  | key `(issuer\|jti, audience)`; `maxLifetimeSeconds` (default 3600); vector N31                                             |
| 9   | Hosted verifier could not require key binding                                              | `requireKeyBinding` option; bearer nature documented                                                                       |
| 10  | Status-list freshness weak                                                                 | `exp = iat + 2·ttl`; verifiers reject lists older than ttl + skew                                                          |
| 11  | SQL: missing uniqueness, new-list race                                                     | `(list_id, idx)` primary key; allocation under an advisory lock                                                            |
| 12  | safe-fetch idle-only timeout                                                               | absolute deadline                                                                                                          |
| 13  | Custom DNS `lookup` ignored `all:true`                                                     | returns arrays when asked; tested                                                                                          |

Also from the review: lease and Passport identifiers removed from proofs; JWKS output rebuilt from public parameters only; REST `attestation` route was missing in `handlePlatform` and is now wired and covered by the OpenAPI/MCP tests; status 404 code renamed.

Considered and not changed: one signing key for proofs and status lists (separated by `typ`, a typ-less validator is out of profile); the `decision`/`permitted` claim names (the always-visible `authority: CULTURAL_ONLY` and `vct` carry the boundary; the doc tells relying parties to treat all strings as untrusted).
