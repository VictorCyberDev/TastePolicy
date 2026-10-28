# 0031 — Owner-controlled proof disclosure

Status: accepted (final repair). Extends 0017 and 0025.

## Problem

A proof's claims were all issued disclosable, including plain-language ones (`candidate_name`, `candidate_id`, `context_key`, `agent_id`, `policy`). The holder chooses what to show, but the owner had no say in what a proof could carry at all, and the default carried the most.

## Decision

- **Required claims** (cannot be switched off by any setting): `decision`, `permitted`, `permitted_actions`, `candidate_commitment`, `context_commitment`. A proof is unverifiable against a verifier's own choice without them, and they are digests and verbs. `delegate_agent_id` is added whenever a handoff is requested, because dropping it would unbind the receiving agent. Always-visible claims (`iss`, `aud`, `iat`, `exp`, `jti`, `vct`, `authority`, `status`, `cnf`) are unchanged.
- **Optional, human-readable claims:** `candidate_name`, `candidate_id`, `context_key`, `agent_id`, `policy`. Present in a proof only if the owner allowed them.
- **Setting** (`taste-proof-disclosure-v1`, per Passport): `mode` `MINIMAL` (default; no optional claim unless turned on) or `STANDARD` (every optional claim unless turned off), plus per-claim booleans. A required claim, an unknown claim, a non-boolean, an unknown mode or an extra key is `INVALID_INPUT`, never ignored.
- **Default is MINIMAL** and needs no stored row, so every Passport is privacy-preserving until its owner chooses otherwise.
- **Authority to change it:** the signed-in owner session only (agents get `ACCESS_DENIED`). Allowing proofs to say more needs a recent sign-in (as loosening a rule does); saying less never does. It applies to proofs issued afterwards; proofs already issued are short-lived and are not rewritten.
- **Surfaces:** `POST /api/account/proof-privacy-get` and `proof-privacy-set` (account session only; not a credential/MCP/A2A tool). UI: "Proof privacy" on the account page, one checkbox per optional claim and a "Share nothing extra" button. Storage: `tastepolicy.proof_disclosure` (migration 0011).

## Consequences

- Existing integrations that read `candidate_name` and friends from a verified proof now see them only if the owner allowed it. The SDK verifier already treats missing optional claims as absent.
- The commitments remain the verification path: a verifier compares its own candidate/context commitments (`expect`) rather than reading names.
- Not an access control on the verifier: once a claim is disclosed to a verifier, the verifier has it. This setting bounds what a proof can ever reveal, not what a verifier does with what it receives.
