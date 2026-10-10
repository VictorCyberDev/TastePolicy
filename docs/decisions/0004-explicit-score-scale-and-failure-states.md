# ADR 0004: Explicit score scale and non-decision failures

Status: Accepted for experimental Milestone 1; live calibration pending.

## Context

Qloo's percentage guidance and hosted unit-score glossary differ. Its public item schema does not fully specify affinity/explanation wire fields. Automatically guessing a scale could turn a strong relationship into a mistaken REJECT.

## Decision

Require explicit provider host and affinity scale configuration. Normalize finite values without coercion. Keep provider transport, payload translation, deterministic thresholds and receipt construction separate. Restrict a second query to a server-verified candidate ID; do not authorize from discovery rank. Missing evidence or provider failure produces a typed unavailable result outside ALLOW/ASK/REJECT. No LLM or production mock fallback exists.

## Consequences

The app boots without keys but cannot issue fabricated policy results. Live proof/calibration remains a distinct acceptance gate. Unknown response/explanation shapes require review instead of silent schema guessing. This is safer at the cost of one-time account-specific configuration.
