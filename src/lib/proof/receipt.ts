import type {
  CulturalReceipt,
  CulturalEvidence,
  ProviderResult,
} from "@/types/domain";
import { record, uuid } from "@/lib/validation";
import {
  createReceipt,
  RECEIPT_SCHEMA_VERSION,
} from "@/server/receipts/createReceipt";
import { evaluateEvidence } from "@/server/policy/evaluate";
import { POLICY_V1 } from "@/server/policy/thresholds";
import { NORMALIZATION_VERSION } from "@/server/policy/normalization";
export type EvidenceSource = "live" | "recorded" | "synthetic";
export const SOURCE_LABELS = {
  live: "LIVE QLOO",
  recorded: "RECORDED LIVE EVIDENCE",
  synthetic: "SYNTHETIC TEST DATA",
} as const;
export const AUTHORITY_BOUNDARY =
  "Cultural policy only. No spending, purchase, booking, legal, account, private-data or execution authority is granted.";
export const STABILITY_NOTE =
  "Stability-lite tests deterministic policy replay and policy-boundary sensitivity. It does not prove provider robustness or preference probability.";
function evidenceOf(r: CulturalReceipt): CulturalEvidence {
  return {
    entity: r.candidate,
    rawAffinity: r.qlooEvidence.rawAffinity,
    alignmentScore: r.alignmentScore,
    scale: r.qlooEvidence.scale,
    rank: 0,
    explainability: r.explainability,
  };
}
// Structural/semantic validation is not verification of a provider signature or origin.
export function readCapturedReceipt(
  input: unknown,
): ProviderResult<CulturalReceipt> {
  try {
    const r = record(input) as unknown as CulturalReceipt;
    if (
      !r ||
      r.schemaVersion !== RECEIPT_SCHEMA_VERSION ||
      r.normalizationVersion !== NORMALIZATION_VERSION ||
      r.policyVersion !== POLICY_V1.version ||
      r.policy?.allowAbove !== POLICY_V1.allowAbove ||
      r.policy?.rejectBelow !== POLICY_V1.rejectBelow ||
      r.policy?.calibration !== POLICY_V1.calibration ||
      !uuid(r.receiptId) ||
      !uuid(r.requestId) ||
      typeof r.evaluatedAt !== "string" ||
      r.evaluatedAt.length > 64 ||
      !Number.isFinite(Date.parse(r.evaluatedAt)) ||
      r.action?.targetEntity?.name !== r.candidate?.name
    )
      return { status: "unavailable", reason: "invalid_response" };
    const snapshot = createReceipt(
      {
        action: r.action,
        signals: r.inputSignals,
        evidence: evidenceOf(r),
        provenance: r.qlooEvidence.provenance,
        decision: r.decision,
        requestId: r.requestId,
      },
      () => r.evaluatedAt,
      () => r.receiptId,
    );
    return { status: "available", data: snapshot };
  } catch {
    return { status: "unavailable", reason: "invalid_response" };
  }
}
export function explainTasteDecision(input: unknown) {
  const checked = readCapturedReceipt(input);
  if (checked.status === "unavailable") return checked;
  const r = checked.data;
  return {
    status: "available" as const,
    data: {
      action: r.action,
      candidate: r.candidate,
      decision: r.decision,
      affinity: {
        raw: r.qlooEvidence.rawAffinity,
        normalized: r.alignmentScore,
        scale: r.qlooEvidence.scale,
      },
      signals: r.inputSignals,
      explainability: r.explainability,
      provenance: r.qlooEvidence.provenance,
      policy: { version: r.policyVersion, ...r.policy },
      authorityBoundary: AUTHORITY_BOUNDARY,
    },
  };
}
export function checkDecisionStability(input: unknown) {
  const checked = readCapturedReceipt(input);
  if (checked.status === "unavailable") return checked;
  const r = checked.data,
    evidence = evidenceOf(r);
  const evaluations = Array.from({ length: 3 }, () =>
    evaluateEvidence(evidence),
  );
  const identical = evaluations.filter(
    (e) =>
      e.status === "available" &&
      e.data.outcome === r.decision.outcome &&
      e.data.reasonCode === r.decision.reasonCode,
  ).length;
  const score = r.alignmentScore,
    low = r.policy.rejectBelow,
    high = r.policy.allowAbove;
  const transitions =
    r.decision.outcome === "ALLOW"
      ? [
          {
            to: "ASK" as const,
            boundary: high,
            margin: score - high,
            direction: "down" as const,
            touchChangesOutcome: true,
          },
        ]
      : r.decision.outcome === "REJECT"
        ? [
            {
              to: "ASK" as const,
              boundary: low,
              margin: low - score,
              direction: "up" as const,
              touchChangesOutcome: true,
            },
          ]
        : [
            {
              to: "ALLOW" as const,
              boundary: high,
              margin: high - score,
              direction: "up" as const,
              touchChangesOutcome: false,
            },
            {
              to: "REJECT" as const,
              boundary: low,
              margin: score - low,
              direction: "down" as const,
              touchChangesOutcome: false,
            },
          ];
  const nearest = transitions.reduce((a, b) => (b.margin < a.margin ? b : a));
  return {
    status: "available" as const,
    data: {
      method: "deterministic-replay-and-policy-boundary-v1",
      policyVersion: r.policyVersion,
      score,
      thresholds: r.policy,
      replay: { runs: 3, identical, stable: identical === 3 },
      boundary: {
        outcome: r.decision.outcome,
        nearestBoundary: nearest.boundary,
        margin: nearest.margin,
        direction: nearest.direction,
        touchChangesOutcome: nearest.touchChangesOutcome,
        transitions,
      },
      note: STABILITY_NOTE,
    },
  };
}
