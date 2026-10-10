# ADR 0002: Explicit provider boundaries

Status: Accepted design intention.

## Context

Qloo, LLM vendors, persistence and agent transports have separate trust, failure and data contracts. Vendor payload leakage makes policy difficult to test.

## Decision

Use explicit adapters/interfaces and dependency injection. Qloo supplies cultural evidence; LLMs assist interpretation; persistence handles storage; transports translate requests. Normalize results/errors into domain contracts. Credentials stay server-side. Missing configuration means unavailable, never simulated success.

## Consequences

Tests inject doubles without live keys. Translation is required at boundaries. Only the Qloo contract/location is established now; concrete integrations are deferred.
