# TastePolicy

**AI that helps without replacing you.**

TastePolicy is **personal agency infrastructure for culturally intelligent AI**.

[Qloo](https://qloo.com) tells an agent what culturally fits a person. TastePolicy answers the next question: **may the agent actually go this far with that choice, for this person, in this context, right now?**

> **Margaret's mobility changed. Her taste didn't.**

A recommender asks, _“Will this person like it?”_  
Qloo gives grounded cultural evidence for that question.  
TastePolicy adds real-world requirements, explicit user rules and an authority ceiling so a strong taste match does not silently become permission.

## Start here

- **Judge walkthrough:** `/judge` — three short acts, no login.
- **Your own experience:** sign up, then `/onboarding` saves your taste, what matters and how far AI may go; `/experience` and `/dashboard` use only your saved data.
- **Assisted Choice example:** `/demo/margaret` — the labelled live Margaret scenario with real Qloo data.
- **Product:** `/`
- **Developer platform:** `/developers`
- **Trust boundary:** `/trust`
- **Live readiness:** `/status`

Production: <https://tastepolicy.vercel.app>

## The core thesis

**Taste intelligence is not permission.**

The same candidate passes through three distinct layers:

1. **Generic AI** can produce a plausible suggestion, but it does not have grounded cultural evidence.
2. **Qloo** resolves cultural identities, discovers cross-domain candidates and provides candidate-specific affinity/explainability.
3. **TastePolicy** keeps that cultural evidence separate from factual context, the person's requirements, their rules and the action the agent is requesting.

A candidate can be a strong cultural match and still produce **ASK** or **REJECT**. Affinity never overrides an explicit boundary.

## Four explicit outcomes

| Situation                                                                                  | Outcome       |
| ------------------------------------------------------------------------------------------ | ------------- |
| Requirements satisfied and requested action is within the authority ceiling                | `ALLOW`       |
| A critical fact is unknown, stale/conflicting, or the requested action exceeds the ceiling | `ASK`         |
| A known hard requirement or explicit rule is violated                                      | `REJECT`      |
| Required evidence cannot be obtained                                                       | `UNAVAILABLE` |

Missing evidence is never silently converted into permission. Provider failure is never reported as dislike.

## How Qloo is used

TastePolicy does **not** recreate Qloo's taste graph and does not substitute generic LLM guesses for Qloo evidence.

The current Qloo integration uses:

- `GET /search` to resolve cultural anchors;
- `GET /entities` to verify the identities being used;
- `GET /v2/insights` for cross-domain discovery;
- `GET /v2/insights` again for candidate-specific affinity/explainability.

The division of responsibility is deliberate:

| Qloo                                  | TastePolicy                          |
| ------------------------------------- | ------------------------------------ |
| Cultural identities and relationships | Requirements and factual context     |
| Cross-domain candidate discovery      | Explicit user rules                  |
| Candidate affinity/explainability     | Authority ceiling                    |
| “What fits?”                          | “May the agent go this far with it?” |

Without Qloo, TastePolicy intentionally does not pretend a generic model guess is equivalent cultural evidence.

## Assisted Choice

The flagship judge story follows **Margaret**, 72, who still loves intimate live jazz, classic cinema and Italian dining but now needs a step-free entrance, a short walk and a quieter setting.

The public flow:

1. Qloo resolves her five cultural anchors to real entities.
2. Qloo discovers real places from those cross-domain signals.
3. TastePolicy presents the cultural match separately from real-world facts.
4. If a critical requirement such as the entrance is unknown, the answer is **ASK**, not a guess.
5. After the missing fact is answered, the same deterministic evaluator runs again.
6. A qualifying choice can become **ALLOW**, but only up to Margaret's saved limit: **SHORTLIST**.
7. If the agent tries to present that option as the final choice, the authority ceiling forces **ASK** again.
8. **Why this happened** keeps Qloo evidence, place facts, requirements, rules and the final decision separately attributable.

A known hard violation becomes **REJECT**. If the required evidence cannot be obtained, the result is **UNAVAILABLE**.

Two concise variants demonstrate the same contract beyond Margaret:

- `/experience/sensory-aware`
- `/experience/low-energy`

Needs are represented as functional rules such as `walking_minutes <= 10` or noise-level constraints, never as diagnoses inferred from cultural taste.

## Real place experience

TastePolicy's current open place layer uses:

- **MapLibre + OpenFreeMap** for the branded journey map;
- **OpenStreetMap** for explicit place facts where available;
- **KartaView** and **Panoramax** for real street imagery, sequences and 360° coverage where available;
- optional **openrouteservice/HeiGIT** routing;
- licensed Wikimedia or authored Taste imagery as fallback.

Media is presentation, not authority evidence. A nearby street image is labelled as nearby rather than falsely presented as the exact venue. Missing accessibility or route facts remain unknown.

A Google Places adapter also exists as an optional factual provider path, but the public open-place experience does not depend on Google being configured.

## One deterministic authority contract

A requirement is represented separately from a candidate fact.

```ts
Requirement = {
  key,
  operator,
  expected,
  importance,
  sourceRequirement,
};

CandidateFact = {
  key,
  value,
  state: "known" | "unknown" | "unavailable",
  evidence,
  source,
  sourceType,
  observedAt,
};
```

Qloo is never accepted as the source of a place-accessibility fact. Cultural evidence, factual evidence and authority remain separate.

## Subjective-action ladder

TastePolicy distinguishes a good recommendation from how far the agent may act on it:

| Rung                  | Meaning                         |
| --------------------- | ------------------------------- |
| `SUGGEST`             | mention it as an idea           |
| `RANK`                | order options                   |
| `SHORTLIST`           | narrow to a few                 |
| `ADD_TO_DRAFT`        | place it into a draft plan      |
| `PRESENT_AS_SELECTED` | present it as the chosen option |

The person sets the furthest rung the AI may reach without asking. A request above that ceiling converts an otherwise valid recommendation into **ASK**.

## Deeper authority infrastructure

The simple human experience sits on one shared authority model with:

- versioned Passport/state;
- versioned rules and action ceilings;
- Cultural Receipts;
- bounded leases tied to candidate/context commitments;
- drift checks and revocation;
- signed, selectively disclosed proofs;
- timeline/history;
- REST;
- TypeScript SDK;
- remote MCP;
- A2A;
- OAuth 2.1 / PKCE.

These surfaces extend the same evaluator rather than introducing separate policy engines.

## Safety boundary

**ALLOW is preference-choice authority only.**

It never grants:

- payment or purchase authority;
- booking authority;
- messaging authority;
- account changes;
- private-data disclosure;
- legal authority.

**Memory is not permission. Affinity is not authorization. A recommendation is not authorization. Verifying a proof is not authorization.**

## Local development

Requirements: Node.js 24 and npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Core environment variables:

- `QLOO_API_KEY`
- `QLOO_API_BASE_URL`
- `QLOO_AFFINITY_SCALE`
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `TASTEPOLICY_PUBLIC_ORIGIN`
- `TASTEPOLICY_ATTESTATION_KEY`

Optional place providers/routing are documented in `docs/architecture/open-place-providers.md` and `.env.example`.

Apply database migrations with:

```bash
npm run db:migrate:all
```

## Verification

```bash
npm run verify
npm run test:e2e
npm run conformance:compatible
npm run tastebench:validate
```

Real-PostgreSQL suites can also run with `TASTEPOLICY_TEST_DATABASE_URL` configured.

Evidence is labelled by kind — LIVE, HOSTED, CONTROLLED, SYNTHETIC, LOCAL, CI, NOT EXECUTED or BLOCKED — so tests and planned integrations are not presented as production facts.

See:

- `docs/evaluation/`
- `docs/evaluation/m24-execution-ledger.md`
- `docs/evaluation/m25-execution-ledger.md`
- `docs/architecture/qloo-contract-review.md`
- `docs/architecture/open-place-providers.md`

## Current limitations

- TastePolicy can only detect external drift that an agent or provider presents back to it.
- Open place/accessibility coverage varies by location; missing facts remain unknown.
- Vendor-assistant commissioning status is tracked separately and is not implied by protocol support.
- TasteBench results are engineering/evaluation evidence, not population-level preference or safety claims.

## License

Apache-2.0. See `LICENSE`.
