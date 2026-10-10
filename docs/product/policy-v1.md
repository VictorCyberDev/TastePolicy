# Experimental policy v1

Status: implemented and tested with synthetic fixtures; **not live-calibrated**. No key was available during Milestone 1 implementation. A live proof remains blocked.

## Evidence requirement

Five unique Qloo entity IDs from at least two domains must be server-verified. The SELECT_ENTITY candidate must be independently verified and belong to brand/place/destination, with a different ID from all signals. A separate Insights query restricts results to that specific ID. Discovery rank never authorizes an action. An empty result, failed lookup, missing key, unverified scale, timeout or malformed payload is **unavailable**, never REJECT.

## Numeric contract

`normalizeAffinity` accepts only finite numbers in the configured scale: unit [0,1] is unchanged; percent [0,100] is divided by 100. No coercion, clamping, rounding or magnitude detection. Preserve the original affinity and explicit scale in the receipt. Reject missing, NaN, infinite, negative and out-of-range numbers.

Qloo's published interpretation guidance uses percentages: above 80 is very high relevance; below 50 is low. Its current documentation glossary describes 0–1 scores. Until an actual credential/host response has been inspected, this discrepancy must not silently select a scale. Set QLOO_AFFINITY_SCALE explicitly after verifying wire semantics. Without it, Insights/policy evaluation is disabled; entity resolution can still run.

## Inspectable thresholds

| Normalized affinity         | Decision | Reason              |
| --------------------------- | -------- | ------------------- |
| > 0.80                      | ALLOW    | STRONG_ALIGNMENT    |
| 0.50 through 0.80 inclusive | ASK      | UNCERTAIN_ALIGNMENT |
| < 0.50                      | REJECT   | WEAK_ALIGNMENT      |

These named constants live in src/server/policy/thresholds.ts. Exactly 0.80 remains ASK as a conservative boundary. Exactly 0.50 also remains ASK. Policy version: tastepolicy-v1-experimental. This is a simple documentation-grounded hypothesis, not an empirical or universally validated authorization rule. No live distribution was observed, and the receipt explicitly carries provisional_not_live_calibrated. The broad ASK range acknowledges input complexity. Refine only after real canonical-profile verification and independent review.

Qloo scores are context/query-dependent, not probabilities of individual preference, demographic truths, or comparable measurements across arbitrary people/domains. A REJECT means only that this experimental selection policy considers the returned affinity weak. It does not prove dislike. ALLOW is a demo policy outcome, not authority to purchase or execute anything.

## Explainability

Request feature.explainability=true. Published guidance describes unit scores and possible provider omissions, but the concrete item structure remains unverified. The conservative provisional reader accepts only entities arrays with entity_id and numeric score. It does not interpret affinity/id aliases or arbitrary ID maps. Values are preserved, never summed or renormalized.

Parsed explanation is complete only when every signal is accounted for, or a verified adapter explicitly identifies omissions. It is partial when signals are unexplained, entries are malformed, or provider warnings exist. Absent, unknown and entirely malformed structures remain explicitly unavailable with distinct reasons. Missing IDs and explicitly omitted IDs are separate fields. Current adapter does not infer an omission-ID wire field; that mapping requires live verification. Per-result and documented top-level warning locations are checked without returning warning text. Explainability quality does not manufacture an affinity or turn a provider failure into REJECT.

Receipts snapshot allowlisted data, validate candidate ID/type, profile, decision and provenance consistency, and carry cultural-receipt-v1 and affinity-explicit-scale-v1 in addition to the unchanged policy version. They are audit snapshots, not signed or tamper-proof records. No provider request identifier is invented because none is present in the currently normalized evidence.

References and documentation revision: [provider review](../architecture/qloo-contract-review.md).
