# TastePolicy — Canonical Architecture & Milestone Journey v2

Status: **AUTHORITATIVE PRODUCT AND MILESTONE DIRECTION**

Effective: 2026-10-14

This document supersedes earlier TastePolicy architecture and milestone ordering where they conflict with it. It does not invalidate verified implementation evidence. Runtime truth remains the latest verified merged code; until M1 is merged, the exact reviewed M1 head is `0063e11f98ee51b9106c67a88229eb7844512fde`.

## North star

TastePolicy is the **cultural authorization, memory and trust layer for subjective AI actions**.

Core separation:

- agents propose subjective actions;
- Qloo supplies cultural intelligence;
- TastePolicy maintains user-controlled state/context and evaluates whether the agent is culturally justified in relying on that evidence under explicit policy;
- TastePolicy returns an auditable record and a bounded continuation contract;
- an LLM may help orchestrate or phrase explanations, but it must not silently become policy truth.

Long-term product statement:

> Any AI agent can propose a subjective action. TastePolicy determines whether sufficient cultural evidence, contextual justification and bounded authority exist to proceed—and produces a verifiable record explaining why.

TastePolicy is not fundamentally a travel recommender, restaurant finder, entertainment recommender, itinerary generator, generic chatbot or Qloo wrapper. Those may be use cases, not the product identity.

## Canonical runtime architecture

```text
ANY AGENT / APPLICATION
        |
        | proposed subjective action
        v
AGENT GATEWAY
        |
        v
EVALUATION ORCHESTRATOR
        |
        +------ Taste State
        +------ Action Context
        +------ Applicable Feedback
        +------ Structured Constraints
        |
        v
CONTEXTGRAPH / APPLICABLE STATE PROJECTION
        |
        v
CULTURAL EVIDENCE LAYER
        |
        v
QLOO ADAPTER
        |
        v
NORMALIZED EVIDENCE
        |
        +-------------------+
        v                   v
POLICY ENGINE        STABILITY ANALYZER
        |                   |
        +---------+---------+
                  v
        AUTHORIZATION DECISION
                  |
        ALLOW / ASK / REJECT
                  |
          +-------+-------+
          |               |
          v               v
 CLARIFICATION      COUNTERFACTUAL
    PLANNER            / REPAIR
                  |
       + separate UNAVAILABLE
         whenever required evidence
         cannot be established
                  |
                  v
 CULTURAL AUTHORIZATION RECEIPT
                  |
                  v
 AGENT CONTINUATION CONTRACT
                  |
                  v
            CALLING AGENT
                  |
                  v
               FEEDBACK
                  |
                  v
             TASTE STATE
```

Conceptual boxes do not imply separate deployable services. The canonical implementation strategy remains a modular monolith until evidence justifies distribution.

## Domain boundaries

### Qloo Adapter

Owns provider transport/normalization only:

- entity resolution;
- cultural discovery;
- candidate-specific evidence;
- explainability when available;
- provider provenance;
- explicit provider failures.

Qloo does not own durable Taste State, user consent, policy, feedback semantics or authorization.

### Taste State

Versioned, user-controlled, user-attributable state. Examples include explicit likes/dislikes, explicit exploration intent, durable scoped feedback, contextual preferences and explicit constraints.

Provider inference is not automatically durable user state. `STALE`/`UNCERTAIN` are metadata, not preference types. Hard blocks belong to policy/constraint state even if persisted with the profile.

### ContextGraph

A deterministic, provenance-aware projection over Taste State, action context, evidence, constraints, feedback, proposal and decision path. It is reconstructable rather than the canonical database. Graph failure must never invalidate an otherwise valid authorization decision.

### Policy Engine

Evaluates explicit state, constraints, context, applicable feedback and normalized cultural evidence. It remains deterministic wherever practical and returns `ALLOW`, `ASK`, `REJECT` or `UNAVAILABLE`.

### Decision precedence

1. Structural validation.
2. Applicable independent hard user/policy block → `REJECT`, even if Qloo is unavailable.
3. No hard block + mandatory cultural evidence unavailable → `UNAVAILABLE`.
4. Evaluate remaining cultural/context components.
5. Remaining precedence: `REJECT > ASK > ALLOW`.

`UNAVAILABLE` remains semantically distinct from negative preference evidence.

### Decision basis

Future decisions should expose a structured basis such as:

- `USER_HARD_BLOCK`;
- `CONTEXT_CONSTRAINT`;
- `CULTURAL_POLICY`;
- `CULTURAL_PLUS_CONTEXT`;
- `UNRESOLVED_CONTEXT`;
- `REQUIRED_EVIDENCE_MISSING`.

### Cultural affinity vs evidence quality

Qloo affinity is not authorization confidence or probability of individual preference. Do not invent a composite confidence percentage. Prefer independent fields such as affinity, evidence sufficiency, evidence completeness, decision stability, policy basis and unresolved factors.

### Stability Analyzer

A first-class analysis subsystem that reuses the same evaluator under bounded, defensible perturbations. It reports **policy decision robustness**, not statistical certainty. It must not treat unrelated raw Qloo scores as universally comparable.

