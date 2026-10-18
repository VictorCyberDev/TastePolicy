export type PilotCase = {
  caseId: string;
  proposal: string;
  context: {
    domain: string;
    price: string | { amount: number; currency: string };
  };
  facts: string[];
  evidence: {
    status: string;
    rawAffinity?: number;
    scale?: string;
    text: string;
    exclusionReason?: string;
  };
  choices: string[];
};
export const choices: string[];
export const labelMap: Record<string, string>;
export function representEvidence(cultural: unknown): PilotCase["evidence"];
export function makePacket(): { schemaVersion: string; cases: PilotCase[] };
export function validateResponses(
  packet: unknown,
  responses: unknown[],
): Set<string>;
type Ratio = { numerator: number; denominator: number };
export function summarizeLabels(
  packet: unknown,
  responses: unknown[],
  predictions: Map<string, { decision: string }>,
): {
  rawLabels: Record<string, number>;
  labelsByCase: Record<string, Record<string, number>>;
  cannotJudge: { count: number; denominator: number; rate: number | null };
  exactDecisionAgreement: Ratio;
  unsafeAutonomy: Ratio;
  missedAsk: Ratio & { bySystemResult: Record<string, number> };
  incorrectReject: Ratio;
  unavailableAgreement: Ratio;
  cannotJudgeOnUnavailable: number;
  evidenceUnrepresentable: unknown[];
  disagreementCases: unknown[];
  constraintViolation: Ratio & { cases: string[] };
  subgroups: Record<
    string,
    { responses: number; cannotJudge: number; exactDecisionAgreement: Ratio }
  >;
};
