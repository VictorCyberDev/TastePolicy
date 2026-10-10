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

Request feature.explainability=true. Qloo documents normalized per-input contribution scores and possible omitted low-impact inputs/warnings. Preserve only validated known signal IDs and finite 0–1 scores. Do not renormalize them to sum to one; do not invent zeroes for missing signals. Structural readers accept explicitly implemented shapes; unknown shape/missing metadata/provider warning is explainability unavailable. The actual account-specific wire shape is not live-verified. Explanation absence does not fabricate a mismatch or invalidate otherwise successfully scored evidence.

References and documentation revision: [provider review](../architecture/qloo-contract-review.md).