### ASK / Clarification Planner

`ASK` identifies a structured decision-relevant unresolved factor. The planner selects an applicable clarification; an LLM may phrase the question but does not decide policy relevance. The answer becomes provenance-aware evidence before re-evaluation.

### REJECT / Counterfactual Repair

The Counterfactual Engine seeks the smallest policy-respecting change that can move a proposal toward `ASK` or `ALLOW`, while preserving already-satisfied constraints. Full repair depends on persistent state/context and is not an M1 concern.

### Cultural Authorization Receipt

The audit artifact recording proposal, candidate, state/context references, Qloo evidence, provenance, evidence completeness, policy/rules, decision, decision basis, stability when evaluated, unresolved factors and schema/version information.

The receipt records what happened; it is not broad execution authority.

### Agent Continuation Contract

Separate from the receipt. It translates the cultural authorization result into a bounded machine contract for the calling agent, e.g. TastePolicy may permit `recommend` or `add_to_draft_itinerary` while explicitly stating that booking, spending, purchasing or sharing private information still require external authority.

### TasteBench

Evaluation infrastructure outside the runtime authorization path. It eventually compares generic LLM, LLM + Qloo, Qloo + deterministic policy, full TastePolicy and TastePolicy after applicable feedback. Use defensible metrics only; do not invent subjective accuracy without ground truth.

### TasteTrajectory

Future intentional cultural exploration using explicit user intent, Qloo relationships, exploration tolerance and feedback.

### TasteProxy

Future delegated/group taste with explicit separation between self taste, an explicit model of another person, group policy and inferred audience profile. Never silently merge identities or default to naive averaging.

## Source-of-truth precedence

1. Latest verified merged `main` for implementation truth.
2. This canonical architecture document for product/milestone direction.
3. Explicitly approved milestone-specific contract.
4. Latest live verification evidence for provider semantics.
5. Older prompts/documents only as historical context where not superseded.

New research may refine later milestones but must not retroactively destabilize verified work unless it reveals a real correctness/security problem.

# Canonical milestone journey

## M1 — Real Qloo Cultural Authorization Vertical Slice

Status: **IMPLEMENTED + LIVE ACCEPTED** on reviewed head `0063e11f98ee51b9106c67a88229eb7844512fde`.

Established:

- real Qloo entity resolution;
- five reviewed explicit signals across domains;
- cross-domain discovery;
- candidate-specific evidence;
- verified unit affinity scale;
- complete/partial/unavailable explainability semantics;
- deterministic policy;
- `ALLOW / ASK / REJECT / UNAVAILABLE`;
- Cultural Receipt v1;
- deterministic repeat;
- unmocked production-build browser proof;
- CI/security/test rigor.

Before merge only **M1-T — Final Truth Sync** is authorized.

## M1-T — Final Truth Sync

Purpose: synchronize public repository documentation with verified M1 reality. No runtime or policy change.

Acceptance:

- stale `REPAIR` status removed from current-truth documents;
- verified 15-second bounded provider deadline documented;
- live identity/scale/explainability acceptance recorded accurately;
- historical REPAIR report clearly marked historical and linked to final acceptance;
- canonical architecture journey version-controlled;
- validation/CI green;
- independent diff review.

After pass: merge PR #1 only with explicit approval.

## M1.5R — Verified Demo Reconciliation

Purpose: reconcile the existing M1.5 presentation/accessibility work onto verified M1 without overwriting live-provider truth.

Includes:

- M1.5 judge-facing UI/accessibility/mobile improvements;
- real Cultural Receipt presentation;
- live/synthetic/unavailable labeling discipline;
- minimal-click **Judge Mode**;
- final submission narrative and demo path.

Acceptance: a judge can move from homepage to a real cultural authorization and inspect the receipt without an account, secret setup or architecture knowledge.

Out of scope: persistence, ContextGraph implementation, feedback learning, counterfactual repair, full MCP/TasteBench.

## M1.6 — Proof & Interoperability

Purpose: prove what TastePolicy adds beyond ordinary recommendation and show that another agent can consume it.

### M1.6A — Signature Cultural Receipt

Make the human-readable receipt memorable/shareable while preserving truthful machine-readable semantics. No fake confidence metric.

### M1.6B — Comparison Mode

Reproducible, honestly controlled comparison of generic AI vs Qloo-grounded behavior vs TastePolicy authorization. Do not manipulate prompts to manufacture a win.

### M1.6C — Stability-lite

Bounded decision-robustness analysis, beginning with defensible perturbations such as leave-one-explicit-signal-out. Compare policy outcomes, not unrelated raw score magnitudes.

### M1.6D — Bounded Agent Interface

Expose semantic operations over the same application services, initially:

- `evaluate_taste_action`;
- `explain_taste_decision`;
- `check_decision_stability`;
- optionally `discover_within_policy`.

A small API and/or MCP adapter is acceptable. No raw Qloo proxy, purchase authority or destructive execution.

## M2 — Persistent Taste State + ContextGraph + Scoped Feedback

