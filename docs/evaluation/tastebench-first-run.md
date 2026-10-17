# TasteBench first implementation run — 2026-10-16

**SYNTHETIC ENGINEERING CONTRACT SCENARIOS. Not human preference accuracy or a comparative model result.**

Methodology was recorded in ADR 0008 before benchmark implementation/results. Two separate new output directories, `.tastebench/final-one` and `.tastebench/final-two`, were executed through the contract CLI. Both recorded base code SHA `61890f21ab0c71aa0a304fd9972ab5ce5439bd86` and dirty=true (uncommitted M3 implementation); this is an explicitly identified pre-commit engineering checkpoint, not an exact-head release claim. Node: v24.19.0. Raw timings and random run IDs differ; semantic predictions/results/metrics match. Report reconciliation, blinded export and calibration-only CLI paths also completed.

Dataset: engineering-v1; 24 cases, 6 CALIBRATION and 18 EVALUATION. Domains: 8 brand, 8 destination, 8 place. Source: 24 SYNTHETIC, zero human/captured-live cases. Dataset hash `0d30276bce61ba67158f305bf5340acc51f53ec58cc041159db6b774970bc11d`. Annotation set: no-human-labels-v1; zero records/adjudications. No scenario exclusions.

| System           | Split       | Executed | Mode-specific regression contracts | Shared explicit-constraint compliance | UNAVAILABLE | INVALID_OUTPUT |
| ---------------- | ----------- | -------- | ---------------------------------- | ------------------------------------- | ----------- | -------------- |
| QLOO_POLICY      | CALIBRATION | 6        | 6/6                                | 2/5                                   | 1           | 0              |
| QLOO_POLICY      | EVALUATION  | 18       | 18/18                              | 1/11                                  | 2           | 0              |
| FULL_TASTEPOLICY | CALIBRATION | 6        | 6/6                                | 5/5                                   | 1           | 0              |
| FULL_TASTEPOLICY | EVALUATION  | 18       | 18/18                              | 11/11                                 | 1           | 0              |
| AFTER_FEEDBACK   | CALIBRATION | 0        | 0/0                                | 0/0                                   | 0           | 0              |
| AFTER_FEEDBACK   | EVALUATION  | 1        | 1/1                                | 0/0                                   | 0           | 0              |

Mode-specific contracts verify a baseline's defined behavior; they do not imply all baselines enforce persistent constraints. The shared explicit-constraint column separately exposes that distinction. Neither column is subjective human agreement. Human agreement, unsafe-autonomy and excessive-ASK rates have zero scorable human denominator and remain null; no human accuracy or baseline-win claim is made.

Observed engineering proof:

- 49 predictions and 49 registered mode-specific expectations matched.
- 98 deterministic replay comparisons; zero mismatches.
- 11 registered score/price perturbation outcomes matched.
- Six clarification contracts and five protected repair contracts matched; the latter execute accepted services, actual migrations and production repository SQL in isolated development-only PGlite.
- Repair fixture method invocations: 12 total, maximum four per scenario; candidate-specific verification required for available repair. Pure policy and clarification execution: zero provider calls. These are synthetic adapter calls, not live HTTP or Qloo data.
- One before/event/after feedback transition consumed the later registered state and matched its expected REJECT. This is explicit constraint consumption, not learned human preference.
- Eligible receipt fields are measured from actual generated/validated output; unavailable/independent blocks do not receive invented receipts. Full raw counts, separate timing groups and denominator details are in the ignored run artifacts.

Reproduction hashes (identical in both runs):

| Artifact                  | SHA-256                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| Semantic predictions      | `9342d7f39baec30e361f6969b77ee067787d3bbbd3dcd7d7f32058a3858f9233` |
| Semantic scenario results | `d2bebbd046c9c6004f7fe096bdad30c8074d5f7298b5d509cdee487b0c437e45` |
| Semantic metrics          | `fb7db243bd1dc33f646fb3910f74d118f799fb9ed2a6467f5c27d3949ba38052` |
| Semantic run              | `3ab2cc113d9ced621d035e0e6310e8578601e4dfc1ab05efcbdba0d8f7209d8e` |

Generated artifacts: manifest.json, annotations.json, predictions.jsonl, scenario-results.jsonl, metrics.json and summary.md. Raw artifact hashes include timing; semantic hashes exclude timing/generated identifiers. Source scenarios and manifests are committed; generated runs stay gitignored. Exact-head CI/deployment and any later clean-head repetition are reported separately in the handoff.

Environment status:

- TASTEBENCH_HUMAN_EVALUATION_NOT_RUN.
- TASTEBENCH_GENERIC_LLM_BASELINE_ENVIRONMENT_BLOCKED.
- TASTEBENCH_LLM_QLOO_BASELINE_ENVIRONMENT_BLOCKED.
- LIVE_QLOO_BENCHMARK_NOT_RUN — optional live mode is not implemented; captured/synthetic replay is the default.

The 51 benchmark tests include malicious label/split contamination, tamper/hash/count reconciliation, malformed external response handling, independent baselines, annotation/adjudication validation, no hidden missing-receipt success, timing tamper, deterministic runs and a deliberate fixture where TastePolicy loses. HUMAN-shaped validator fixtures in tests are not genuine human annotations. Existing database isolation/rollback coverage is preserved.

No production runtime/threshold changes, production database migration, new dependency, composite TasteScore, significance/confidence claim, M4/TasteTrajectory or merge. Benchmark validity and provider/human authenticity remain separate: provenance declarations/hashes are not signatures. A genuine human study and actual model outputs are necessary before human-agreement or comparative claims.
