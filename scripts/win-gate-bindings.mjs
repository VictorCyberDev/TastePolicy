// Research-only evidence binding. No authorization decisions are computed here.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { canonical } from "../src/lib/state/canonical.ts";
const sha = (text) => createHash("sha256").update(text).digest("hex");
const hash = (value) => sha(canonical(value));
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const packetHash =
  "e198ff3bd1f17f9ac21ddad843cbc5cb1a2d798048a9b5e2196246474596865d";
const datasetHash =
  "0d30276bce61ba67158f305bf5340acc51f53ec58cc041159db6b774970bc11d";
const selectionHash =
  "0408ad878970883ab7c010246398b7c9c9cf3f6c25e6d05ce62ac4d593450295";
const phase = "PARTICIPANT_VISIBLE_INITIAL_STATE";
export function makeBindings(
  packet = json("public/win-gate/pilot.json"),
  selection = json("docs/evaluation/win-gate-pilot-selection.json"),
) {
  const { packetHash: supplied, ...material } = packet;
  if (
    (supplied !== undefined && supplied !== packetHash) ||
    sha(JSON.stringify(material)) !== packetHash ||
    packet.schemaVersion !== "win-gate-blinded-pilot-v3"
  )
    throw Error("PACKET_BINDING_MISMATCH");
  const bytes = readFileSync(
    "benchmarks/tastebench/v1/scenarios/engineering.json",
    "utf8",
  );
  if (
    sha(bytes) !==
      "5a997417bb6a1c6847d1e0a740ef035baac5d618c173c04394aa0520643879f5" ||
    json("benchmarks/tastebench/v1/manifests/engineering.json").datasetHash !==
      datasetHash
  )
    throw Error("DATASET_BINDING_MISMATCH");
  if (
    selection.packetHash !== packetHash ||
    selection.datasetHash !== datasetHash ||
    hash(selection.selection) !== selectionHash ||
    material.cases.length !== 18
  )
    throw Error("SELECTION_BINDING_MISMATCH");
  const source = JSON.parse(bytes);
  const cases = selection.selection.map((row, i) => {
    const matches = source.scenarios.filter(
      (s) =>
        s.id === row.sourceScenarioId &&
        s.split === "EVALUATION" &&
        s.contentHash === row.contentHash,
    );
    if (matches.length !== 1 || material.cases[i].caseId !== row.caseId)
      throw Error("SCENARIO_BINDING_MISMATCH");
    const s = matches[0];
    // Frozen makePacket(v3) projects s.input, never feedback.after or interaction results.
    return {
      caseId: row.caseId,
      scenarioId: s.id,
      scenarioContentHash: row.contentHash,
      systemId: "FULL_TASTEPOLICY",
      phase,
      presentationHash: hash(material.cases[i]),
      inputHash: hash(s.input),
      candidateId: s.input.candidate.id,
      stateVersion: s.input.state.stateVersion,
      stateHash: s.input.state.stateHash,
    };
  });
  const body = {
    schemaVersion: "win-gate-prediction-bindings-v1",
    packetHash,
    datasetHash,
    selectionHash,
    cases,
  };
  return { ...body, bindingHash: hash(body) };
}
export function resolveCasePrediction(identity, predictions) {
  if (
    !identity ||
    identity.systemId !== "FULL_TASTEPOLICY" ||
    identity.phase !== phase ||
    !identity.scenarioId ||
    !identity.inputHash ||
    !Array.isArray(predictions)
  )
    throw Error("PREDICTION_IDENTITY_REQUIRED");
  const matches = predictions.filter(
    (p) =>
      p.scenarioId === identity.scenarioId && p.systemId === identity.systemId,
  );
  if (!matches.length) throw Error("MISSING_PREDICTION");
  if (matches.length !== 1) throw Error("AMBIGUOUS_PREDICTION");
  const p = matches[0];
  if (
    p.status !== "OK" ||
    p.inputHash !== identity.inputHash ||
    p.candidateId !== identity.candidateId ||
    !["ALLOW", "ASK", "REJECT", "UNAVAILABLE"].includes(p.decision) ||
    !/^[a-f0-9]{64}$/.test(p.semanticHash)
  )
    throw Error("PREDICTION_STATE_MISMATCH");
  return p;
}
export function resolvePilotPredictions(
  packet,
  predictions,
  bindings = json("docs/evaluation/win-gate-pilot-bindings.json"),
  selection = json("docs/evaluation/win-gate-pilot-selection.json"),
) {
  const expected = makeBindings(packet, selection);
  if (hash(bindings) !== hash(expected))
    throw Error("PREDICTION_BINDING_MISMATCH");
  return expected.cases.map((identity) => ({
    identity,
    prediction: resolveCasePrediction(identity, predictions),
  }));
}
