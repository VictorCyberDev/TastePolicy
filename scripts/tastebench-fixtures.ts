// Explicit SYNTHETIC ENGINEERING DATA generator, not human or live Qloo data.
// Run manually only when intentionally versioning the engineering dataset.
import { writeFile } from "node:fs/promises";
import { createReceipt } from "@/server/receipts/createReceipt";
import { evaluateEvidence } from "@/server/policy/evaluate";
import { stateHash } from "@/server/state/service";
import type {
  StateEntry,
  StateVersion,
  FeedbackEvent,
} from "@/lib/state/types";
import type { QlooEntity, CulturalEvidence } from "@/types/domain";
import type {
  Dataset,
  Scenario,
  AnnotationSet,
} from "../benchmarks/tastebench/lib/types";
import {
  scenarioHash,
  manifest,
  hash,
  requireThat,
} from "../benchmarks/tastebench/lib/validate";
const at = "2026-10-16T12:00:00.000Z";
const uid = (n: number) =>
  "b0000000-0000-4000-8000-" + String(n).padStart(12, "0");
const signals: QlooEntity[] = [
  "artist",
  "movie",
  "book",
  "brand",
  "tv_show",
].map((type, i) => ({
  id: uid(i + 1),
  name: "SYNTHETIC signal " + i,
  type: type as QlooEntity["type"],
}));
const entries: StateEntry[] = signals.map((entity, i) => ({
  signalId: uid(20 + i),
  kind: "EXPLICIT_LIKE",
  entity,
  scope: "GLOBAL_PREFERENCE",
  persistence: "DURABLE",
  source: "USER",
  sourceEventId: uid(30),
  createdAt: "2026-10-16T10:00:00.000Z",
}));
const state = (items: StateEntry[], version = 1): StateVersion => ({
  profileId: uid(40),
  stateVersion: version,
  parentVersion: version - 1,
  mutationId: uid(50 + version),
  createdAt: "2026-10-16T11:00:00.000Z",
  entries: structuredClone(items),
  stateHash: stateHash(items),
});
let index = 0;
function make(
  id: string,
  score: number | null,
  full: Scenario["contract"]["FULL_TASTEPOLICY"],
  options: {
    constraint?: "EXCLUDE" | "PRICE" | "MULTI";
    price?: { amount: number; currency: string };
    reason?: "timeout" | "not_configured";
    scoreQloo?: Scenario["contract"]["QLOO_POLICY"];
  } = {},
): Scenario {
  const n = ++index,
    candidate: QlooEntity = {
      id: uid(100 + n),
      name: "SYNTHETIC candidate " + id,
      type: (["place", "destination", "brand"] as const)[n % 3],
    };
  const items = structuredClone(entries),
    context = {
      key: "benchmark",
      domain: candidate.type as "place" | "destination" | "brand",
      ...(options.price ? { price: options.price } : {}),
    };
  if (options.constraint) {
    const currencies =
      options.constraint === "MULTI" ? ["USD", "EUR"] : ["USD"];
    currencies.forEach((currency, j) =>
      items.push({
        signalId: uid(60 + j),
        kind: "CONSTRAINT",
        scope: "CANDIDATE_ONLY",
        persistence: "DURABLE",
        candidateId: candidate.id,
        constraint:
          options.constraint === "EXCLUDE"
            ? { kind: "EXCLUDE_CANDIDATE" }
            : { kind: "MAX_PRICE", amount: j ? 60 : 50, currency },
        category:
          options.constraint === "EXCLUDE"
            ? "SPECIFIC_DISLIKE"
            : "TOO_EXPENSIVE",
        source: "USER",
        sourceEventId: uid(70 + j),
        createdAt: "2026-10-16T11:00:00.000Z",
      }),
    );
  }
  const evidence: CulturalEvidence = {
    entity: candidate,
    rank: 1,
    rawAffinity: score ?? 0,
    alignmentScore: score ?? 0,
    scale: "unit",
    explainability: { status: "unavailable", reason: "not_returned" },
  };
  const decision = evaluateEvidence(evidence);
  requireThat(decision.status === "available");
  const cultural =
    score === null
      ? { status: "unavailable" as const, reason: options.reason ?? "timeout" }
      : {
          status: "available" as const,
          data: createReceipt(
            {
              action: {
                kind: "SELECT_ENTITY",
                targetEntity: candidate,
                context: context.key,
              },
              signals,
              evidence,
              decision: decision.data,
              requestId: uid(80),
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
            () => uid(90),
          ),
        };
  const s: Scenario = {
    schemaVersion: "tastebench-scenario-v1",
    id,
    split: n % 4 === 0 ? "CALIBRATION" : "EVALUATION",
    kind: "ENGINEERING",
    source: "SYNTHETIC",
    input: {
      candidate,
      signals: structuredClone(signals),
      context,
      state: state(items),
      cultural,
      evaluatedAt: at,
    },
    perturbations: [],
    contract: {
      QLOO_POLICY:
        options.scoreQloo ??
        (score === null ? "UNAVAILABLE" : decision.data.outcome),
      FULL_TASTEPOLICY: full,
    },
    ...(options.constraint || score === null
      ? { constraintExpected: full }
      : {}),
    contentHash: "",
  };
  return s;
}
const scenarios: Scenario[] = [
  make("cultural-allow", 0.9, "ALLOW"),
  make("cultural-ask", 0.65, "ASK"),
  make("cultural-reject", 0.2, "REJECT"),
  make("missing-evidence", null, "UNAVAILABLE"),
  make("exact-exclusion", 0.9, "REJECT", { constraint: "EXCLUDE" }),
  make("price-violation", 0.9, "REJECT", {
    constraint: "PRICE",
    price: { amount: 70, currency: "USD" },
  }),
  make("unknown-price", 0.9, "ASK", { constraint: "PRICE" }),
  make("currency-mismatch", 0.9, "ASK", {
    constraint: "PRICE",
    price: { amount: 40, currency: "EUR" },
  }),
  make("hard-block-outage", null, "REJECT", { constraint: "EXCLUDE" }),
  make("not-configured", null, "UNAVAILABLE", { reason: "not_configured" }),
];
const multi = make("multi-currency-termination", 0.9, "ASK", {
  constraint: "MULTI",
});
multi.clarification = {
  answer: { kind: "UNKNOWN" },
  expectedFactor: "NONE",
  expected: "ASK",
};
scenarios.push(multi);
for (const value of ["ACCEPTABLE", "UNACCEPTABLE", "STILL_UNSURE"] as const) {
  const s = make("clarification-" + value.toLowerCase(), 0.65, "ASK");
  s.clarification = {
    answer: { kind: "DISPOSITION", value },
    expectedFactor: "CULTURAL_BORDERLINE",
    expected:
      value === "ACCEPTABLE"
        ? "ALLOW"
        : value === "UNACCEPTABLE"
          ? "REJECT"
          : "ASK",
  };
  scenarios.push(s);
}
for (const amount of [40, 70]) {
  const s = make("clarification-price-" + amount, 0.9, "ASK", {
    constraint: "PRICE",
  });
  s.clarification = {
    answer: { kind: "PRICE", amount, currency: "USD" },
    expectedFactor: "PRICE_REQUIRED",
    expected: amount < 50 ? "ALLOW" : "REJECT",
  };
  scenarios.push(s);
}
for (const mode of [
  "ALLOW",
  "ASK",
  "MISS",
  "UNVERIFIABLE_PRICE",
  "UNAVAILABLE",
] as const) {
  const s = make(
    "repair-" + mode.toLowerCase(),
    0.9,
    "REJECT",
    mode === "UNVERIFIABLE_PRICE"
      ? { constraint: "PRICE", price: { amount: 70, currency: "USD" } }
      : { constraint: "EXCLUDE" },
  );
  s.repair = {
    mode,
    expected:
      mode === "ALLOW" || mode === "ASK"
        ? "REPAIR_AVAILABLE"
        : mode === "MISS"
          ? "NO_VERIFIED_REPAIR_WITHIN_BOUND"
          : mode === "UNVERIFIABLE_PRICE"
            ? "NO_VERIFIABLE_REPAIR"
            : "UNAVAILABLE",
  };
  scenarios.push(s);
}
const feedback = make("applicable-feedback-transition", 0.9, "ALLOW");
const event: FeedbackEvent = {
  eventId: uid(500),
  profileId: feedback.input.state.profileId,
  stateVersion: 2,
  createdAt: "2026-10-16T12:01:00.000Z",
  requestId: uid(501),
  category: "SPECIFIC_DISLIKE",
  scope: "CANDIDATE_ONLY",
  persistence: "DURABLE",
  candidateId: feedback.input.candidate.id,
};
const after = state(
  [
    ...feedback.input.state.entries,
    {
      signalId: uid(502),
      kind: "CONSTRAINT",
      scope: event.scope,
      persistence: event.persistence,
      category: event.category,
      candidateId: event.candidateId,
      constraint: { kind: "EXCLUDE_CANDIDATE" },
      source: "USER",
      sourceEventId: event.eventId,
      createdAt: event.createdAt,
    },
  ],
  2,
);
after.createdAt = event.createdAt;
feedback.feedback = {
  event,
  after,
  evaluatedAt: "2026-10-16T12:02:00.000Z",
  expected: "REJECT",
};
feedback.contract.AFTER_FEEDBACK = "REJECT";
scenarios.push(feedback);
const boundary = make("score-boundaries", 0.8, "ASK");
boundary.perturbations = [0.49, 0.5, 0.8, 0.81].map((value, i) => ({
  id: "score-" + i,
  field: "score",
  value,
  expected: value < 0.5 ? "REJECT" : value > 0.8 ? "ALLOW" : "ASK",
}));
scenarios.push(boundary);
const price = make("price-boundaries", 0.9, "ALLOW", {
  constraint: "PRICE",
  price: { amount: 50, currency: "USD" },
});
price.perturbations = [49, 50, 51].map((value, i) => ({
  id: "price-" + i,
  field: "price",
  value,
  expected: value > 50 ? "REJECT" : "ALLOW",
}));
scenarios.push(price);
for (const s of scenarios) s.contentHash = scenarioHash(s);
const a: AnnotationSet = {
  schemaVersion: "tastebench-annotations-v1",
  version: "no-human-labels-v1",
  records: [],
  adjudications: [],
};
const d: Dataset = {
  schemaVersion: "tastebench-dataset-v1",
  benchmarkId: "tastebench-v1",
  version: "engineering-v1",
  createdAt: at,
  metricVersion: "tastebench-metrics-v1",
  annotationVersion: a.version,
  provenance:
    "SYNTHETIC ENGINEERING CONTRACT CASES. No human or live Qloo data.",
  scenarios,
};
const m = manifest(d, a);
for (const [path, value] of [
  ["scenarios/engineering.json", d],
  ["annotations/empty.json", a],
  ["manifests/engineering.json", m],
] as const)
  await writeFile(
    "benchmarks/tastebench/v1/" + path,
    JSON.stringify(value, null, 2) + "\n",
  );
console.log(
  JSON.stringify({
    scenarioCount: m.scenarioCount,
    datasetHash: m.datasetHash,
    generatorHash: hash("SYNTHETIC ENGINEERING DATA v1"),
  }),
);
