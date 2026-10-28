# ADR 0029 — Unified authority timeline

Status: accepted (final reconciliation).

A derived, owner-only, privacy-redacted read model (`POST /api/account/timeline`, page `/account/timeline`, builder `src/lib/timeline/authority-timeline.ts`) over append-only records: evaluations and their policy decisions, state versions, policy versions, overrides, lease events (issue, approve, decline, checkpoint, pause with reasons, resume with epoch, end), issued proofs (and a "proofs stopped being valid" entry per ended epoch), grants and credentials with their revocation times, and connected assistants. It decides nothing, stores nothing and can be rebuilt. Identifiers are shortened to eight characters; no state hash, account id, secret, attestation or full reference is included. Same-instant events are ordered causally so the story never reads backwards.
