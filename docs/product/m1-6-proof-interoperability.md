# M1.6 — Proof & Interoperability

Built over merged main 70e72f7457b76df8d5112263fb68a0afba162f4a. See [design record](../decisions/0005-m16-local-proof-boundary.md) and unchanged [canonical architecture v2](../architecture/canonical-architecture-v2.md). No persistence or M2 work.

## Compositional proof

For one SELECT_ENTITY proposal, the optional “Why does TastePolicy matter?” disclosure presents:

| Layer                  | Actual capability                                                                   | Boundary                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Agent proposal only    | Action and exact candidate                                                          | No invented cultural evidence, scores, provenance, policy or receipt                  |
| Qloo cultural evidence | Same candidate-specific affinity, scale, provenance and contribution explainability | Evidence is not itself TastePolicy authorization                                      |
| TastePolicy            | Same evidence plus existing deterministic experimental decision, reason and receipt | No spending, purchasing, booking, private-data, legal, account or execution authority |

This is architectural capability comparison, not a benchmark, generic-AI experiment, accuracy study or claim that Qloo is inferior. No LLM is called. No new recommendation is generated for another column.

## Signature Receipt

A memorable readable snapshot of Cultural Receipt v1 shows decision, candidate, SELECT_ENTITY, affinity, Qloo source, contribution explainability, experimental policy version and receipt ID. Progressive detail retains signals, raw/configured-scale/normalized values, contributions, thresholds, provenance, request ID, timestamps, normalization/schema versions and unchanged JSON. “Contribution explainability” describes the existing complete/partial/unavailable metadata, not a new sufficiency score. Receipts are not signed, immutable, tamper-proof or authenticated. Affinity remains query/context-relative, not confidence or individual preference probability.

Evidence source is inherited by signature and proof panels: LIVE QLOO for current server evaluation, RECORDED LIVE EVIDENCE for historical captured evidence, SYNTHETIC TEST DATA for test injection. Required missing evidence stays UNAVAILABLE with no manufactured receipt/proof. Intercepted browser tests apply conspicuous test-only labeling to all panels; production has no fixture switch or fallback.

## Stability-lite methodology

1. Validate captured v1 schema, current policy version/thresholds, normalization, identities, score, decision, contribution metadata and candidate-specific provenance through the existing receipt builder. This does not authenticate its origin. Unknown policy/schema versions are unavailable rather than silently replayed under a different policy.
2. Run the existing evaluateEvidence function exactly three times over the same captured normalized semantic input. Count identical decision AND reason code relative to the captured decision. Validation itself also evaluates consistency; the displayed three runs count only the explicit replay loop.
3. Compute unrounded JavaScript-number differences against captured thresholds. No score rounding is used for decision or margin math; the UI may round to four decimal places and structured output preserves the underlying numeric value. These are IEEE-754 numbers, not arbitrary precision measurements.

| Captured outcome          | Direction / formula                               | Boundary behavior                                            |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| ALLOW (score >0.80)       | down: score − allowAbove                          | Touch 0.80 → ASK                                             |
| ASK (0.50–0.80 inclusive) | up: allowAbove − score; down: score − rejectBelow | Must cross strictly above/below; touching either remains ASK |
| REJECT (score <0.50)      | up: rejectBelow − score                           | Touch 0.50 → ASK                                             |

The nearest transition is the smaller numeric margin; exact numeric ties retain the first listed transition. Structured output includes both ASK transitions, touch semantics, nearest boundary, direction, score, thresholds, method and policy version. Receipt rank is not stored or scored; a non-scoring rank sentinel is used only when reconstructing semantic input. No Qloo call, provider perturbation, four-signal request, receipt mutation or persistence occurs.

> Stability-lite tests deterministic policy replay and policy-boundary sensitivity. It does not prove provider robustness or preference probability.

## Local semantic Agent Interface

