import { randomUUID } from "node:crypto";
import type {
  Dataset,
  AnnotationSet,
  Prediction,
  Run,
  System,
  ScenarioResult,
} from "./types";
import { SYSTEMS } from "./types";
import {
  manifest,
  hash,
  requireThat,
  object,
  finite,
  isDecision,
  hex,
  timestamp,
  identifier,
} from "./validate";
import { execute, resultFor } from "./execute";
import { externalPrediction, semanticPrediction, inputHash } from "./packets";
import { metrics, semanticMetrics, target } from "./metrics";
const semanticResults = (rs: ScenarioResult[]) =>
  rs.map((r) => ({
    ...r,
    interaction: r.interaction
      ? { ...r.interaction, elapsedMs: undefined }
      : null,
  }));
function artifacts(
  ps: Prediction[],
  rs: ScenarioResult[],
  m: ReturnType<typeof metrics>,
) {
  return {
    predictions: hash(ps.map(semanticPrediction)),
    results: hash(semanticResults(rs)),
    metrics: hash(semanticMetrics(m)),
  };
}
export async function run(
  d: Dataset,
  a: AnnotationSet,
  code: { sha: string; dirty: boolean },
  external: Partial<Record<"GENERIC_AI" | "LLM_QLOO", unknown[]>> = {},
): Promise<Run> {
  const dataset = manifest(d, a);
  requireThat(/^[a-f0-9]{40}$/.test(code.sha));
  const predictions: Prediction[] = [],
    results: ScenarioResult[] = [];
  // Predictions are all recorded before the scoring phase ever sees annotations.
  for (const s of [...d.scenarios].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const system of SYSTEMS) {
      if (system === "AFTER_FEEDBACK" && !s.feedback) continue;
      if (system === "GENERIC_AI" || system === "LLM_QLOO") {
        const rows = external[system];
        if (!rows) continue;
        requireThat(rows.length === d.scenarios.length);
        const matches = rows.filter(
          (v) =>
            typeof v === "object" &&
            v !== null &&
            (v as { scenarioId?: string }).scenarioId === s.id,
        );
        requireThat(matches.length === 1);
        predictions.push(externalPrediction(s, system, matches[0]));
      } else predictions.push(execute(s, system));
    }
  }
  for (const p of predictions)
    results.push(
      await resultFor(
        d.scenarios.find((s) => s.id === p.scenarioId)!,
        p,
      ),
    );
  const m = metrics(d, a, predictions, results),
    blocks = [];
  const hasScorableHeldOutTarget = d.scenarios.some((s) => {
    if (s.split !== "EVALUATION") return false;
    const resolved = target(a, s.id);
    return resolved !== null && resolved.label !== "UNSCORABLE";
  });
  if (!hasScorableHeldOutTarget)
    blocks.push("TASTEBENCH_HUMAN_EVALUATION_NOT_RUN");
  if (!external.GENERIC_AI)
    blocks.push("TASTEBENCH_GENERIC_LLM_BASELINE_ENVIRONMENT_BLOCKED");
  if (!external.LLM_QLOO)
    blocks.push("TASTEBENCH_LLM_QLOO_BASELINE_ENVIRONMENT_BLOCKED");
  const artifactHashes = artifacts(predictions, results, m);
  const body = {
    schemaVersion: "tastebench-run-v1" as const,
    runId: randomUUID(),
    timestamp: new Date().toISOString(),
    codeSha: code.sha,
    dirty: code.dirty,
    node: process.version,
    dataset,
    evidenceMode: "CAPTURED" as const,
    systems: SYSTEMS.filter((s) => predictions.some((p) => p.systemId === s)),
    systemVersion: "tastebench-adapters-v1" as const,
    systemVersions: Object.fromEntries(
      SYSTEMS.filter((s) => predictions.some((p) => p.systemId === s)).map(
        (s) => [
          s,
          [
            ...new Set(
              predictions
                .filter((p) => p.systemId === s)
                .map((p) => p.systemVersion),
            ),
          ].sort(),
        ],
      ),
    ),
    promptVersion: "authorization-neutral-v1" as const,
    metricVersion: "tastebench-metrics-v1" as const,
    blocked: blocks,
    scenarioCount: d.scenarios.length,
    predictionCount: predictions.length,
    exclusions: [] as [],
    seed: null,
    artifactHashes,
    rawArtifactHashes: {
      predictions: hash(predictions),
      results: hash(results),
      metrics: hash(m),
    },
  };
  const result = {
    manifest: {
      ...body,
      semanticHash: hash({
        codeSha: code.sha,
        datasetHash: dataset.datasetHash,
        annotationHash: dataset.annotationHash,
        systems: body.systems,
        artifactHashes,
        metricVersion: body.metricVersion,
      }),
    },
    predictions,
    results,
    metrics: m,
  };
  validateRun(d, a, result);
  return result;
}
export function validatePrediction(x: unknown): asserts x is Prediction {
  const p = object(x, [
    "schemaVersion",
    "scenarioId",
    "systemId",
    "systemVersion",
    "candidateId",
    "inputHash",
    "status",
    "decision",
    "basis",
    "reason",
    "evidenceMode",
    "dataSource",
    "latencyMs",
    "latencyKind",
    "providerCalls",
    "provenance",
    "receipt",
    "semanticHash",
  ]);
  requireThat(
    p.schemaVersion === "tastebench-prediction-v1" &&
      identifier(p.scenarioId) &&
      SYSTEMS.includes(p.systemId as System) &&
      typeof p.systemVersion === "string" &&
      p.systemVersion.length <= 120 &&
      typeof p.candidateId === "string" &&
      hex(p.inputHash) &&
      ["OK", "INVALID_OUTPUT"].includes(p.status as string) &&
      (p.status === "OK" ? isDecision(p.decision) : p.decision === null) &&
      typeof p.basis === "string" &&
      (p.reason === null || typeof p.reason === "string") &&
      p.evidenceMode === "CAPTURED" &&
      ["SYNTHETIC", "CAPTURED"].includes(p.dataSource as string) &&
      finite(p.latencyMs) &&
      ["OFFLINE_POLICY", "EXTERNAL_MODEL"].includes(p.latencyKind as string) &&
      Number.isSafeInteger(p.providerCalls) &&
      (p.providerCalls as number) >= 0 &&
      (p.providerCalls as number) <= 5 &&
      hex(p.semanticHash),
  );
  requireThat(
    p.systemId === "GENERIC_AI" || p.systemId === "LLM_QLOO"
      ? p.latencyKind === "EXTERNAL_MODEL" && p.receipt === null
      : p.latencyKind === "OFFLINE_POLICY" && p.providerCalls === 0,
  );
  object(
    p.provenance,
    p.systemId === "GENERIC_AI" || p.systemId === "LLM_QLOO"
      ? [
          "provider",
          "model",
          "modelVersion",
          "promptVersion",
          "executedAt",
          "temperature",
          "seed",
          "responseHash",
        ]
      : ["method", "policyVersion"],
  );
  requireThat(p.semanticHash === hash(semanticPrediction(x as Prediction)));
}
export function validateRun(d: Dataset, a: AnnotationSet, r: Run) {
  const expected = manifest(d, a),
    m = r.manifest;
  object(m, [
    "schemaVersion",
    "runId",
    "timestamp",
    "codeSha",
    "dirty",
    "node",
    "dataset",
    "evidenceMode",
    "systems",
    "systemVersion",
    "systemVersions",
    "promptVersion",
    "metricVersion",
    "blocked",
    "scenarioCount",
    "predictionCount",
    "exclusions",
    "seed",
    "artifactHashes",
    "rawArtifactHashes",
    "semanticHash",
  ]);
  requireThat(
    m.schemaVersion === "tastebench-run-v1" &&
      identifier(m.runId) &&
      timestamp(m.timestamp) &&
      /^[a-f0-9]{40}$/.test(m.codeSha) &&
      typeof m.dirty === "boolean" &&
      typeof m.node === "string" &&
      hash(m.dataset) === hash(expected) &&
      m.evidenceMode === "CAPTURED" &&
      m.systemVersion === "tastebench-adapters-v1" &&
      m.promptVersion === "authorization-neutral-v1" &&
      m.metricVersion === "tastebench-metrics-v1" &&
      m.seed === null &&
      Array.isArray(m.exclusions) &&
      m.exclusions.length === 0 &&
      Array.isArray(m.blocked) &&
      m.blocked.every((b) =>
        [
          "TASTEBENCH_HUMAN_EVALUATION_NOT_RUN",
          "TASTEBENCH_GENERIC_LLM_BASELINE_ENVIRONMENT_BLOCKED",
          "TASTEBENCH_LLM_QLOO_BASELINE_ENVIRONMENT_BLOCKED",
        ].includes(b),
      ) &&
      Array.isArray(m.systems) &&
      new Set(m.systems).size === m.systems.length &&
      m.systems.every((s) => SYSTEMS.includes(s)),
  );
  requireThat(
    Array.isArray(r.predictions) &&
      Array.isArray(r.results) &&
      r.predictions.length === m.predictionCount &&
      m.scenarioCount === d.scenarios.length,
  );
  const seen = new Set();
  for (const p of r.predictions) {
    validatePrediction(p);
    const s = d.scenarios.find((s) => s.id === p.scenarioId);
    requireThat(
      s &&
        s.input.candidate.id === p.candidateId &&
        p.inputHash === inputHash(s, p.systemId) &&
        p.dataSource === s.source &&
        !seen.has(p.scenarioId + ":" + p.systemId),
    );
    if (!["GENERIC_AI", "LLM_QLOO"].includes(p.systemId))
      requireThat(
        p.semanticHash === execute(s, p.systemId).semanticHash,
        "TASTEBENCH_DETERMINISTIC_OUTPUT_MISMATCH",
      );
    seen.add(p.scenarioId + ":" + p.systemId);
  }
  for (const system of m.systems) {
    const ps = r.predictions.filter((p) => p.systemId === system);
    requireThat(
      ps.length ===
        d.scenarios.filter((s) => system !== "AFTER_FEEDBACK" || !!s.feedback)
          .length,
    );
  }
  requireThat(
    hash(m.systemVersions) ===
      hash(
        Object.fromEntries(
          m.systems.map((s) => [
            s,
            [
              ...new Set(
                r.predictions
                  .filter((p) => p.systemId === s)
                  .map((p) => p.systemVersion),
              ),
            ].sort(),
          ]),
        ),
      ),
  );
  requireThat(
    hash(m.systems) ===
      hash(SYSTEMS.filter((s) => r.predictions.some((p) => p.systemId === s))),
  );
  const resultKeys = new Set();
  for (const result of r.results) {
    object(result, [
      "scenarioId",
      "systemId",
      "predictionHash",
      "contractExpected",
      "contractMatch",
      "replay",
      "stability",
      "interaction",
      "feedback",
    ]);
    const p = r.predictions.find(
        (p) =>
          p.scenarioId === result.scenarioId && p.systemId === result.systemId,
      ),
      s = d.scenarios.find((s) => s.id === result.scenarioId);
    requireThat(
      p &&
        s &&
        !resultKeys.has(result.scenarioId + ":" + result.systemId) &&
        result.predictionHash === p.semanticHash &&
        result.contractExpected === (s.contract[p.systemId] ?? null) &&
        result.contractMatch ===
          (s.contract[p.systemId] === undefined
            ? null
            : p.decision === s.contract[p.systemId]),
    );
    resultKeys.add(result.scenarioId + ":" + result.systemId);
    object(result.replay, ["comparisons", "mismatches"]);
    requireThat(
      result.replay.comparisons ===
        (!["GENERIC_AI", "LLM_QLOO"].includes(p.systemId) ? 2 : 0),
    );
    requireThat(Array.isArray(result.stability));
    for (const row of result.stability) {
      object(row, [
        "id",
        "field",
        "original",
        "perturbed",
        "expected",
        "matches",
      ]);
      const change = s.perturbations.find((c) => c.id === row.id);
      requireThat(
        change &&
          row.field === change.field &&
          row.original === p.decision &&
          row.expected === change.expected &&
          isDecision(row.perturbed) &&
          row.matches === (row.perturbed === row.expected),
      );
    }
    if (result.interaction) {
      const i = result.interaction;
      object(i, [
        "kind",
        "expected",
        "actual",
        "matches",
        "calls",
        "operations",
        "constraintPreserved",
        "candidateVerified",
        "elapsedMs",
        "semanticHash",
      ]);
      requireThat(
        ["CLARIFICATION", "REPAIR"].includes(i.kind) &&
          typeof i.actual === "string" &&
          typeof i.matches === "boolean" &&
          Number.isSafeInteger(i.calls) &&
          i.calls >= 0 &&
          i.calls <= 4 &&
          finite(i.elapsedMs) &&
          hex(i.semanticHash) &&
          typeof i.constraintPreserved === "boolean" &&
          typeof i.candidateVerified === "boolean" &&
          Object.values(i.operations).every(
            (v) => Number.isSafeInteger(v) && v >= 0,
          ) &&
          Object.values(i.operations).reduce((n, v) => n + v, 0) === i.calls,
      );
    }
    requireThat(
      !!result.interaction ===
        (p.systemId === "FULL_TASTEPOLICY" && !!(s.clarification || s.repair)),
    );
    if (result.feedback) {
      object(result.feedback, [
        "before",
        "after",
        "expected",
        "matches",
        "stateVersion",
        "stateHash",
      ]);
      requireThat(
        s.feedback &&
          result.feedback.expected === s.feedback.expected &&
          result.feedback.after === p.decision &&
          result.feedback.stateVersion === s.feedback.after.stateVersion &&
          result.feedback.stateHash === s.feedback.after.stateHash &&
          result.feedback.matches === (p.decision === s.feedback.expected),
      );
    }
    requireThat(!!result.feedback === (p.systemId === "AFTER_FEEDBACK"));

    requireThat(
      Number.isSafeInteger(result.replay.comparisons) &&
        result.replay.comparisons >= 0 &&
        Number.isSafeInteger(result.replay.mismatches) &&
        result.replay.mismatches >= 0 &&
        result.replay.mismatches <= result.replay.comparisons,
    );
  }
  requireThat(
    hash(m.rawArtifactHashes) ===
      hash({
        predictions: hash(r.predictions),
        results: hash(r.results),
        metrics: hash(r.metrics),
      }),
    "TASTEBENCH_RAW_ARTIFACT_HASH_MISMATCH",
  );
  requireThat(
    hash(r.metrics) === hash(metrics(d, a, r.predictions, r.results)),
    "TASTEBENCH_METRIC_RECONCILIATION_FAILED",
  );
  requireThat(
    hash(m.artifactHashes) ===
      hash(artifacts(r.predictions, r.results, r.metrics)),
    "TASTEBENCH_ARTIFACT_HASH_MISMATCH",
  );
  requireThat(
    m.semanticHash ===
      hash({
        codeSha: m.codeSha,
        datasetHash: m.dataset.datasetHash,
        annotationHash: m.dataset.annotationHash,
        systems: m.systems,
        artifactHashes: m.artifactHashes,
        metricVersion: m.metricVersion,
      }),
  );
}
export function report(r: Run) {
  return `# TasteBench run ${r.manifest.runId}\n\nCode: ${r.manifest.codeSha}; dirty: ${r.manifest.dirty}. Dataset ${r.manifest.dataset.datasetVersion} / ${r.manifest.dataset.datasetHash}. Annotation version/hash: ${r.manifest.dataset.annotationVersion} / ${r.manifest.dataset.annotationHash}. Metric definition: ${r.manifest.metricVersion}.\n\nCAPTURED EVIDENCE; data sources: ${JSON.stringify(r.manifest.dataset.sourceCounts)}. Synthetic contract cases are not human preference accuracy.\n\nSplits: ${JSON.stringify(r.manifest.dataset.splitCounts)}; domains: ${JSON.stringify(r.manifest.dataset.domainCounts)}. Exclusions: none. Systems executed: ${r.manifest.systems.join(", ")}. Blocked: ${r.manifest.blocked.join(", ") || "none"}. Human labels/adjudications: ${r.metrics.annotationCoverage.records}/${r.metrics.annotationCoverage.adjudications}. Single-annotator and adjudicated counts are separate in metrics.json.\n\nMethodology: ADR 0008 and docs/evaluation/tastebench-methodology.md. First authorization is distinct from subsequent clarification/repair. No significance, confidence, composite score or comparative-win claim. Production thresholds unchanged: >0.80 ALLOW, 0.50–0.80 inclusive ASK, <0.50 REJECT. Offline policy, synthetic SQL/provider interaction and external-model latency are separate; no live run is mixed here. Provider counts in fixture interactions are not HTTP calls. P95 requires at least 20 observations.\n\nAll counts and denominators below recompute from scenario-results.jsonl and predictions.jsonl. Semantic hash: ${r.manifest.semanticHash}.\n\n\`\`\`json\n${JSON.stringify(r.metrics, null, 2)}\n\`\`\`\n`;
}
export function validateStoredManifest(
  value: unknown,
  d: Dataset,
  a: AnnotationSet,
) {
  requireThat(
    hash(value) === hash(manifest(d, a)),
    "TASTEBENCH_DATASET_MANIFEST_MISMATCH",
  );
}
