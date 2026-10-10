# ADR 0003: Inspectable policy boundary

Status: Accepted design intention.

## Context

Subjective cultural evidence can be uncertain, but final authorization must be explainable and testable. Hidden prompts cannot be the entire policy implementation.

## Decision

Future ALLOW / ASK / REJECT outcomes use deterministic or explicitly defined evaluation, versioned rules, provenance and tests. LLM interpretation must not silently become the source of truth. Distinguish explicit preferences from inferred taste.

## Consequences

Define uncertainty and escalation semantics before thresholds. Phase 0 provides vocabulary only; no scoring or evaluation exists.
