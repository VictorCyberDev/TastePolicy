// SYNTHETIC DEVELOPMENT DATA. Test-only; never imported by production modules.
import { createReceipt } from "../src/server/receipts/createReceipt";
import { evaluateEvidence } from "../src/server/policy/evaluate";
import { ids, entities, signalIds } from "./qloo-fixtures";
import type { CulturalEvidence } from "../src/types/domain";
export function syntheticReceipt(score = 0.7) {
  const evidence: CulturalEvidence = {
    entity: entities[5],
    rawAffinity: score,
    alignmentScore: score,
    scale: "unit",
    rank: 1,
    explainability: {
      status: "partial",
      contributions: [{ signalId: ids[0], score: 0.3 }],
      missingSignalIds: signalIds.slice(1),
      omittedSignalIds: [],
      omission: "unknown",
      issues: ["missing_signals"],
    },
  };
  const decision = evaluateEvidence(evidence);
  if (decision.status !== "available")
    throw Error("Invalid synthetic test score");
  return createReceipt(
    {
      action: { kind: "SELECT_ENTITY", targetEntity: entities[5] },
      signals: entities.slice(0, 5),
      evidence,
      provenance: {
        provider: "qloo",
        endpoint: "/v2/insights",
        host: "https://hackathon.api.qloo.com",
        fetchedAt: "2026-10-10T00:00:00Z",
        signalIds,
        targetType: "destination",
        specificCandidateId: ids[5],
      },
      decision: decision.data,
      requestId: ids[0],
    },
    () => "2026-10-10T00:00:00Z",
    () => ids[1],
  );
}
