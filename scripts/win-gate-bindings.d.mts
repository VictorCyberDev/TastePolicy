export type Binding = {
  caseId: string;
  scenarioId: string;
  scenarioContentHash: string;
  systemId: string;
  phase: string;
  presentationHash: string;
  inputHash: string;
  candidateId: string;
  stateVersion: number;
  stateHash: string;
};
export type PredictionReference = {
  scenarioId: string;
  systemId: string;
  status: string;
  inputHash: string;
  candidateId: string;
  semanticHash: string;
  decision: string;
  basis?: string;
};
export type Bindings = {
  schemaVersion: string;
  packetHash: string;
  datasetHash: string;
  selectionHash: string;
  cases: Binding[];
  bindingHash: string;
};
export function makeBindings(packet?: unknown, selection?: unknown): Bindings;
export function resolveCasePrediction(
  identity: unknown,
  predictions: unknown,
): PredictionReference;
export function resolvePilotPredictions(
  packet: unknown,
  predictions: unknown,
  bindings?: unknown,
  selection?: unknown,
): { identity: Binding; prediction: PredictionReference }[];
