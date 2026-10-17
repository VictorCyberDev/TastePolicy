# M3 — TasteBench operations and boundaries

TasteBench evaluates cultural authorization behavior outside the production runtime. Canonical architecture v2 remains authoritative and unchanged. No production source, threshold, provider, receipt, graph, UI/API, gateway, accepted verifier or migration is modified. Deleting all TasteBench code/tests/docs leaves the accepted runtime independent. No dependency was added; pinned development-only PGlite is reused for isolated repair contract execution.

Read [ADR 0008](../decisions/0008-tastebench-methodology.md) and [methodology](../evaluation/tastebench-methodology.md) before interpreting output. The committed 24 cases are synthetic contract fixtures, not a representative population or human preference study. Default annotation set is empty. No live Qloo mode is implemented; offline execution cannot construct the production provider. Actual prior live Qloo acceptance is separate historical evidence.

## Commands

Use Node 24 and npm ci. No external credentials required.

```sh
npm run tastebench:validate
npm run tastebench:contract -- .tastebench/run-one
npm run tastebench:run -- .tastebench/run-two
npm run tastebench:report -- .tastebench/run-one
npm run tastebench:export -- .tastebench/packets
npm run tastebench:calibration -- .tastebench/calibration
```

Output directories must be NEW direct/nested paths beneath ignored .tastebench (create a nested parent separately if needed). Existing runs are never overwritten. A run produces manifest.json, predictions.jsonl, scenario-results.jsonl, metrics.json, annotations.json and summary.md. Report command validates the dataset, annotation and raw/semantic artifact hashes and recomputes every aggregate; it then checks the existing report text. No console-only results. Run manifests declare code SHA/dirty state and runtime/version metadata. Measure offline policy CPU, offline synthetic-provider/SQL and externally declared model latency separately.

## Human workflow

The engineering corpus is not eligible for human annotations. Curate a separate sanitized CAPTURED/HUMAN dataset using the schema in benchmarks/tastebench/v1/schemas/contracts.md; keep the same layout (scenarios/engineering.json is a filename, not a provenance assertion). Set kind HUMAN, source CAPTURED and empty contract oracles; use genuine normalized captured evidence, explicit pseudonymous state and no PII. This implementation does not curate a real human dataset for you. Use the exported library manifest function to register the dataset manifest before execution and freeze split assignment; do not change held-out inputs after seeing outputs.

Pass `--dataset path/to/dataset-root` to every command. Export generates annotation-packet.jsonl without scores, decisions, system identity, thresholds or prior labels. It is empty for the engineering-only corpus. Humans independently answer the authorization question and supply records per schema; UNSCORABLE is allowed. Preserve disagreement. More than one annotation requires explicit human adjudication to create a scoring target, not majority vote. A single annotation is labeled SINGLE_ANNOTATOR. Operator must verify genuine provenance; schema declarations are not authentication.

```sh
npm run tastebench:annotations -- .tastebench/imported completed-annotations.json --dataset path/to/dataset-root
npm run tastebench:run -- .tastebench/human-run --dataset path/to/dataset-root --annotations .tastebench/imported/annotations.json
npm run tastebench:report -- .tastebench/human-run --dataset path/to/dataset-root
```

No genuine labels were supplied during initial implementation: TASTEBENCH_HUMAN_EVALUATION_NOT_RUN. Empty human denominators remain null, never a zero-percent or perfect-accuracy claim.

## External baseline workflow

Export generic-ai.jsonl and llm-qloo.jsonl packets. Use the corresponding versioned neutral prompt contract with a genuine external model/process, outside TastePolicy. This tool does not execute arbitrary shell commands, install an SDK, read model credentials or invent responses. Wrap each structured response in tastebench-external-v1 with its exact scenario/candidate/input hash, provider/model/version, prompt version, temperature/seed (or null), execution timestamp, latency, provider count and canonical response hash. Operator runs the actual model; self-declared provenance alone is not independently authenticated.

```sh
npm run tastebench:run -- .tastebench/external-run actual-generic-output.jsonl actual-llm-qloo-output.jsonl
```

A supplied baseline must contain exactly one result for every registered scenario. Cannot cherry-pick successful rows; malformed response bodies remain INVALID_OUTPUT, while unparseable/unattributable JSONL envelopes fail import. Generic packets contain no Qloo evidence; Qloo packets contain no TastePolicy decision/policy bucket/reason code. Labels/oracles/future feedback never enter either packet. No real external runs were available: both baseline ENVIRONMENT_BLOCKED states are explicit. Do not publish a comparative win.

## Scope and limits

QLOO_POLICY uses the accepted cultural evaluator/receipt builder without persistent constraints. FULL_TASTEPOLICY uses specified state/context and accepted stateDecision. AFTER_FEEDBACK alone consumes a validated registered later state/event; first predictions cannot see it. Synthetic feedback cases test state consumption, not improved human understanding. Interactive results are separate from first-decision agreement. Repair fixtures run actual accepted services under four calls/one verified candidate, with captured replay/no invented price; fixture calls are not live HTTP calls. Existing protected cross-profile tests remain authoritative isolation coverage.

No composite score, significance test, confidence interval, calibrated accuracy, demographic inference, production benchmark dashboard/API, production DB work or M4/TasteTrajectory. Hosted persistence and native multi-client contention are still separate accepted operational limits, not reasons to fabricate benchmark proof.
