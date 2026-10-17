import type {
  StateVersion,
  Context,
  FeedbackEvent,
  StateEvaluation,
} from "@/lib/state/types";
import type {
  QlooEntity,
  EvaluationResult,
  CulturalReceipt,
} from "@/types/domain";
import type { Answer, RepairStatus } from "@/lib/interactive/types";
export const SYSTEMS = [
  "GENERIC_AI",
  "LLM_QLOO",
  "QLOO_POLICY",
  "FULL_TASTEPOLICY",
  "AFTER_FEEDBACK",
] as const;
export type System = (typeof SYSTEMS)[number];
export type Decision = "ALLOW" | "ASK" | "REJECT" | "UNAVAILABLE";
export type Split = "CALIBRATION" | "EVALUATION";
export interface Input {
  candidate: QlooEntity;
  signals: QlooEntity[];
  context: Context;
  state: StateVersion;
  cultural: EvaluationResult;
  evaluatedAt: string;
}
export interface Scenario {
  schemaVersion: "tastebench-scenario-v1";
  id: string;
  split: Split;
  kind: "ENGINEERING" | "HUMAN";
  source: "SYNTHETIC" | "CAPTURED";
  input: Input;
  feedback?: {
    event: FeedbackEvent;
    after: StateVersion;
    evaluatedAt: string;
    expected: Decision;
  };
  clarification?: {
    answer: Answer;
    expectedFactor: string;
    expected: Decision;
  };
  repair?: {
    mode: "ALLOW" | "ASK" | "MISS" | "UNVERIFIABLE_PRICE" | "UNAVAILABLE";
    expected: RepairStatus;
  };
  perturbations: {
    id: string;
    field: "score" | "price";
    value: number;
    expected: Decision;
  }[];
  contract: Partial<Record<System, Decision>>;
  constraintExpected?: Decision;
  contentHash: string;
}
export interface Annotation {
  schemaVersion: "tastebench-annotation-v1";
  version: string;
  scenarioId: string;
  source: "HUMAN";
  annotator: string;
  label: "ALLOW" | "ASK" | "REJECT" | "UNSCORABLE";
  reasons: (
    | "EXPLICIT_CONSTRAINT"
    | "CONTEXT"
    | "CULTURAL_FIT"
    | "INSUFFICIENT_CONTEXT"
    | "OTHER"
  )[];
  comment?: string;
  annotatedAt: string;
}
export interface Adjudication {
  scenarioId: string;
  label: "ALLOW" | "ASK" | "REJECT" | "UNSCORABLE";
  source: "HUMAN_ADJUDICATION";
  reviewer: string;
  annotationHashes: string[];
  adjudicatedAt: string;
}
export interface AnnotationSet {
  schemaVersion: "tastebench-annotations-v1";
  version: string;
  records: Annotation[];
  adjudications: Adjudication[];
}
export interface Dataset {
  schemaVersion: "tastebench-dataset-v1";
  benchmarkId: "tastebench-v1";
  version: string;
  createdAt: string;
  metricVersion: "tastebench-metrics-v1";
  annotationVersion: string;
  provenance: string;
  scenarios: Scenario[];
}
export interface DatasetManifest {
  schemaVersion: "tastebench-manifest-v1";
  benchmarkId: string;
  datasetVersion: string;
  datasetHash: string;
  annotationVersion: string;
  annotationHash: string;
  metricVersion: string;
  createdAt: string;
  provenance: string;
  scenarioCount: number;
  splitCounts: Record<Split, number>;
  domainCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  scenarios: {
    id: string;
    split: Split;
    contentHash: string;
    recordHash: string;
  }[];
}
export interface Prediction {
  schemaVersion: "tastebench-prediction-v1";
  scenarioId: string;
  systemId: System;
  systemVersion: string;
  candidateId: string;
  inputHash: string;
  status: "OK" | "INVALID_OUTPUT";
  decision: Decision | null;
  basis: string;
  reason: string | null;
  evidenceMode: "CAPTURED";
  dataSource: "SYNTHETIC" | "CAPTURED";
  latencyMs: number;
  latencyKind: "OFFLINE_POLICY" | "EXTERNAL_MODEL";
  providerCalls: number;
  provenance: Record<string, string | number | null>;
  receipt: CulturalReceipt | null;
  semanticHash: string;
}
export interface ScenarioResult {
  scenarioId: string;
  systemId: System;
  predictionHash: string;
  contractExpected: Decision | null;
  contractMatch: boolean | null;
  replay: { comparisons: number; mismatches: number };
  stability: {
    id: string;
    field: string;
    original: Decision | null;
    perturbed: Decision;
    expected: Decision;
    matches: boolean;
  }[];
  interaction: null | {
    kind: "CLARIFICATION" | "REPAIR";
    expected: string;
    actual: string;
    matches: boolean;
    calls: number;
    operations: Record<string, number>;
    constraintPreserved: boolean;
    candidateVerified: boolean;
    elapsedMs: number;
    semanticHash: string;
  };
  feedback: null | {
    before: Decision | null;
    after: Decision | null;
    expected: Decision;
    matches: boolean;
    stateVersion: number;
    stateHash: string;
  };
}
export interface RunManifest {
  schemaVersion: "tastebench-run-v1";
  runId: string;
  timestamp: string;
  codeSha: string;
  dirty: boolean;
  node: string;
  dataset: DatasetManifest;
  evidenceMode: "CAPTURED";
  systems: System[];
  systemVersion: "tastebench-adapters-v1";
  systemVersions: Record<string, string[]>;
  promptVersion: "authorization-neutral-v1";
  metricVersion: "tastebench-metrics-v1";
  blocked: string[];
  scenarioCount: number;
  predictionCount: number;
  exclusions: [];
  seed: null;
  semanticHash: string;
  rawArtifactHashes: { predictions: string; results: string; metrics: string };
  artifactHashes: { predictions: string; results: string; metrics: string };
}
export interface Run {
  manifest: RunManifest;
  predictions: Prediction[];
  results: ScenarioResult[];
  metrics: ReturnType<typeof import("./metrics").metrics>;
}
export interface Packet {
  schemaVersion: "tastebench-packet-v1";
  scenarioId: string;
  systemId: "GENERIC_AI" | "LLM_QLOO";
  promptVersion: "authorization-neutral-v1";
  input: Record<string, unknown>;
  inputHash: string;
}
export interface ExternalOutput {
  schemaVersion: "tastebench-external-v1";
  scenarioId: string;
  systemId: "GENERIC_AI" | "LLM_QLOO";
  candidateId: string;
  inputHash: string;
  response: unknown;
  provider: string;
  model: string;
  modelVersion: string;
  promptVersion: "authorization-neutral-v1";
  executedAt: string;
  temperature: number | null;
  seed: number | null;
  responseHash: string;
  latencyMs: number;
  providerCalls: number;
}
export type CapturedEvaluation = StateEvaluation;
