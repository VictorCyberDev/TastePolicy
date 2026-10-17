import type {
  Scenario,
  Packet,
  ExternalOutput,
  Prediction,
  System,
  AnnotationSet,
} from "./types";
import {
  object,
  requireThat,
  timestamp,
  hex,
  finite,
  isDecision,
  hash,
  validateScenario,
} from "./validate";
export function packet(s: Scenario, system: "GENERIC_AI" | "LLM_QLOO"): Packet {
  validateScenario(s);
  const i = s.input;
  const input: Record<string, unknown> = {
    action: "SELECT_ENTITY",
    candidate: structuredClone(i.candidate),
    signals: structuredClone(i.signals),
    context: structuredClone(i.context),
    state: structuredClone(i.state),
    evaluatedAt: i.evaluatedAt,
  };
  if (system === "LLM_QLOO")
    input.cultural =
      i.cultural.status === "available"
        ? {
            status: "available",
            rawAffinity: i.cultural.data.qlooEvidence.rawAffinity,
            alignmentScore: i.cultural.data.alignmentScore,
            scale: i.cultural.data.qlooEvidence.scale,
            explainability: structuredClone(i.cultural.data.explainability),
            provenance: structuredClone(
              i.cultural.data.qlooEvidence.provenance,
            ),
          }
        : { status: "unavailable", reason: i.cultural.reason };
  return {
    schemaVersion: "tastebench-packet-v1",
    scenarioId: s.id,
    systemId: system,
    promptVersion: "authorization-neutral-v1",
    input,
    inputHash: hash(input),
  };
}
export function annotationPacket(s: Scenario) {
  const p = packet(s, "GENERIC_AI");
  return {
    schemaVersion: "tastebench-blinded-annotation-v1",
    scenarioId: s.id,
    inputHash: p.inputHash,
    input: p.input,
    question:
      "Given the explicit user state, context and proposal, should this agent proceed, ask for clarification, or not proceed?",
    labels: ["ALLOW", "ASK", "REJECT", "UNSCORABLE"],
  };
}
// This function never accepts an entire annotation set. Construction filters
// labels before returning a calibration-only object to any threshold analysis.
const issuedCalibration = new WeakMap<object, string>();
export function calibrationPacket(
  scenarios: Scenario[],
  annotations: AnnotationSet,
) {
  const cases = scenarios.filter((s) => s.split === "CALIBRATION");
  const ids = new Set(cases.map((s) => s.id));
  const result = {
    schemaVersion: "tastebench-calibration-only-v1" as const,
    scenarios: structuredClone(cases),
    annotations: {
      ...annotations,
      records: annotations.records.filter((a) => ids.has(a.scenarioId)),
      adjudications: annotations.adjudications.filter((a) =>
        ids.has(a.scenarioId),
      ),
    },
  };
  issuedCalibration.set(result, hash(result));
  return result;
}
export function thresholdSensitivity(
  p: ReturnType<typeof calibrationPacket>,
  thresholds: { allowAbove: number; rejectBelow: number },
) {
  requireThat(
    issuedCalibration.get(p) === hash(p),
    "TASTEBENCH_UNISSUED_CALIBRATION_PACKET",
  );
  requireThat(
    p.schemaVersion === "tastebench-calibration-only-v1" &&
      p.scenarios.every((s) => s.split === "CALIBRATION") &&
      p.annotations.records.every((a) =>
        p.scenarios.some((s) => s.id === a.scenarioId),
      ) &&
      p.annotations.adjudications.every((a) =>
        p.scenarios.some((s) => s.id === a.scenarioId),
      ),
  );
  requireThat(
    finite(thresholds.rejectBelow) &&
      finite(thresholds.allowAbove) &&
      thresholds.rejectBelow <= thresholds.allowAbove &&
      thresholds.allowAbove <= 1,
  );
  return p.scenarios.map((s) => ({
    scenarioId: s.id,
    researchOnly: true,
    decision:
      s.input.cultural.status === "available"
        ? s.input.cultural.data.alignmentScore > thresholds.allowAbove
          ? "ALLOW"
          : s.input.cultural.data.alignmentScore < thresholds.rejectBelow
            ? "REJECT"
            : "ASK"
        : "UNAVAILABLE",
  }));
}
export function semanticPrediction(p: Prediction) {
  const v = structuredClone(p) as Partial<Prediction>;
  delete v.latencyMs;
  delete v.semanticHash;
  if (v.provenance) delete v.provenance.executedAt;
  if (v.receipt) {
    const r = v.receipt as Partial<NonNullable<Prediction["receipt"]>>;
    delete r.receiptId;
    delete r.requestId;
    delete r.evaluatedAt;
  }
  return v;
}

