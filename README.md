> Release authority: [M10–M26 execution ledger](docs/evaluation/company-build-m10-m26.md). Canonical M6–M10 candidate: `m10-m26-company-build`; [tree/lineage audit](docs/evaluation/m11-release-reconciliation.md). Green CI and hosted preview acceptance do not establish production or real ChatGPT/Claude commissioning.

# TastePolicy

**AI that helps without replacing you.**

TastePolicy is **personal agency infrastructure for AI**. It uses [Qloo](https://qloo.com) to understand what feels like _you_, then respects the needs and boundaries that decide what an AI may suggest, shortlist or choose.

> Margaret's mobility changed. Her taste didn't.

A recommender asks _"Will this person like it?"_ An accessibility tool asks _"Can this person access it?"_ TastePolicy asks: **will they genuinely like it, can it work for their real life, what evidence is known or unknown, and how far is the AI actually permitted to go?** Preference, evidence, requirements, permission and action stay separate.

## Assisted Choice (the flagship demo)

Open **`/experience`** (no login). Margaret is 72, loves intimate live jazz, classic cinema and Italian dining, and now needs a step-free entrance and a short walk. The journey:

1. Qloo resolves her five cultural anchors (you confirm each exact match) and discovers real places.
2. A place appears image-first, with _why it feels like her_ and a _will it work today?_ checklist.
3. Critical fact unknown (entrance) → **ASK** ("Needs your answer"). You answer; the same evaluator re-checks.
4. **ALLOW**, but only as far as her limit (**SHORTLIST**).
5. A simulated over-eager agent tries to _present it as the final choice_ → **ASK** again; only she can widen the limit.
6. **Why this happened** shows each source apart: Qloo (cultural evidence), place provider (facts), her requirements, her rules, the evaluator.

A known violation (e.g. no step-free entrance) is **REJECT**; evidence that cannot be obtained is **UNAVAILABLE**. Two concise variants prove the model generalises: `/experience/sensory-aware` (`noise_level in [low, moderate]`) and `/experience/low-energy` (`walking_minutes <= 10`). Needs are modelled as functional rules, never diagnoses, and nothing is inferred about a person from taste.

### Requirements and facts (generic contract)

A requirement is `{ key, operator, expected, importance, sourceRequirement }` (`hard` or `soft`). A candidate fact is `{ key, value, state: known|unknown|unavailable, evidence: VERIFIED|USER_CONFIRMED|INFERRED, source, sourceType, observedAt }`. Both travel in the existing evaluation `context` (additive; legacy callers are unchanged) and are committed in the context commitment, so a changed fact is drift.

| Situation                                                       | Outcome                             |
| --------------------------------------------------------------- | ----------------------------------- |
| Known hard violation                                            | `REJECT` (final)                    |
| Critical fact unknown, inferred, stale or conflicting           | `ASK`                               |
| Required evidence the provider cannot supply / Qloo unavailable | `UNAVAILABLE`                       |
| Requirements satisfied, strong fit, action within ceiling       | `ALLOW`                             |
| Good choice but requested action above the ceiling              | `ASK` (`ACTION_CEILING`)            |
| Soft requirement unmet or unknown                               | reported, never changes the outcome |

Qloo is **never** accepted as the source of a place fact. Code: `src/lib/requirements/`, `src/server/state/policy.ts`, tests in `tests/requirements.test.ts`.

### Place layer

`src/server/places/` bridges a Qloo place to a factual place (Google Places API New + Routes API) with a deterministic identity score; ambiguous or weak matches attach nothing. Photos stream through a same-origin proxy (`/api/places/photo`) with attribution and `no-store`; the key never reaches the browser. Fallback order: provider photo → licensed Wikimedia Commons → authored Taste image, each labelled. Without `GOOGLE_MAPS_API_KEY`, photos, accessibility facts and walking time stay **unknown** (the experience asks) and no route is drawn.

### Visual system

_Taste is expressive. Authority is precise._ Tokens and components live in `src/components/brand/` (Taste Spectrum, Tasteprint, Boundary Ribbon, Culture Tiles, Need Chips, Place Canvas, Authority Ladder, Decision Seal, Journey Line). The human product is deliberately light; motion is semantic and respects `prefers-reduced-motion`; status is never colour-only.

### Routes

`/` story · `/experience` Assisted Choice · `/judge` three-act walkthrough + technical evidence · `/dashboard` Personal Agency Home (example mode when signed out) · `/account/*` your taste, rules, leases, history, decision details · `/product` · `/developers` and `/developers/workspace` (credentials, projects, agents, billing) · `/arena/consumer` engineering route (kept) · `/demo` `/verify` `/integrations` `/docs` `/trust` `/security` `/status` `/privacy` `/terms`.

### For judges

Start at `/judge` (or go straight to `/experience`): no login. Live Qloo needs `QLOO_API_KEY`; provider failures are shown, never faked. See `docs/submission/m24-submission.md`.

## Technical foundation

**The subjective authority layer for AI agents.** _Qloo gives agents taste. TastePolicy gives that taste authority boundaries._

An agent can technically recommend a hotel, a record or a brand. TastePolicy answers the question that comes next: _should this agent make this subjective choice for this person, in this context, right now?_ The answer is one of **ALLOW, ASK, REJECT or UNAVAILABLE**, with the rule that decided it, a Cultural Receipt, and a bounded permission that ends when the facts change.

**ALLOW is preference authority only.** It never grants payment, booking, purchase, messaging, account, legal or any execution authority. Memory is not permission, Qloo affinity is not authorization, a recommendation is not authorization, UNAVAILABLE is not REJECT, and verifying a proof is not authorizing an action.

## Qloo and TastePolicy

|              | Qloo                                                           | TastePolicy                                                                                  |
| ------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Provides     | Cultural evidence: affinities between entities, across domains | Authority over what an agent may do with a taste-based choice                                |
| Answers      | "How well does this fit?"                                      | "May this agent go this far with it, for this person, now?"                                  |
| Failure mode | Provider unavailable                                           | UNAVAILABLE: no judgement was possible. It is **not** a rejection and never a negative taste |

## How it fits together

```
Qloo cultural evidence
  → subject-owned preference state (immutable versions)
  → context + explicit constraints
  → one deterministic evaluator ─ ALLOW / ASK / REJECT / UNAVAILABLE ─ Cultural Receipt
  → owner policy (rules, action ladder, sensitive choices, temporary permissions)
  → bounded lease bound to commitments of the choice and situation
  → drift suspends it; a fresh evaluation is required to resume (new epoch)
  → signed, selectively disclosed proof another agent can verify
  → doors: REST · TypeScript SDK · remote MCP · A2A · OAuth account linking
```

There is exactly one policy evaluator. M6–M9 wrap and extend the accepted M1–M5 evaluator; they do not replace it.

## The subjective-action ladder

How far an agent goes with a choice that fits your taste, from least to most:

| Rung                  | Meaning                               |
| --------------------- | ------------------------------------- |
| `SUGGEST`             | mention it as one idea                |
| `RANK`                | order several options                 |
| `SHORTLIST`           | narrow to a few                       |
| `ADD_TO_DRAFT`        | put it in a plan you can still change |
| `PRESENT_AS_SELECTED` | show it as the choice made for you    |

The owner sets the furthest rung an agent may take **without asking**, globally, per kind of choice and per agent. A request beyond it turns an ALLOW into an ASK the owner can answer once. Hard blocks, saved limits, UNAVAILABLE and group vetoes are never changed by the ladder. Legacy clients keep their behaviour: `recommend` = SHORTLIST, `add_to_draft` = ADD_TO_DRAFT, and presenting something as selected always asks until the owner opts in. See [ADR 0024](docs/decisions/0024-subjective-action-ladder.md).

## Decisions, Passport, policies, leases, proofs

- **Decisions.** Deterministic, with a captured Cultural Receipt. ASK is typed: an _authority confirmation_ (your own rule asks first) can wait for your answer; a _clarification_ (a fact is missing, such as a price) cannot be approved, it needs a new evaluation.
- **Passport.** Your private state behind opaque references; scoped grants; hashed credentials; account sessions.
- **Policies.** Versioned, simulated before publishing, with freshness per evidence class, per-agent and per-kind rules, extra care for sensitive kinds of choice, temporary permissions and counterfactual explanations. Widening needs a recent sign-in.
- **Leases.** Short, event-sourced permissions for one exact choice. They pause when your information, your rules, a share, a temporary permission, or the choice or situation itself changes, **as far as TastePolicy is told** (agents present the current candidate and context on verify and checkpoint; a change nobody presents cannot be seen). See [ADR 0025](docs/decisions/0025-authority-commitments.md).
- **Proofs.** Signed SD-JWT proofs with selective disclosure, holder-key binding, replay protection, a Token Status List and per-audience authority epochs. When authority ends, that epoch's proofs are invalid for good; resuming starts a new epoch and old proofs never return. A verifier that passes its own choice and situation learns whether the proof is about _them_.
- **Timeline.** `/account/timeline` shows every question, rule change, permission and shared proof in order.

## Use it

REST (credential scopes: `PASSPORT_READ`, `TASTE_EVALUATE`, `RECEIPT_READ`):

```sh
curl -sS https://YOUR_ORIGIN/api/v1/evaluate \
  -H "authorization: Bearer $TASTEPOLICY_KEY" -H "content-type: application/json" \
  -d '{"idempotencyKey":"trip-2026-001","passportRef":"tp_…","requestedAction":"ADD_TO_DRAFT",
       "proposal":{"agentId":"my-agent","expectedStateVersion":1,
         "candidate":{"id":"…","name":"Hotel Lisboa","type":"destination"},
         "context":{"key":"trip","domain":"destination","price":{"amount":120,"currency":"USD"}}}}'
```

TypeScript SDK (server-side, in this repository; not published to npm):

```ts
const tp = new TastePolicyClient({ baseUrl, credential });
const r = await tp.evaluate({
  passportRef,
  idempotencyKey,
  requestedAction: "SHORTLIST",
  proposal,
});
if (r.decision === "ALLOW") {
  const lease = await tp.lease({
    idempotencyKey,
    evaluationRef: r.evaluationRef,
  });
  // before relying on it, present the choice as it is now:
  await tp.leaseVerify(lease.leaseRef, { context: currentContext });
}
```

- **Remote MCP** at `/api/mcp` (Streamable HTTP). Tool descriptions say when to call: _before you select, rank, recommend, shortlist, add to a draft, present as selected, or otherwise continue a subjective preference-sensitive choice for a person_.
- **A2A 1.0** Agent Card at `/.well-known/agent-card.json`, JSON-RPC at `/api/a2a`; opt-in authority-lifecycle extension for leases, proofs and handoff ([ADR 0026](docs/decisions/0026-a2a-authority-lifecycle-extension.md)).
- **OAuth 2.1** for hosted assistants (authorization code + PKCE S256, client ID metadata or dynamic registration, rotating refresh tokens, MCP-only audience). See [ADR 0022](docs/decisions/0022-oauth-account-linking.md).
- **OpenAPI** at `/api/v1/openapi`. **Verifier** at `/verify` and `POST /api/attest/verify` (no credential). Issuer metadata at `/.well-known/tastepolicy-issuer`; third-party issuers are inspected and explicitly trusted, never auto-trusted ([ADR 0027](docs/decisions/0027-federation-compatible-issuers.md)).

## Security and privacy

Credentials and tokens are stored hashed; OAuth tokens are audience-bound and 15 minutes long; provider calls never run under a database transaction or lock; policy widening requires a recent sign-in; rate limits are shared through PostgreSQL where they must hold across instances ([ADR 0028](docs/decisions/0028-admission-control.md)). Agents learn the answer, a short reason and how far they may go; receipts show the choice, the cultural evidence behind the match and the deciding rule; proofs by default disclose no taste, name or account reference. Threat model and review record: [docs/security/threat-model.md](docs/security/threat-model.md), [supply chain](docs/security/supply-chain.md).

## Local development

Node.js 24 and npm. `npm ci && cp .env.example .env.local && npm run dev`. Without credentials the app runs and reports unavailable states; it never invents Qloo results. Set `QLOO_API_KEY` (server-only), `QLOO_API_BASE_URL` and `QLOO_AFFINITY_SCALE` to use Qloo ([setup](docs/architecture/qloo-contract-review.md)). Optional `GOOGLE_MAPS_API_KEY` (server-only; Places + Routes) enables real place photos, accessibility facts and walking time. Persistence needs `DATABASE_URL`; account features need `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`; proofs need `TASTEPOLICY_PUBLIC_ORIGIN` and `TASTEPOLICY_ATTESTATION_KEY`. Apply the schema with `npm run db:migrate:all` (ledgered, idempotent; [ADR 0030](docs/decisions/0030-migration-ledger.md)). See `.env.example`.

## Tests, conformance, load

```sh
npm run verify               # format, lint, typecheck, unit tests, build
npm run test:e2e             # Playwright incl. axe accessibility checks
npm run conformance:compatible   # tastepolicy-compatible-v1 (110 checks)
npm run tastebench:validate      # evaluation methodology fixtures
TASTEPOLICY_TEST_DATABASE_URL=postgres://… npm test   # adds real-PostgreSQL suites
npm run load:local           # controlled contention probe (not a capacity claim)
```

## Live deployment

Evidence is labelled by kind in [docs/evaluation/r6-hosted-acceptance.md](docs/evaluation/r6-hosted-acceptance.md): LIVE, HOSTED, CONTROLLED, SYNTHETIC, LOCAL, CI, NOT EXECUTED, BLOCKED. Nothing in this README claims a vendor assistant (ChatGPT, Claude, Gemini) works with TastePolicy; the product pages list what is available, what is on the roadmap and what is not implemented.

## Current limitations

- Commitment-based drift covers what an agent tells TastePolicy; it cannot observe the outside world.
- One organization ceiling per deployment, set by the operator; no multi-organization model, SSO/SCIM or admin console.
- Sensitive choices are declared by the owner per kind of choice; content is not classified.
- The authenticated MCP/A2A request budget is per instance.
- Federation is explicit trust only: no registry, no revocation propagation between issuers.
- Hosted acceptance with real Qloo and vendor connectors is documented in the R6 record; see its status.
- TasteBench thresholds are experimental and not population-calibrated.

History of earlier milestones and acceptance records: [docs/history](docs/history/readme-through-m9-pre-reconciliation.md), [docs/evaluation](docs/evaluation/README.md). Licence: Apache-2.0. Contributions: [CONTRIBUTING.md](CONTRIBUTING.md).
