# ADR 0008 — TasteBench methodology v1

Recorded before benchmark code or results against merged main 61890f21ab0c71aa0a304fd9972ab5ce5439bd86. Canonical architecture v2 and accepted M1/M1.6/M2/M2.5 contracts and evaluation reports were read. TasteBench measures bounded authorization behavior, not cultural truth or recommendation accuracy.

## Isolation and unit

One versioned scenario is one SELECT_ENTITY proposal, five explicit signals, candidate, domain/context, immutable pseudonymous state and captured normalized evidence (or a typed missing-evidence reason). Optional independently registered engineering expectations, feedback transition, clarification answer, repair fixture and perturbations stay outside the system input. No PII, demographic inference, arbitrary URLs, credentials or conversations. All committed engineering inputs are explicitly SYNTHETIC, not human or live Qloo evidence. No runtime file imports TasteBench; deleting benchmarks/scripts does not affect production authorization. No production migration, dependency, UI/API, threshold or policy change.

## Data, splits and labels

Strict runtime validators reject unknown keys, malformed identities, nonfinite numbers, invalid states/lineage, invalid evidence and timestamps. Dataset manifests list sorted IDs, semantic/content hashes, counts by split/domain/source, annotation set/version, metric version, creation time and provenance. SHA-256 over canonical sorted JSON is order independent. Scenario content hashes exclude administrative ID/split and contract oracle so renamed cross-split duplicates are rejected. Dataset hashes include the split and oracle as well as each scenario hash. Annotation hashes include every record, including dissent; changing labels invalidates run references.

CALIBRATION and EVALUATION are disjoint by ID AND content hash. Threshold analysis accepts only a separately constructed calibration-only packet; evaluation labels cannot enter it. Threshold sensitivity is research only; production >0.80 ALLOW, 0.50–0.80 inclusive ASK, <0.50 REJECT remain unchanged. No tuning against held-out labels.

Human packets contain only allowlisted explicit signals/state/constraints/action/context, not system identity, Qloo scores, predictions, thresholds, previous annotations or oracle. The annotation target is whether this agent should proceed, ask, or not proceed under the presented explicit state/context. ALLOW/ASK/REJECT or UNSCORABLE; never UNAVAILABLE as a human preference label. Pseudonymous reference, reason categories, bounded comment, time/version and human-declared origin required. Synthetic scenarios cannot accept human labels. Import validation cannot authenticate a person's identity or the honesty of a provenance declaration; operator human review remains necessary. No human data is generated in this implementation session.

Preserve all annotations. A single human annotation may serve as a separately labeled single-annotator target. Multiple annotations require explicit human adjudication referencing those records; no majority-vote/automatic favorable label. Unadjudicated multi-annotator cases remain unscorable. Raw pairwise agreement may be reported with counts, without kappa/significance/confidence claims.

## Systems and information boundaries

- GENERIC_AI: explicit scenario action/candidate/signals/state/context only. No Qloo, oracle, annotation, future feedback, policy result or thresholds.
- LLM_QLOO: same packet plus allowlisted normalized affinity/scale/explanation/provenance. No TastePolicy decision/reason/receipt policy bucket.
- QLOO_POLICY: accepted cultural evidence and evaluateEvidence/createReceipt only; no persistent constraints or future feedback.
- FULL_TASTEPOLICY: accepted stateDecision on the specified before/current snapshot and captured cultural component. First prediction is recorded before scoring or interaction. No future feedback.
- AFTER_FEEDBACK: only registered cases with explicit structured event, valid before/after version linkage and event time no later than the after-evaluation time. Uses accepted stateDecision on that after snapshot. Contract synthetic events are not human personalization evidence.

External systems use file JSONL export/import, not shell execution or a model SDK. Prompt contracts are versioned and neutral; outputs require scenario/candidate/input hash, system/model/provider/prompt provenance, execution time, temperature/seed if supported and structured response hash. Malformed output becomes INVALID_OUTPUT, never guessed. No configured external output means ENVIRONMENT_BLOCKED; never fabricate responses. Baseline import declarations are not authentication.

## Metrics (predeclared)

All metrics expose raw counts and denominators; no composite TasteScore.

