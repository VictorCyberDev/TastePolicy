// Synthetic factorial contract coverage, never human preference validation.
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { stateDecision } from "@/server/state/policy";
import { evaluateEvidence } from "@/server/policy/evaluate";
import { createReceipt } from "@/server/receipts/createReceipt";
import type { Context, StateEntry, StateVersion } from "@/lib/state/types";
import type { EvaluationResult, QlooEntity, TargetType } from "@/types/domain";
const at = "2026-10-29T00:00:00.000Z";
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const uid = (n: number) =>
  "d0000000-0000-4000-8000-" + String(n).padStart(12, "0");
type Outcome = "ALLOW" | "ASK" | "REJECT" | "UNAVAILABLE";
const rules = [
  "NONE",
  "EXCLUDE",
  "GLOBAL_PRICE",
  "MATCHING_CONTEXT_PRICE",
  "OTHER_CONTEXT_PRICE",
] as const;
const prices = ["WITHIN", "AT", "OVER", "MISSING", "OTHER_CURRENCY"] as const;
const scores = [0.2, 0.49, 0.5, 0.65, 0.8, 0.81, null];
const cases = [];
for (const domain of ["brand", "destination", "place"] as TargetType[])
  for (const score of scores)
    for (const rule of rules)
      for (const price of prices) {
        const input = { domain, score, rule, price };
        cases.push({
          id: "case-" + hash(input).slice(0, 16),
          split:
            parseInt(hash(input).slice(0, 8), 16) % 4 === 0
              ? "EVALUATION"
              : "CALIBRATION",
          ...input,
        });
      }
