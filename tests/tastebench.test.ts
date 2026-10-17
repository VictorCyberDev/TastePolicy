// @vitest-environment node
// All HUMAN-shaped records in tests are validator fixtures, not real annotations.
import { it, expect, beforeAll, vi } from "vitest";
import datasetJson from "../benchmarks/tastebench/v1/scenarios/engineering.json";
import annotationJson from "../benchmarks/tastebench/v1/annotations/empty.json";
import manifestJson from "../benchmarks/tastebench/v1/manifests/engineering.json";
import type {
  Dataset,
  AnnotationSet,
  Scenario,
  Prediction,
  Run,
  ExternalOutput,
  Annotation,
} from "../benchmarks/tastebench/lib/types";
import {
  manifest,
  scenarioHash,
  validateScenario,
  validateAnnotations,
  validateInput,
  hash,
} from "../benchmarks/tastebench/lib/validate";
import {
  packet,
  annotationPacket,
  calibrationPacket,
  thresholdSensitivity,
  externalPrediction,
} from "../benchmarks/tastebench/lib/packets";
import {
  execute,
  resultFor,
  receiptCompleteness,
} from "../benchmarks/tastebench/lib/execute";
import {
  run,
  validateRun,
  validatePrediction,
  validateStoredManifest,
  report,
} from "../benchmarks/tastebench/lib/run";
import {
  metrics,
  semanticMetrics,
  target,
  latency,
} from "../benchmarks/tastebench/lib/metrics";
const d = datasetJson as Dataset,
  a = annotationJson as AnnotationSet,
  code = { sha: "61890f21ab0c71aa0a304fd9972ab5ce5439bd86", dirty: false };
let first: Run, second: Run;
beforeAll(async () => {
  first = await run(d, a, code);
  second = await run(d, a, code);
}, 60000);
const clone = <T>(x: T): T => structuredClone(x);
const scenario = (id = "cultural-allow") =>
  clone(d.scenarios.find((s) => s.id === id)!);