- Human policy agreement: exact matches / all scorable human targets. UNAVAILABLE and INVALID_OUTPUT remain in this denominator as nonmatches; separately expose their counts and valid-decision coverage. UNSCORABLE/unadjudicated/unlabeled cases excluded with counts. Confusion matrix is 3×3 for valid ALLOW/ASK/REJECT; unavailable and invalid are separate columns/counts.
- Unsafe autonomy: predicted ALLOW with target ASK/REJECT; report count / scorable targets, plus total ALLOW predictions. Excessive ASK: predicted ASK with target ALLOW / scorable targets. ASK versus REJECT remains a separate confusion cell.
- Contract compliance: matches / registered expectations for that system, explicitly engineering truth, never human preference accuracy.
- UNAVAILABLE count / executed scenarios with typed reason histogram. INVALID_OUTPUT count / executed scenarios. Environment-blocked systems are not executed predictions and never wins/losses.
- Replay: run each deterministic system three times with identical normalized input. Semantic hash excludes timing/receipt/request IDs; compare decision, basis/reasons and semantic receipt. Report mismatches / repeat comparisons.
- Registered stability: named score/price boundary perturbations with exact changed field and expected outcome declared in the dataset before execution. Report original/perturbed decision, observed change and expected-match count / registered cases. Not confidence. No four-signal requests.
- Feedback: after outcome and registered effect versus before outcome, event, state hash/version; matches / eligible transition expectations. This measures state consumption, not learned preference improvement.
- Interactive: captured ASK plan/factor/answer outcome and replay; repair status, constraint preservation, candidate-specific verification and provider bound through accepted interactive services using explicitly synthetic offline providers. First-decision metrics never substitute a later improved interaction result.
- Latency: monotonic performance.now execution windows, count/min/median/max; nearest-rank p95 only for n>=20. Offline CPU policy replay, offline synthetic-provider/SQL interaction and imported external model timings remain separate. Exclude disk/report setup from policy windows.
- Provider calls: actual wrapped provider method invocations, operation histogram, total/mean/max. Pure captured policy replay has zero; synthetic interaction calls are labeled fixture calls, not real HTTP. No increased ceilings/retries.
- Receipt completeness: only eligible available cultural evaluations, required existing v1 fields (identity/action/five signals/evidence provenance/raw+normalized score/scale/decision/policy/schema/normalization/request/time) checked against actual validated output. Report missing fields / eligible receipts and fully complete / eligible receipts. No fake receipt for unavailable evidence.

## Execution, provenance and reporting

Offline captured/synthetic mode only in initial implementation. Live benchmark mode is not implemented; no command can silently fetch Qloo. No mixed live/offline tables. Full accepted provider tests remain independent contract proof, not benchmark empirical results.

Run manifest binds code SHA/dirty state, Node/runtime, benchmark/dataset/annotation/metric versions and hashes, systems/prompt versions, time/run ID, evidence mode, exclusions and environment blocks. Semantic run hash excludes wall times, execution durations, request/receipt/run IDs; dataset/input hashes retain fixed scenario times. Sorted output files: manifest.json, predictions.jsonl, scenario-results.jsonl, metrics.json and summary.md. Report generation revalidates manifest/dataset/annotation/prediction IDs, duplicate pairs, input/output hashes, counts and recomputes metrics; mismatches fail closed. Never overwrite source datasets; output directories must be new local ignored run directories.

No default post-hoc exclusions. Registered exclusions are surfaced with reason/stage. Malformed datasets fail the run instead of selectively removing cases. External malformed outputs remain counted. No cherry-picking, significance tests, confidence intervals, market claims or comparative win without actual baseline/human evidence. Two independent runs over the same dataset/config must match semantic prediction/result/metric hashes; nondeterministic timing summaries are explicitly excluded. Meta-tests must allow TastePolicy to lose.

## Environment and publication

No genuine human labels => TASTEBENCH_HUMAN_EVALUATION_NOT_RUN. No external runs => TASTEBENCH_GENERIC_LLM_BASELINE_ENVIRONMENT_BLOCKED and TASTEBENCH_LLM_QLOO_BASELINE_ENVIRONMENT_BLOCKED. These do not block secret-free infrastructure validation. Initial engineering results must say SYNTHETIC CONTRACT SCENARIOS, not human accuracy. No M4/TasteTrajectory, TasteProxy, public dashboard, production database work or merge.
