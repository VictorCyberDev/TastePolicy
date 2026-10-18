# TastePolicy — Canonical Architecture v3

Status: **AUTHORITATIVE FUTURE PRODUCT AND M6+ DIRECTION**

Effective: 2026-10-18

M1–M5 implementation truth remains accepted. V3 supersedes [V2](canonical-architecture-v2.md) only where future product positioning or M6+ direction conflicts. V2 remains a historical architecture record; this document does not rewrite accepted policy, provider, persistence or receipt contracts.

## North star

TastePolicy is the **preference authorization layer for autonomous agents**. It determines when an agent has sufficient user-controlled preference state, applicable context, explicit constraints, cultural evidence and permission/delegation to make a subjective decision on behalf of a person or group.

It returns ALLOW, ASK, REJECT or UNAVAILABLE, an auditable receipt and a bounded continuation contract.

> Qloo gives agents taste. TastePolicy gives that taste authority boundaries.

TastePolicy asks: “Is this subjective choice sufficiently justified for this subject?” Qloo supplies cultural evidence; TastePolicy owns preference authority. An LLM must not silently become policy truth. Affinity is not confidence or a probability of individual preference.

## Permanent authority boundary

TastePolicy does not own generic agent IAM, generic enterprise agent governance, generic memory, payment authorization, booking authorization, tool authorization, browser automation, generic A2A infrastructure or Qloo's cultural graph. External systems may own those authorities. A cultural/preference ALLOW never supplies purchase, payment, booking, account, legal-consent, private-data or execution authority.

TastePolicy Passport is a user-controlled **preference authority reference**. Agent identity/passport systems identify agents and operational capabilities. These are separate concepts. A Passport is private by default; possession of a reference alone grants no access. Authenticated grants and scoped credentials remain required.

## Accepted implementation boundaries

The modular monolith and accepted M1–M5 engine remain authoritative: separate subject state, five reviewed anchors, deterministic policy, explicit unavailable evidence, immutable history, reconstructable ContextGraph, bounded clarification/repair, TasteBench, SELF-only TasteTrajectory and UNANIMOUS_NO_VETO_V1 group policy. M5 USER_ATTESTED_PERMISSION and DELEGATE_ATTESTED records remain historically truthful.

The M6 foundation wraps that engine with authentication, private Passport references, authenticated sharing, versioned API, thin SDK, authenticated stdio MCP, continuation, export and deletion. It does not introduce a second policy. Public subjectRef is independent of internal profileId; access-controlled receipt wrappers do not replace Cultural Receipt v1 or persisted StateEvaluation. Hashes are consistency checks, not signed/verifiable M9 artifacts.

## Future sequence and gates

1. **M5 complete** — accepted delegated subjects and explicit group policy.
2. **WIN GATE** — separate guide-owned progression gate; not implemented or completed by this reconciliation.
3. **M6 — Interoperable Preference Authority** — reconcile the existing foundation, then remaining M6G interoperability work only after Win Gate authorization.
4. **M7 — Subjective Policy Control Plane** — future, not authorized here.
5. **M8 — Runtime Preference Authority** — future, not authorized here.
6. **M9 — Interoperable Preference Authorization Network** — future, not authorized here.
7. **M10 — NOT AUTHORIZED**.

This is ordering, not permission to implement later work. The current M6 PR is held Draft and is not merge-ready. This reconciliation does not complete M6.

## A2A: remaining M6G, not current runtime

After the Win Gate, separately authorized remaining M6G work will follow the then-current official A2A specification: standard Agent Card discovery, a Preference Authorization skill/capability, an authenticated interface and mapping to the same existing evaluator. No custom substitute protocol, second policy engine, new agent identity system or payment authority is authorized. A2A runtime is not implemented by this repair.

## Source-of-truth precedence

1. Latest verified merged main for implementation truth.
2. Canonical Architecture v3 for future product/M6+ direction; V2 remains historical and accepted M1–M5 contracts are preserved.
3. Explicit approved milestone/reconciliation contract within guide-owned scope.
4. Verified provider semantics and current live evidence.
5. Older documents only where not superseded.

Independent guide review owns security/privacy, Win Gate progression, A2A timing and merge authorization. No work session self-authorizes progression. WIN GATE, Decision Arena, human TasteBench study, A2A runtime and M7–M10 are not implemented here.
