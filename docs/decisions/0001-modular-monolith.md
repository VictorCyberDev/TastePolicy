# ADR 0001: Modular monolith

Status: Accepted design intention.

## Context

Fast hackathon iteration, judge-readable engineering and reproducibility matter more than speculative distributed scaling.

## Decision

Start with a single Next.js application and explicit internal presentation, orchestration, domain and provider boundaries. No premature monorepo or microservices.

## Consequences

One deploy and pipeline reduce operational overhead. Enforce dependency direction in review; extract services only when measured scaling or ownership constraints justify it. Future modules are not implemented yet.
