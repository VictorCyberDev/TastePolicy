// Synthetic engineering predictions only. No human responses are fixtures.
import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { makePacket } from "../scripts/win-gate-pilot.mjs";
import {
  makeBindings,
  resolveCasePrediction,
  resolvePilotPredictions,
} from "../scripts/win-gate-bindings.mjs";
import { execute } from "../benchmarks/tastebench/lib/execute";
import { inputHash } from "../benchmarks/tastebench/lib/packets";
import type { Scenario } from "../benchmarks/tastebench/lib/types";
const source: { scenarios: Scenario[] } = JSON.parse(
  readFileSync("benchmarks/tastebench/v1/scenarios/engineering.json", "utf8"),
);
const packet = makePacket(),
  bindings = makeBindings(packet);
const predictions = source.scenarios.flatMap((s: Scenario) => [
  execute(s, "FULL_TASTEPOLICY"),
  ...(s.feedback ? [execute(s, "AFTER_FEEDBACK")] : []),
]);
const row = bindings.cases.find((x) => x.caseId === "case-13")!;
it("A: normal case selects exactly one FULL_TASTEPOLICY prediction", () => {
  expect(resolveCasePrediction(bindings.cases[0], predictions).systemId).toBe(
    "FULL_TASTEPOLICY",
  );
});
it("B: scenario identity alone cannot choose among full and after-feedback", () => {
  expect(
    predictions.filter((p) => p.scenarioId === row.scenarioId),
  ).toHaveLength(2);
  expect(() =>
    resolveCasePrediction({ scenarioId: row.scenarioId }, predictions),
  ).toThrow("PREDICTION_IDENTITY_REQUIRED");
});
it("C/D: case-13 binds initial ALLOW, never later AFTER_FEEDBACK REJECT", () => {
  const p = resolvePilotPredictions(packet, predictions).find(
    (x) => x.identity.caseId === "case-13",
  )!;
  expect(p.prediction.decision).toBe("ALLOW");
  expect(p.prediction.systemId).toBe("FULL_TASTEPOLICY");
  expect(
    predictions.find(
      (p) => p.scenarioId === row.scenarioId && p.systemId === "AFTER_FEEDBACK",
    )?.decision,
  ).toBe("REJECT");
  expect(() =>
    resolveCasePrediction({ ...row, systemId: "AFTER_FEEDBACK" }, predictions),
  ).toThrow();
});
it("E: duplicate identity is rejected even when duplicate contents agree", () => {
  expect(() =>
    resolvePilotPredictions(packet, [
      ...predictions,
      predictions.find(
        (p) =>
          p.scenarioId === row.scenarioId && p.systemId === "FULL_TASTEPOLICY",
      )!,
    ]),
  ).toThrow("AMBIGUOUS_PREDICTION");
});
it("F: missing required identity does not fall back to feedback", () => {
  expect(() =>
    resolvePilotPredictions(
      packet,
      predictions.filter(
        (p) =>
          !(
            p.scenarioId === row.scenarioId && p.systemId === "FULL_TASTEPOLICY"
          ),
      ),
    ),
  ).toThrow("MISSING_PREDICTION");
});
it("G: changed declared system, phase or scenario is rejected", () => {
  for (const patch of [
    { systemId: "AFTER_FEEDBACK" },
    { scenarioId: bindings.cases[0].scenarioId },
    { phase: "AFTER_FEEDBACK" },
  ]) {
    const altered = structuredClone(bindings);
    Object.assign(altered.cases[12], patch);
    expect(() => resolvePilotPredictions(packet, predictions, altered)).toThrow(
      "PREDICTION_BINDING_MISMATCH",
    );
  }
});
it("H: every frozen case has one deterministic initial-state prediction and source input hash", () => {
  const a = resolvePilotPredictions(packet, predictions),
    b = resolvePilotPredictions(packet, [...predictions].reverse());
  expect(a).toEqual(b);
  expect(a).toHaveLength(18);
  for (const { identity, prediction } of a) {
    const s = source.scenarios.find(
      (s: Scenario) => s.id === identity.scenarioId,
    );
    if (!s) throw Error("Missing source fixture");
    expect(identity.inputHash).toBe(inputHash(s, "FULL_TASTEPOLICY"));
    expect(prediction.inputHash).toBe(identity.inputHash);
    expect(identity.stateHash).toBe(s.input.state.stateHash);
  }
});
it("rejects an AFTER_FEEDBACK state disguised as the full system", () => {
  const altered = structuredClone(predictions);
  const index = altered.findIndex(
    (p) => p.scenarioId === row.scenarioId && p.systemId === "FULL_TASTEPOLICY",
  );
  altered[index] = {
    ...altered.find(
      (p) => p.scenarioId === row.scenarioId && p.systemId === "AFTER_FEEDBACK",
    )!,
    systemId: "FULL_TASTEPOLICY",
  };
  expect(() => resolvePilotPredictions(packet, altered)).toThrow(
    "PREDICTION_STATE_MISMATCH",
  );
});
it("rejects mismatched selection, dataset, packet or raw scenario-only maps", () => {
  const selection = JSON.parse(
    readFileSync("docs/evaluation/win-gate-pilot-selection.json", "utf8"),
  );
  for (const altered of [
    { ...selection, packetHash: "wrong" },
    { ...selection, datasetHash: "wrong" },
    { ...selection, selection: [...selection.selection].reverse() },
  ])
    expect(() =>
      resolvePilotPredictions(packet, predictions, bindings, altered),
    ).toThrow("SELECTION_BINDING_MISMATCH");
  expect(() =>
    resolvePilotPredictions(
      { ...packet, sourceVersion: "changed" },
      predictions,
    ),
  ).toThrow("PACKET_BINDING_MISMATCH");
  expect(() =>
    resolvePilotPredictions(
      packet,
      new Map(predictions.map((p) => [p.scenarioId, p])),
    ),
  ).toThrow("PREDICTION_IDENTITY_REQUIRED");
});
