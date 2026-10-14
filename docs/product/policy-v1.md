# Experimental policy v1

Status: implemented, tested and exercised in the completed Milestone 1 live acceptance. The event contract's `unit` affinity scale, candidate-specific evidence and explainability handling are verified. The thresholds remain **experimental and not human-calibrated**; live acceptance verifies implementation/contract behavior, not universal preference accuracy.

## Evidence requirement

Five unique Qloo entity IDs from at least two domains must be server-verified. The SELECT_ENTITY candidate must be independently verified and belong to brand/place/destination, with a different ID from all signals. A separate Insights query restricts results to that specific ID. Discovery rank never authorizes an action. An empty result, failed lookup, missing key, unverified scale, timeout or malformed payload is **unavailable**, never REJECT.

## Numeric contract

`normalizeAffinity` accepts only finite numbers in the configured scale: unit [0,1] is unchanged; percent [0,100] is divided by 100. No coercion, clamping, rounding or magnitude detection. Preserve the original affinity and explicit scale in the receipt. Reject missing, NaN, infinite, negative and out-of-range numbers.

Qloo's published interpretation guidance uses percentages: above 80 is very high relevance; below 50 is low. Its current documentation glossary describes 0–1 scores. The bounded event-host acceptance verified that this credential/contract returns the relevant affinity in `unit` representation, so the live acceptance explicitly configured `QLOO_AFFINITY_SCALE=unit`. The implementation still refuses to infer scale from magnitude: deployments must configure the verified scale explicitly. Without it, Insights/policy evaluation is disabled; entity resolution can still run.

## Inspectable thresholds

| Normalized affinity         | Decision | Reason              |
| --------------------------- | -------- | ------------------- |
| > 0.80                      | ALLOW    | STRONG_ALIGNMENT    |
| 0.50 through 0.80 inclusive | ASK      | UNCERTAIN_ALIGNMENT |
| < 0.50                      | REJECT   | WEAK_ALIGNMENT      |

These named constants live in src/server/policy/thresholds.ts. Exactly 0.80 remains ASK as a conservative boundary. Exactly 0.50 also remains ASK. Policy version: tastepolicy-v1-experimental. This is a simple documentation-grounded hypothesis, not an empirical or universally validated authorization rule. A bounded live distribution was observed, but all final sampled candidate evaluations remained above 0.80; therefore ASK/REJECT boundaries are still not human-calibrated. The broad ASK range acknowledges input complexity. Refine only through a separately approved evaluation/calibration process; do not tune thresholds merely to force balanced demo outcomes.

Qloo scores are context/query-dependent, not probabilities of individual preference, demographic truths, or comparable measurements across arbitrary people/domains. A REJECT means only that this experimental selection policy considers the returned affinity weak. It does not prove dislike. ALLOW is a demo policy outcome, not authority to purchase or execute anything.

## Explainability

Request feature.explainability=true. Published guidance describes unit scores and possible provider omissions. The event-host item structure was then verified during live acceptance: the adapter reads the observed contribution structure conservatively and preserves provider omissions/warnings as completeness state rather than fabricating contributions. Values are preserved, never summed or renormalized.

Parsed explanation is complete only when every signal is accounted for, or a verified adapter explicitly identifies omissions. It is partial when signals are unexplained, entries are malformed, or provider warnings exist. Absent, unknown and entirely malformed structures remain explicitly unavailable with distinct reasons. Missing IDs and explicitly omitted IDs are separate fields. Explainability quality does not manufacture an affinity or turn a provider failure into REJECT.

Receipts snapshot allowlisted data, validate candidate ID/type, profile, decision and provenance consistency, and carry cultural-receipt-v1 and affinity-explicit-scale-v1 in addition to the unchanged policy version. They are audit snapshots, not signed or tamper-proof records. No provider request identifier is invented because none is present in the currently normalized evidence.

References and documentation revision: [provider review](../architecture/qloo-contract-review.md).

## Bounded live review and acceptance (2026-10-13)

Twenty-four top-ranked discovery values were observed in unit representation, with candidate-specific live evaluations. Threshold verdict remains **KEEP, provisional**; no calibration/semantic change was made. Cross-query comparability remains LIMITED. The final verifier sampled HOUSE OF FINN JUHL HAKUBA (`0.9233086745343598`, complete explainability), MasterClass (`0.8886944207813341`, complete) and Edinburgh (`0.8362903398323988`, partial); all mapped to ALLOW, so there is still no empirical validation of the ASK/REJECT boundaries or human alignment accuracy. The exact pushed M1 head passed the committed live verifier, deterministic repeat checks and the unmocked browser flow. See the [historical investigation](../evaluation/milestone-1-live-verification.md) and [final acceptance report](../evaluation/milestone-1-live-acceptance-2026-10-13.md).