Purpose: move from one-off authorization to persistent, versioned, cross-agent cultural governance.

Preserve the previously approved persistence contract:

- immutable state versions;
- optimistic concurrency with `expectedStateVersion`;
- `STATE_VERSION_CONFLICT`;
- idempotency: same key + same canonical payload → original result; same key + different payload → conflict;
- atomic persistent writes;
- scoped feedback;
- deterministic reconstructable ContextGraph;
- protected demo mutation/session boundary;
- historical replay from captured normalized evidence rather than fresh Qloo.

Feedback scopes:

- `CANDIDATE_ONLY`;
- `CONTEXT`;
- `DOMAIN`;
- `GLOBAL_PREFERENCE`.

Persistence classes:

- `EPHEMERAL`;
- `CONTEXT_SCOPED`;
- `DOMAIN_SCOPED`;
- `DURABLE`.

Acceptance includes state versioning, stale-write conflicts, idempotency, scope isolation, receipt state-version linkage, deterministic graph projection and cross-agent consumption without cross-profile leakage.

## M2.5 — Interactive Authorization

### Clarification Planner

Make `ASK` operational: structured unresolved factor → useful clarification → provenance-aware answer → re-evaluation.

### Counterfactual Repair

Make `REJECT` actionable through bounded minimum-change repair that preserves satisfied constraints and never silently relaxes hard blocks.

## M3 — Full TasteBench

Scientific/reproducible evaluation with human labels where feasible, calibration/evaluation separation and metrics such as policy agreement, unsafe autonomy, excessive ASK, UNAVAILABLE, explicit preference/context violations, deterministic replay, stability, feedback adaptation, latency, provider calls and receipt completeness.

No fabricated metrics or significance claims.

## M4 — TasteTrajectory

Intentional movement through cultural space: current position → adjacent bridge → safe exploration → stretch → feedback → next bridge → target area.

## M5 — TasteProxy + Group Authorization

Delegated taste and group policy with explicit subject identity, consent, provenance and fairness-aware aggregation rather than naive averaging.

## M6 — Platformization

Taste Passport, developer API/SDK, expanded MCP, real authentication, consented state sharing, deletion, expiration, export and portability.

Desired developer experience: one state reference, one policy, one evaluation call, one structured decision, one auditable receipt.

## M7 — Commercial Control Plane

Enterprise policy management, agent identities, autonomy levels, versioned policy composition, authorization monitoring, override reporting, decision analytics, sensitive-category controls and audit.

Potential commercial surfaces include individual Taste Passport, developer API/SDK/MCP, AI-startup authorization platform, business proxy/customer taste infrastructure, enterprise control plane and TasteBench evaluation. A possible long-term unit of value is a **cultural authorization decision**; pricing is intentionally not fixed here.

# Hackathon critical path

```text
M1 live acceptance ✅
        ↓
M1-T final truth sync
        ↓
MERGE M1
        ↓
M1.5R verified demo reconciliation + Judge Mode
        ↓
M1.6 proof & interoperability
  - signature receipt
  - comparison mode
  - stability-lite
  - bounded agent API/MCP
        ↓
M2 persistent Taste State + ContextGraph + scoped feedback
        ↓
M2.5 ASK clarification + REJECT repair (only if schedule/risk permits)
        ↓
SUBMISSION FREEZE
        ↓
FINAL LIVE RECORDING
        ↓
DEVPOST SUBMISSION
```

M3+ must never endanger a stable hackathon submission.

# Permanent boundaries

Unless new evidence materially changes the architecture, do not:

- turn TastePolicy into a generic recommender or Qloo wrapper;
- recreate Qloo's cultural graph;
- treat Qloo affinity as preference probability or authorization confidence;
- fabricate confidence percentages;
- convert provider failure into `REJECT`;
- let an LLM silently determine policy;
- make inferred provider evidence automatically durable user preference;
- contaminate one subject's state with another's;
- imply `ALLOW` grants payment, booking, legal or account authority;
- expose raw Qloo endpoints as the developer product;
- create microservices merely for architectural aesthetics;
- publish fake benchmarks or synthetic data as live.

# Trust principles

Every persistent milestone must account for data minimization, explicit consent, pseudonymization, provenance, state versions, deletion, expiration, portability, explicit-vs-inferred separation, sensitive inference boundaries, cross-agent access control, subject isolation, bounded authority and auditability.

TastePolicy should compete on **trust + control + personalization**, not personalization alone.

# Change control

Every milestone must follow:

1. inspect authoritative state;
2. define exact scope;
3. implement;
4. test;
5. independently review;
6. verify acceptance criteria;
7. merge only with explicit approval;
8. update the authoritative checkpoint;
9. only then begin the next milestone.

No milestone silently expands itself.

# Canonical project sentence

> TastePolicy is a versioned cultural authorization system for AI agents: it combines user-controlled preference/context state with Qloo cultural evidence and explicit deterministic policy to decide whether a proposed subjective action should be allowed, clarified, rejected or left unavailable, then returns an auditable receipt and a bounded continuation contract.