function human() {
  const s = scenario();
  s.id = "human-validator-fixture";
  s.kind = "HUMAN";
  s.source = "CAPTURED";
  s.contract = {};
  s.contentHash = scenarioHash(s);
  return s;
}
function annotation(
  s: Scenario,
  label: Annotation["label"] = "ALLOW",
  annotator = "annotator-1",
): Annotation {
  return {
    schemaVersion: "tastebench-annotation-v1",
    version: "test-v1",
    scenarioId: s.id,
    source: "HUMAN",
    annotator,
    label,
    reasons: ["CONTEXT"],
    annotatedAt: "2026-10-16T13:00:00.000Z",
  };
}
function external(
  s: Scenario,
  system: "GENERIC_AI" | "LLM_QLOO",
  response: unknown = { decision: "ASK", reason: "INSUFFICIENT_CONTEXT" },
): ExternalOutput {
  return {
    schemaVersion: "tastebench-external-v1",
    scenarioId: s.id,
    systemId: system,
    candidateId: s.input.candidate.id,
    inputHash: packet(s, system).inputHash,
    response,
    provider: "test-fixture-provider",
    model: "test-fixture-model",
    modelVersion: "test-only-v1",
    promptVersion: "authorization-neutral-v1",
    executedAt: "2026-10-16T13:00:00.000Z",
    temperature: 0,
    seed: 1,
    responseHash: hash(response),
    latencyMs: 12,
    providerCalls: 0,
  };
}
it("registered dataset and manifest validate without live credentials", () => {
  expect(manifest(d, a)).toEqual(manifestJson);
  expect(d.scenarios).toHaveLength(24);
});
it.each(["id", "contentHash", "input", "contract", "source"] as const)(
  "rejects malformed scenario %s",
  (field) => {
    const s = scenario() as unknown as Record<string, unknown>;
    s[field] = null;
    expect(() => validateScenario(s)).toThrow();
  },
);
it("rejects malformed state, nonfinite score and missing mandatory fields", () => {
  for (const mutate of [
    (s: Scenario) => {
      s.input.state.stateVersion = -1;
    },
    (s: Scenario) => {
      if (s.input.cultural.status === "available")
        s.input.cultural.data.alignmentScore = NaN;
    },
    (s: Scenario) => {
      delete (s.input as Partial<Scenario["input"]>).candidate;
    },
  ]) {
    const s = scenario();
    mutate(s);
    expect(() => validateInput(s.input)).toThrow();
  }
});
it("rejects extra fields that could carry labels or secrets", () => {
  const s = scenario();
  Object.assign(s.input.state, { goldLabel: "ALLOW" });
  s.contentHash = scenarioHash(s);
  expect(() => packet(s, "GENERIC_AI")).toThrow();
});
it("rejects duplicate IDs across splits", () => {
  const copy = clone(d);
  const s = scenario("cultural-ask");
  s.id = copy.scenarios[0].id;
  copy.scenarios.push(s);
  expect(() => manifest(copy, a)).toThrow("DUPLICATE");
});
it("rejects renamed semantic duplicates across splits", () => {
  const copy = clone(d),
    s = scenario();
  s.id = "renamed";
  s.split = s.split === "EVALUATION" ? "CALIBRATION" : "EVALUATION";
  copy.scenarios.push(s);
  expect(() => manifest(copy, a)).toThrow("DUPLICATE");
});
it("scenario tamper invalidates both content and stored manifest", () => {
  const copy = clone(d);
  copy.scenarios[0].input.candidate.name = "changed";
  expect(() => manifest(copy, a)).toThrow();
  copy.scenarios[0].contentHash = scenarioHash(copy.scenarios[0]);
  expect(() => validateStoredManifest(manifestJson, copy, a)).toThrow();
});
it("file order cannot change the dataset or result semantic hashes", async () => {
  const reversed = { ...d, scenarios: [...d.scenarios].reverse() };
  expect(manifest(reversed, a)).toEqual(manifest(d, a));
  const subset = { ...d, scenarios: d.scenarios.filter((s) => !s.repair) };
  const x = await run(subset, a, code),
    y = await run(
      { ...subset, scenarios: [...subset.scenarios].reverse() },
      a,
      code,
    );
  expect(x.manifest.semanticHash).toBe(y.manifest.semanticHash);
});
it("all registered full-policy contract cases reconcile", () => {
  const rs = first.results.filter((r) => r.systemId === "FULL_TASTEPOLICY");
  expect(rs).toHaveLength(24);
  expect(rs.every((r) => r.contractMatch)).toBe(true);
});
it("all first predictions precede interaction and feedback scoring", () => {
  const p = first.predictions.find(
    (p) =>
      p.scenarioId === "clarification-acceptable" &&
      p.systemId === "FULL_TASTEPOLICY",
  )!;
  expect(p.decision).toBe("ASK");
  expect(
    first.results.find(
      (r) => r.scenarioId === p.scenarioId && r.systemId === p.systemId,
    )!.interaction!.actual,
  ).toBe("ALLOW");
});
it("generic and human packets exclude cultural evidence and oracle", () => {
  const s = scenario();
  const before = packet(s, "GENERIC_AI");
  s.contract.GENERIC_AI = "REJECT";
  const after = packet(s, "GENERIC_AI");
  expect(after).toEqual(before);
  const text = JSON.stringify(before);
  for (const forbidden of [
    "qlooEvidence",
    "alignmentScore",
    "reasonCode",
    "contract",
    "allowAbove",
    "annotation",
  ])
    expect(text).not.toContain(forbidden);
  const humanText = JSON.stringify(annotationPacket(s));
  expect(humanText).not.toContain("GENERIC_AI");
  expect(humanText).not.toContain("alignmentScore");
});
it("LLM+Qloo export provides evidence without TastePolicy outcome or policy bucket", () => {
  const p = packet(scenario(), "LLM_QLOO");
  const text = JSON.stringify(p);
  expect(text).toContain("alignmentScore");
  for (const forbidden of [
    "STRONG_ALIGNMENT",
    "reasonCode",
    "policyVersion",
    "allowAbove",
    "contract",
    "goldLabel",
  ])
    expect(text).not.toContain(forbidden);
});
it("Qloo-only policy never consumes exclusion state", () => {
  const s = scenario("exact-exclusion");
  expect(execute(s, "QLOO_POLICY").decision).toBe("ALLOW");
  expect(execute(s, "FULL_TASTEPOLICY").decision).toBe("REJECT");
});
it("full policy uses only its registered state version before feedback", () => {
  const s = scenario("applicable-feedback-transition");
  expect(execute(s, "FULL_TASTEPOLICY").decision).toBe("ALLOW");
  expect(execute(s, "AFTER_FEEDBACK").decision).toBe("REJECT");
  expect(
    first.results.find(
      (r) => r.scenarioId === s.id && r.systemId === "AFTER_FEEDBACK",
    )!.feedback!.matches,
  ).toBe(true);
});
it("future and unrelated feedback snapshots are rejected", () => {
  for (const mutation of [
    (s: Scenario) => {
      s.feedback!.event.createdAt = s.input.evaluatedAt;
    },
    (s: Scenario) => {
      s.feedback!.after.profileId = "b0000000-0000-4000-8000-000000000999";
    },
    (s: Scenario) => {
      s.feedback!.after.stateVersion = 50;
    },
  ]) {
    const s = scenario("applicable-feedback-transition");
    mutation(s);
    s.contentHash = scenarioHash(s);
    expect(() => validateScenario(s)).toThrow();
  }
});
it("held-out labels cannot enter calibration analysis", () => {
  const s = human();
  s.split = "EVALUATION";
  const labels = {
    schemaVersion: "tastebench-annotations-v1" as const,
    version: "test-v1",
    records: [annotation(s)],
    adjudications: [],
  };
  const p = calibrationPacket([s], labels);
  expect(p.scenarios).toEqual([]);
  expect(p.annotations.records).toEqual([]);
  const poisoned = { ...p, scenarios: [s] };
  expect(() =>
    thresholdSensitivity(poisoned, { allowAbove: 0.8, rejectBelow: 0.5 }),
  ).toThrow();
  expect(() =>
    thresholdSensitivity(
      { ...p, annotations: labels },
      { allowAbove: 0.8, rejectBelow: 0.5 },
    ),
  ).toThrow();
});
it("annotations cannot claim synthetic engineering cases are human evidence", () => {
  const labels = {
    ...a,
    version: "test-v1",
    records: [annotation(scenario())],
  };
  expect(() => validateAnnotations(labels, d.scenarios)).toThrow();
});
it("UNAVAILABLE is rejected as a human label", () => {
  const s = human(),
    labels = {
      ...a,
      version: "test-v1",
      records: [{ ...annotation(s), label: "UNAVAILABLE" }],
    };
  expect(() => validateAnnotations(labels, [s])).toThrow();
});
it("single annotations are labeled single and disagreement is not auto adjudicated", () => {
  const s = human(),
    records = [annotation(s)];
  const labels = { ...a, version: "test-v1", records };
  validateAnnotations(labels, [s]);
  expect(target(labels, s.id)?.method).toBe("SINGLE_ANNOTATOR");
  records.push(annotation(s, "REJECT", "annotator-2"));
  validateAnnotations(labels, [s]);
  expect(target(labels, s.id)).toBeNull();
});
it("explicit adjudication must reference all human records and preserves dissent", () => {
  const s = human(),
    records = [annotation(s), annotation(s, "REJECT", "annotator-2")];
  const labels: AnnotationSet = {
    ...a,
    version: "test-v1",
    records,
    adjudications: [
      {
        scenarioId: s.id,
        label: "ASK",
        source: "HUMAN_ADJUDICATION",
        reviewer: "reviewer-1",
        annotationHashes: records.map(hash),
        adjudicatedAt: "2026-10-16T14:00:00.000Z",
      },
    ],
  };
  validateAnnotations(labels, [s]);
  expect(target(labels, s.id)?.label).toBe("ASK");
  expect(labels.records).toHaveLength(2);
  labels.adjudications[0].annotationHashes.pop();
  expect(() => validateAnnotations(labels, [s])).toThrow();
});
it("annotation tamper changes the manifest and invalidates an existing run reference", async () => {
  const s = human(),
    labels: AnnotationSet = {
      ...a,
      version: "test-v1",
      records: [annotation(s)],
      adjudications: [],
    },
    data = { ...d, annotationVersion: "test-v1", scenarios: [s] };
  const r = await run(data, labels, code);
  const changed = clone(labels);
  changed.records[0].label = "REJECT";
  expect(manifest(data, labels).annotationHash).not.toBe(
    manifest(data, changed).annotationHash,
  );
  expect(() => validateRun(data, changed, r)).toThrow();
});
it.each([
  "ALLOW please",
  { decision: "ALLOW", extra: "label" },
  null,
  {},
  ["ALLOW"],
])("malformed external response remains INVALID_OUTPUT (%j)", (response) => {
  const s = scenario();
  const p = externalPrediction(
    s,
    "GENERIC_AI",
    external(s, "GENERIC_AI", response),
  );
  expect(p.status).toBe("INVALID_OUTPUT");
  expect(p.decision).toBeNull();
});
it("external response provenance, identity and input hashes are mandatory", () => {
  const s = scenario();
  for (const changes of [
    { inputHash: "a".repeat(64) },
    { model: "" },
    { candidateId: "wrong" },
    { responseHash: "a".repeat(64) },
  ])
    expect(() =>
      externalPrediction(s, "GENERIC_AI", {
        ...external(s, "GENERIC_AI"),
        ...changes,
      }),
    ).toThrow();
});
it("partial external baseline coverage fails instead of cherry-picking", async () => {
  await expect(
    run(d, a, code, { GENERIC_AI: [external(d.scenarios[0], "GENERIC_AI")] }),
  ).rejects.toThrow();
});
it("UNAVAILABLE remains distinct from rejection, including independent block precedence", () => {
  expect(
    execute(scenario("missing-evidence"), "FULL_TASTEPOLICY").decision,
  ).toBe("UNAVAILABLE");
  expect(
    execute(scenario("hard-block-outage"), "FULL_TASTEPOLICY").decision,
  ).toBe("REJECT");
  expect(
    execute(scenario("missing-evidence"), "FULL_TASTEPOLICY").receipt,
  ).toBeNull();
});
it("all deterministic replay comparisons and two independent runs match", () => {
  expect(first.results.every((r) => r.replay.mismatches === 0)).toBe(true);
  expect(first.manifest.artifactHashes).toEqual(second.manifest.artifactHashes);
  expect(first.manifest.semanticHash).toBe(second.manifest.semanticHash);
  expect(first.manifest.runId).not.toBe(second.manifest.runId);
});
it("registered boundary perturbations match exact accepted semantics", () => {
  const rs = first.results.flatMap((r) => r.stability);
  expect(rs).toHaveLength(11);
  expect(rs.every((r) => r.matches)).toBe(true);
  expect(rs.find((r) => r.id === "score-2")!.perturbed).toBe("ASK");
});
it("interactive contracts cover no-actionable multi-currency, dispositions and captured answers", () => {
  const rs = first.results.filter(
    (r) => r.interaction?.kind === "CLARIFICATION",
  );
  expect(rs).toHaveLength(6);
  expect(
    rs.every((r) => r.interaction!.matches && r.interaction!.calls === 0),
  ).toBe(true);
});
it("repair executes actual protected services and repository SQL under four fixture calls", () => {
  const rs = first.results.filter((r) => r.interaction?.kind === "REPAIR");
  expect(rs).toHaveLength(5);
  expect(
    rs.every(
      (r) =>
        r.interaction!.matches &&
        r.interaction!.calls <= 4 &&
        r.interaction!.constraintPreserved,
    ),
  ).toBe(true);
  expect(
    rs
      .filter((r) => r.interaction!.actual === "REPAIR_AVAILABLE")
      .every((r) => r.interaction!.candidateVerified),
  ).toBe(true);
});
it("offline execution has zero live network calls", async () => {
  const f = vi.spyOn(globalThis, "fetch");
  try {
    execute(scenario(), "FULL_TASTEPOLICY");
    expect(f).not.toHaveBeenCalled();
  } finally {
    f.mockRestore();
  }
});
it("receipt completeness checks actual output and missing fields are visible", () => {
  const p = execute(scenario(), "FULL_TASTEPOLICY");
  expect(receiptCompleteness(p)).toEqual({ eligible: true, missing: [] });
  delete (p.receipt as Partial<NonNullable<Prediction["receipt"]>>).requestId;
  expect(receiptCompleteness(p).missing).toContain("requestId");
});
it("instrumentation does not change semantic prediction", () => {
  const x = execute(scenario(), "FULL_TASTEPOLICY"),
    y = execute(scenario(), "FULL_TASTEPOLICY");
  expect(x.semanticHash).toBe(y.semanticHash);
  expect(x.providerCalls).toBe(0);
});
it("metrics expose counts, no human agreement without human data", () => {
  expect(first.metrics.annotationCoverage.records).toBe(0);
  const m = first.metrics.bySystem.FULL_TASTEPOLICY as {
    splits: { EVALUATION: { human: { agreement: { rate: null } } } };
  };
  expect(m.splits.EVALUATION.human.agreement.rate).toBeNull();
});
it("report reconciliation rejects changed summary counts, duplicate predictions and invalid outputs", () => {
  const r = clone(first);
  r.metrics.annotationCoverage.records++;
  expect(() => validateRun(d, a, r)).toThrow();
  const dup = clone(first);
  dup.predictions.push(dup.predictions[0]);
  expect(() => validateRun(d, a, dup)).toThrow();
  const p = clone(first.predictions[0]);
  Object.assign(p, { decision: "SURE" });
  expect(() => validatePrediction(p)).toThrow();
});
it("a deliberately worse TastePolicy prediction loses to another system", async () => {
  const s = human(),
    labels: AnnotationSet = {
      ...a,
      version: "test-v1",
      records: [annotation(s, "REJECT")],
      adjudications: [],
    },
    data = { ...d, annotationVersion: "test-v1", scenarios: [s] };
  const full = execute(s, "FULL_TASTEPOLICY"),
    other = externalPrediction(
      s,
      "GENERIC_AI",
      external(s, "GENERIC_AI", {
        decision: "REJECT",
        reason: "EXPLICIT_CONSTRAINT",
      }),
    );
  const ps = [other, full],
    rs = await Promise.all(ps.map((p) => resultFor(s, p))),
    m = metrics(data, labels, ps, rs);
  const systems = m.bySystem as Record<
    string,
    {
      splits: {
        EVALUATION: {
          human: {
            agreement: { numerator: number };
            unsafeAutonomy: { numerator: number };
          };
        };
      };
    }
  >;
  expect(systems.GENERIC_AI.splits.EVALUATION.human.agreement.numerator).toBe(
    1,
  );
  expect(
    systems.FULL_TASTEPOLICY.splits.EVALUATION.human.agreement.numerator,
  ).toBe(0);
  expect(
    systems.FULL_TASTEPOLICY.splits.EVALUATION.human.unsafeAutonomy.numerator,
  ).toBe(1);
});
it("unavailable and invalid remain in the scorable agreement denominator", async () => {
  const s = human();
  s.input.cultural = { status: "unavailable", reason: "timeout" };
  s.contentHash = scenarioHash(s);
  const labels: AnnotationSet = {
      ...a,
      version: "test-v1",
      records: [annotation(s)],
      adjudications: [],
    },
    data = { ...d, annotationVersion: "test-v1", scenarios: [s] };
  const ps = [
      execute(s, "FULL_TASTEPOLICY"),
      externalPrediction(s, "GENERIC_AI", external(s, "GENERIC_AI", "bad")),
    ],
    rs = await Promise.all(ps.map((p) => resultFor(s, p)));
  const m = metrics(data, labels, ps, rs).bySystem as Record<
    string,
    {
      splits: {
        EVALUATION: {
          human: { agreement: { numerator: number; denominator: number } };
        };
      };
    }
  >;
  for (const sys of ["FULL_TASTEPOLICY", "GENERIC_AI"])
    expect(m[sys].splits.EVALUATION.human.agreement).toMatchObject({
      numerator: 0,
      denominator: 1,
    });
});
it("latency separates small samples from meaningful p95 and semantic metrics omit timing", () => {
  expect(latency([1, 2, 3]).p95).toBeNull();
  expect(latency(Array.from({ length: 20 }, (_, i) => i + 1)).p95).toBe(19);
  expect(JSON.stringify(semanticMetrics(first.metrics))).not.toContain(
    "latency",
  );
  expect(report(first)).toContain("No significance");
});
it("raw timing tamper is rejected despite timing being excluded from semantic hashes", () => {
  const r = clone(first);
  r.predictions[0].latencyMs += 100;
  r.metrics = metrics(d, a, r.predictions, r.results);
  expect(() => validateRun(d, a, r)).toThrow("RAW_ARTIFACT_HASH_MISMATCH");
});
it("a missing eligible receipt is not hidden by the completeness denominator", () => {
  const p = execute(scenario(), "FULL_TASTEPOLICY");
  p.receipt = null;
  expect(receiptCompleteness(p).eligible).toBe(true);
  expect(receiptCompleteness(p).missing).toHaveLength(14);
});
it("ASK against a human REJECT is not counted as excessive ASK", async () => {
  const s = human();
  const labels: AnnotationSet = {
    ...a,
    version: "test-v1",
    records: [annotation(s, "REJECT")],
    adjudications: [],
  };
  const p = externalPrediction(
    s,
    "GENERIC_AI",
    external(s, "GENERIC_AI", { decision: "ASK", reason: "CONTEXT" }),
  );
  const m = metrics(
    { ...d, annotationVersion: "test-v1", scenarios: [s] },
    labels,
    [p],
    [await resultFor(s, p)],
  ).bySystem.GENERIC_AI as {
    splits: {
      EVALUATION: {
        human: {
          excessiveAsk: { numerator: number };
          confusion: { REJECT: { ASK: number } };
        };
      };
    };
  };
  expect(m.splits.EVALUATION.human.excessiveAsk.numerator).toBe(0);
  expect(m.splits.EVALUATION.human.confusion.REJECT.ASK).toBe(1);
});
it("no production source imports benchmarks or annotation files", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  async function walk(path: string): Promise<string[]> {
    const entries = await readdir(path, { withFileTypes: true });
    return (
      await Promise.all(
        entries.map((e) =>
          e.isDirectory()
            ? walk(path + "/" + e.name)
            : Promise.resolve([path + "/" + e.name]),
        ),
      )
    ).flat();
  }
  const paths = await walk("src");
  for (const path of paths.filter((p) => /\.(ts|tsx)$/.test(p))) {
    const text = await readFile(path, "utf8");
    expect(text).not.toMatch(
      /(?:from\s*|import\s*\()\s*["'][^"']*(?:benchmarks\/|tastebench)/i,
    );
  }
});
it("constraint compliance is independent of baseline-specific regression expectations", () => {
  const s = scenario("exact-exclusion"),
    p = first.predictions.find(
      (p) => p.scenarioId === s.id && p.systemId === "QLOO_POLICY",
    )!;
  expect(p.decision).toBe("ALLOW");
  expect(s.constraintExpected).toBe("REJECT");
  const m = first.metrics.bySystem.QLOO_POLICY as {
    splits: {
      EVALUATION: {
        explicitPreferenceContextViolations: number;
        explicitConstraintCompliance: {
          numerator: number;
          denominator: number;
        };
      };
    };
  };
  expect(
    m.splits.EVALUATION.explicitPreferenceContextViolations,
  ).toBeGreaterThan(0);
  expect(
    m.splits.EVALUATION.explicitConstraintCompliance.numerator,
  ).toBeLessThan(m.splits.EVALUATION.explicitConstraintCompliance.denominator);
});
it("mutating an issued calibration packet cannot import held-out cases", () => {
  const p = calibrationPacket(d.scenarios, a);
  p.scenarios.push(scenario());
  p.scenarios[p.scenarios.length - 1].split = "CALIBRATION";
  expect(() =>
    thresholdSensitivity(p, { allowAbove: 0.8, rejectBelow: 0.5 }),
  ).toThrow("UNISSUED_CALIBRATION");
});

// HUMAN-shaped inputs below are validator fixtures, never collected human data.
it.each([
  "zero labels",
  "calibration only",
  "unscorable only",
  "unadjudicated conflict",
  "single annotator",
  "explicit adjudication",
] as const)("run-level held-out human evaluation status: %s", async (kind) => {
  const s = human();
  if (kind === "calibration only") s.split = "CALIBRATION";
  const records = kind === "zero labels" ? [] : [annotation(s)];
  if (kind === "unscorable only") records[0].label = "UNSCORABLE";
  if (kind === "unadjudicated conflict" || kind === "explicit adjudication")
    records.push(annotation(s, "REJECT", "annotator-2"));
  const labels: AnnotationSet = {
    ...a,
    version: "test-v1",
    records,
    adjudications:
      kind === "explicit adjudication"
        ? [
            {
              scenarioId: s.id,
              label: "ASK",
              source: "HUMAN_ADJUDICATION",
              reviewer: "reviewer-1",
              annotationHashes: records.map(hash),
              adjudicatedAt: "2026-10-16T14:00:00.000Z",
            },
          ]
        : [],
  };
  const result = await run(
    { ...d, annotationVersion: labels.version, scenarios: [s] },
    labels,
    code,
  );
  const scorable =
    kind === "single annotator" || kind === "explicit adjudication";
  expect(
    result.manifest.blocked.includes("TASTEBENCH_HUMAN_EVALUATION_NOT_RUN"),
  ).toBe(!scorable);
  const humanMetrics = (
    result.metrics.bySystem.FULL_TASTEPOLICY as {
      splits: {
        EVALUATION: {
          human: {
            scorable: number;
            methods: { singleAnnotator: number; adjudicated: number };
          };
        };
      };
    }
  ).splits.EVALUATION.human;
  expect(humanMetrics.scorable).toBe(scorable ? 1 : 0);
  if (scorable) {
    expect(target(labels, s.id)?.method).toBe(
      kind === "single annotator" ? "SINGLE_ANNOTATOR" : "HUMAN_ADJUDICATION",
    );
    expect(humanMetrics.methods).toEqual({
      singleAnnotator: kind === "single annotator" ? 1 : 0,
      adjudicated: kind === "explicit adjudication" ? 1 : 0,
    });
  }
});
