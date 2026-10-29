# M24 submission: Assisted Choice

**TastePolicy: AI that helps without replacing you.** Personal agency infrastructure for AI.

## The story

Margaret's mobility changed. Her taste didn't.

- A generic AI can recommend a place.
- Qloo can understand cultural fit.
- TastePolicy adds the missing human layer: what actually works today, what is still unknown, what the person requires, and how far the agent is allowed to go.

## Judge path (no login)

1. `/judge`: three acts (Meet Margaret, Watch Qloo understand her, Watch TastePolicy protect her agency), then technical evidence.
2. `/experience`: the live walkthrough.
   1. Start; confirm the five resolved Qloo anchors; discover real places.
   2. Review the image-first place card, the "why it feels like her" cues and the "will it work today?" chips.
   3. Press **Check it against her needs**. If a critical fact (entrance, walking time) is unknown you get **ASK**.
   4. Answer. The same evaluator re-checks: **ALLOW** at **SHORTLIST**.
   5. Press **Simulate: the agent tries to present it as the final choice**: **ASK** (action ceiling).
   6. Open **Why this happened**: Qloo, place facts, requirements, authority and decision, each with its own source.
   7. Answer "No, there are steps" on a place for a hard **REJECT**.
3. Variants: `/experience/sensory-aware`, `/experience/low-energy`.
4. Depth: `/developers`, `/developers/workspace`, `/account/*`, `/verify`, `/trust`, `/security`, `/status`.

If a place provider already confirms an entrance, ALLOW can appear without an ASK. That is correct behaviour. Use "Show me another" or answer a different place.

## What is real, what is not

| Item                                                              | State                                                                                                                                                 |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qloo resolution, discovery, cultural evidence                     | Existing live adapter; requires `QLOO_API_KEY` in the deployment                                                                                      |
| Requirement/fact contract, decision semantics, action ceiling     | Implemented and unit/integration tested (`tests/requirements.test.ts`)                                                                                |
| Place identity bridge, Google Places/Routes adapters, photo proxy | Implemented and tested against **contract fixtures**; live Google calls need `GOOGLE_MAPS_API_KEY`                                                    |
| Without a Google key                                              | Photos fall back to licensed Wikimedia then authored Taste images; accessibility facts and walking time stay unknown and are asked; no route is drawn |
| Accessibility of any specific venue                               | Never asserted unless a provider reports it or the person says so (recorded as "your answer")                                                         |
| Vendor assistants (ChatGPT, Claude)                               | Unchanged from the earlier evidence ledger: no live invocation is claimed                                                                             |

## Positioning guardrails

Needs are modelled as functional rules (`walking_minutes <= 10`), never diagnoses. Nothing about a person is inferred from taste. ALLOW is preference authority only: no booking, payment or messaging.

## Production

`https://tastepolicy.vercel.app` (deployment `dpl_5XGyzQWCVqLGW3w6ZZHRF11vEJwR`, `main` at `6447a28`). Screenshots from production are in `docs/submission/screenshots/`.