const signals: QlooEntity[] = [
  "artist",
  "movie",
  "book",
  "brand",
  "tv_show",
].map((type, i) => ({
  id: uid(20 + i),
  name: "SYNTHETIC signal " + i,
  type: type as QlooEntity["type"],
}));
const rows = cases.map((c) => {
  const candidate: QlooEntity = {
    id: uid(1),
    name: "SYNTHETIC candidate",
    type: c.domain,
  };
  const context: Context = {
    key: "context-a",
    domain: c.domain,
    ...(c.price === "MISSING"
      ? {}
      : {
          price: {
            amount: c.price === "OVER" ? 51 : c.price === "AT" ? 50 : 15,
            currency: c.price === "OTHER_CURRENCY" ? "EUR" : "USD",
          },
        }),
  };
  const applicable = c.rule !== "NONE" && c.rule !== "OTHER_CONTEXT_PRICE";
  const hardBlock = c.rule === "EXCLUDE" || (applicable && c.price === "OVER");
  // Written contract precedence independent of the evaluator call below.
  const expected: Outcome = hardBlock
    ? "REJECT"
    : c.score === null
      ? "UNAVAILABLE"
      : c.score < 0.5
        ? "REJECT"
        : applicable && (c.price === "MISSING" || c.price === "OTHER_CURRENCY")
          ? "ASK"
          : c.score > 0.8
            ? "ALLOW"
            : "ASK";
  const entries: StateEntry[] =
    c.rule === "NONE"
      ? []
      : [
          {
            signalId: uid(2),
            kind: "CONSTRAINT",
            scope:
              c.rule === "EXCLUDE"
                ? "CANDIDATE_ONLY"
                : c.rule === "GLOBAL_PRICE"
                  ? "GLOBAL_PREFERENCE"
                  : "CONTEXT",
            persistence: "DURABLE",
            candidateId: candidate.id,
            contextKey:
              c.rule === "OTHER_CONTEXT_PRICE" ? "context-b" : "context-a",
            constraint:
              c.rule === "EXCLUDE"
                ? { kind: "EXCLUDE_CANDIDATE" }
                : { kind: "MAX_PRICE", amount: 50, currency: "USD" },
            source: "USER",
            sourceEventId: uid(3),
            createdAt: at,
          },
        ];
  const state: StateVersion = {
    profileId: uid(4),
    stateVersion: 1,
    parentVersion: null,
    createdAt: at,
    mutationId: null,
    stateHash: hash(entries),
    entries,
  };
  const evidence = {
    entity: candidate,
    rank: 1,
    rawAffinity: c.score ?? 0,
    alignmentScore: c.score ?? 0,
    scale: "unit" as const,
    explainability: {
      status: "unavailable" as const,
      reason: "not_returned" as const,
    },
  };
  const evaluated = evaluateEvidence(evidence);
  if (evaluated.status !== "available")
    throw new Error("SYNTHETIC_EVIDENCE_INVALID");
  const cultural: EvaluationResult =
    c.score === null
      ? { status: "unavailable", reason: "timeout" }
      : {
          status: "available",
          data: createReceipt(
            {
              action: {
                kind: "SELECT_ENTITY",
                targetEntity: candidate,
                context: context.key,
              },
              signals,
              evidence,
              decision: evaluated.data,
              requestId: uid(5),
              provenance: {
                provider: "qloo",
                host: "https://hackathon.api.qloo.com",
                endpoint: "/v2/insights",
                fetchedAt: at,
                signalIds: signals.map((s) => s.id),
                targetType: candidate.type,
                specificCandidateId: candidate.id,
              },
            },
            () => at,
            () => uid(6),
          ),
        };
  const affinity: Outcome =
    c.score === null ? "UNAVAILABLE" : evaluated.data.outcome;
  const predicted = {
    STATE_POLICY: stateDecision(state, candidate, context, cultural, at)
      .outcome,
    AFFINITY_ONLY: affinity,
    CONSERVATIVE_RULES: hardBlock ? "REJECT" : "ASK",
  } satisfies Record<string, Outcome>;
  return { id: c.id, split: c.split, expected, hardBlock, predicted };
});
function metrics(split: string) {
  const selected = rows.filter((r) => r.split === split);
  return Object.fromEntries(
    ["STATE_POLICY", "AFFINITY_ONLY", "CONSERVATIVE_RULES"].map((name) => {
      const outcomes = selected.map((r) => ({
        ...r,
        actual: r.predicted[name as keyof typeof r.predicted],
      }));
      const count = (predicate: (r: (typeof outcomes)[number]) => boolean) =>
        outcomes.filter(predicate).length;
      return [
        name,
        {
          cases: selected.length,
          exact: count((r) => r.actual === r.expected),
          unsafeAutonomy: count(
            (r) => r.actual === "ALLOW" && r.expected !== "ALLOW",
          ),
          nonAllowCases: count((r) => r.expected !== "ALLOW"),
          missedASK: count((r) => r.expected === "ASK" && r.actual !== "ASK"),
          askCases: count((r) => r.expected === "ASK"),
          incorrectREJECT: count(
            (r) => r.expected !== "REJECT" && r.actual === "REJECT",
          ),
          nonRejectCases: count((r) => r.expected !== "REJECT"),
          unavailableCorrect: count(
            (r) => r.expected === "UNAVAILABLE" && r.actual === "UNAVAILABLE",
          ),
          unavailableCases: count((r) => r.expected === "UNAVAILABLE"),
          hardRuleCorrect: count((r) => r.hardBlock && r.actual === "REJECT"),
          hardRuleCases: count((r) => r.hardBlock),
        },
      ];
    }),
  );
}
const dataset = {
  schemaVersion: "tastebench-boundaries-v2",
  source: "SYNTHETIC_ENGINEERING",
  createdAt: at,
  splitRule:
    "sha256(JSON input) first 32 bits modulo 4; 0 evaluation, remainder calibration",
  cases,
};
const result = {
  schemaVersion: "tastebench-boundaries-result-v2",
  sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  datasetHash: hash(dataset),
  limitations: [
    "Component stateDecision contract exercise, not full system, live Qloo, taste relevance, human labels or LLM comparison.",
    "The evaluation partition is deterministic coverage, not independently collected validation. No thresholds tuned on either partition.",
    "Drift, lease and proof behavior remain in separate lifecycle/conformance tests; this dataset does not score them.",
  ],
  metrics: {
    CALIBRATION: metrics("CALIBRATION"),
    EVALUATION: metrics("EVALUATION"),
  },
  rows,
};
const root = "benchmarks/tastebench/v2";
if (process.argv.includes("--write")) {
  await mkdir(root, { recursive: true });
  await writeFile(
    root + "/boundaries.json",
    JSON.stringify(dataset, null, 2) + "\n",
  );
  await writeFile(
    root + "/results.json",
    JSON.stringify(result, null, 2) + "\n",
  );
} else {
  const existing = JSON.parse(
    await readFile(root + "/boundaries.json", "utf8"),
  );
  const stored = JSON.parse(await readFile(root + "/results.json", "utf8"));
  if (
    hash(existing) !== hash(dataset) ||
    JSON.stringify(stored.metrics) !== JSON.stringify(result.metrics) ||
    JSON.stringify(stored.rows) !== JSON.stringify(rows) ||
    stored.datasetHash !== hash(dataset)
  )
    throw new Error("BOUNDARY_BENCHMARK_DRIFT");
}
console.log(
  JSON.stringify({
    datasetHash: result.datasetHash,
    cases: cases.length,
    metrics: result.metrics,
  }),
);