`createAgentGateway(providerFactory)` wraps the existing evaluateAction service. Fresh provider instances retain their existing five-call budget, fixed allowed hosts, 15-second deadline and no retries. Evaluation also uses the existing process-local budget; this is not a distributed/public protection guarantee. Target type is checked during the same entity lookup before candidate inference. Existing service/receipt validation still enforces five distinct IDs, multiple domains, candidate/input separation and candidate/evidence identity. No new HTTP route is exposed.

### Evaluation request

```json
{
  "operation": "evaluateTasteAction",
  "request": {
    "identitiesReviewed": true,
    "signalIds": ["five distinct selected UUIDs"],
    "action": {
      "kind": "SELECT_ENTITY",
      "candidate": { "id": "selected candidate UUID", "type": "place" },
      "context": "optional, at most 160 characters"
    }
  }
}
```

The abbreviated UUID array above documents shape, not a valid request. [examples/agent-proposal.json](../../examples/agent-proposal.json) is a valid historical public example. Its IDs were reviewed in M1; it does not claim new current-session resolution. Callers must resolve/review identities before submission. identitiesReviewed is a caller attestation, not an account/authentication system or proof of human consent.

With a privately configured local key, assigned host and unit scale:

```sh
npm run --silent agent < examples/agent-proposal.json
```

One JSON object on stdin; one JSON result on stdout. Successful evaluation: `{status:"available", evidenceSource:"live", data:<CulturalReceipt v1>}`. Provider failure: `{status:"unavailable", reason:<existing reason>}`. Invalid structure: `{status:"error", code:"INVALID_INPUT"}`. Unexpected failure: `{status:"error", code:"INTERNAL_ERROR"}`. No raw provider payload/headers or secrets are returned.

### Captured receipt operations

```json
{
  "operation": "explainTasteDecision",
  "receipt": "replace with captured v1 object",
  "evidenceSource": "recorded"
}
```

Use the same envelope with operation checkDecisionStability for replay/margins. The placeholder string is not valid receipt data. Captured source must be recorded or synthetic; a caller cannot label submitted JSON as current live evidence. Source is descriptive/caller-declared, not cryptographic authentication. Pure operations never construct a provider or read provider configuration. They return available + data + evidenceSource, or unavailable/invalid_response for unsupported/inconsistent captured receipts. Explanation derives existing fields without inventing missing contribution narratives.

The adapter consumes one operation, rejects unknown fields/raw Qloo methods/user URLs, bounds stdin to 16 KiB and a total three-second read deadline, and sanitizes errors. Each evaluation has at most two provider calls (lookup + candidate Insights) through the same authoritative service. Do not use it to bypass event rate limits; there are no retries/pacing changes. CLI operation limits are process-local, not protection against repeated invocations by an untrusted host user.

Node 24 native --experimental-transform-types handles an existing body-reader parameter property. A fixed local module resolver supplies TypeScript source imports; inputs cannot choose modules. --conditions=react-server enables server-only modules in this trusted process. Node may emit an experimental feature warning on stderr; stdout remains machine JSON. This is a bounded interoperability proof, not a production public Agent Gateway or stable SDK.

**MCP_DEFERRED —** the local semantic CLI meets the second-process requirement without a protocol SDK dependency, duplicate logic or public quota surface. MCP remains a later transport option, not an implemented feature. No AgentContinuationContract is introduced.

## Verification categories and limitations

Unit/integration tests inject synthetic providers only under tests. A dedicated test subprocess demonstrates successful evaluation using those services and labels its output synthetic; the production entrypoint has no fixture flag. Invalid request and credential-free production evaluation are demonstrated separately. Browser tests cover all outcomes, proof disclosure, mobile/keyboard/reduced motion and no extra requests while opening/replaying proof.

Optional live presentation smoke: if no private local credential is available, label LIVE_M1_6_PRESENTATION_SMOKE_ENVIRONMENT_BLOCKED. Existing accepted M1 evidence is historical, not a new live M1.6 demonstration. No scientific calibration, generalized recommendation superiority, provider robustness or production-scale agent security is claimed. Persistence, ContextGraph, feedback, clarification, counterfactual repair, full TasteBench and transaction authority remain future.