export function externalPrediction(
  s: Scenario,
  system: "GENERIC_AI" | "LLM_QLOO",
  raw: unknown,
): Prediction {
  const p = packet(s, system);
  const r = object(raw, [
    "schemaVersion",
    "scenarioId",
    "systemId",
    "candidateId",
    "inputHash",
    "response",
    "provider",
    "model",
    "modelVersion",
    "promptVersion",
    "executedAt",
    "temperature",
    "seed",
    "responseHash",
    "latencyMs",
    "providerCalls",
  ]);
  requireThat(
    r.schemaVersion === "tastebench-external-v1" &&
      r.scenarioId === s.id &&
      r.systemId === system &&
      r.candidateId === s.input.candidate.id &&
      r.inputHash === p.inputHash &&
      r.promptVersion === p.promptVersion &&
      timestamp(r.executedAt) &&
      ["provider", "model", "modelVersion"].every(
        (k) =>
          typeof r[k] === "string" &&
          /^[a-zA-Z0-9_.:/-]{1,120}$/.test(r[k] as string),
      ) &&
      hex(r.responseHash) &&
      r.responseHash === hash(r.response) &&
      finite(r.latencyMs) &&
      Number.isSafeInteger(r.providerCalls) &&
      (r.providerCalls as number) >= 0 &&
      (r.providerCalls as number) <= 5 &&
      (r.temperature === null || finite(r.temperature)) &&
      (r.seed === null || Number.isSafeInteger(r.seed)),
  );
  const e = raw as ExternalOutput;
  let valid = false,
    decision: Prediction["decision"] = null,
    reason: string | null = null;
  try {
    const response = object(e.response, ["decision", "reason"]);
    requireThat(
      isDecision(response.decision) &&
        typeof response.reason === "string" &&
        /^[A-Z_]{1,80}$/.test(response.reason),
    );
    decision = response.decision;
    reason = response.reason;
    valid = true;
  } catch {
    /* Keep the execution as INVALID_OUTPUT, never infer a label. */
  }
  const result: Prediction = {
    schemaVersion: "tastebench-prediction-v1",
    scenarioId: s.id,
    systemId: system,
    systemVersion: e.modelVersion,
    candidateId: s.input.candidate.id,
    inputHash: p.inputHash,
    status: valid ? "OK" : "INVALID_OUTPUT",
    decision,
    basis: "EXTERNAL_DECLARED",
    reason,
    evidenceMode: "CAPTURED",
    dataSource: s.source,
    latencyMs: e.latencyMs,
    latencyKind: "EXTERNAL_MODEL",
    providerCalls: e.providerCalls,
    provenance: {
      provider: e.provider,
      model: e.model,
      modelVersion: e.modelVersion,
      promptVersion: e.promptVersion,
      executedAt: e.executedAt,
      temperature: e.temperature,
      seed: e.seed,
      responseHash: e.responseHash,
    },
    receipt: null,
    semanticHash: "",
  };
  result.semanticHash = hash(semanticPrediction(result));
  return result;
}
export function inputHash(s: Scenario, system: System) {
  if (system === "GENERIC_AI" || system === "LLM_QLOO")
    return packet(s, system).inputHash;
  if (system === "QLOO_POLICY")
    return hash({ candidate: s.input.candidate, cultural: s.input.cultural });
  if (system === "AFTER_FEEDBACK") {
    requireThat(s.feedback);
    return hash({
      ...s.input,
      state: s.feedback.after,
      evaluatedAt: s.feedback.evaluatedAt,
    });
  }
  return hash(s.input);
}
