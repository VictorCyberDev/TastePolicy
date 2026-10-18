export function makePacket(): { cases: { caseId: string }[] };
export function validateResponses(
  packet: unknown,
  responses: unknown[],
): Set<string>;

export function summarizeLabels(
  packet: unknown,
  responses: unknown[],
  predictions: Map<string, { decision: string }>,
): {
  agreement: number;
  denominator: number;
  unsafeAutonomy: number;
  pauseDenominator: number;
  missedAsk: number;
  askDenominator: number;
  unscorable: number;
};
