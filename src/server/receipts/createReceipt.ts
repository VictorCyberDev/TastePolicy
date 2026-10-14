import type {
  CulturalEvidence,
  CulturalReceipt,
  InferenceResult,
  PolicyDecision,
  ProposedAction,
  QlooEntity,
  Explainability,
} from "@/types/domain";
import { POLICY_V1 } from "@/server/policy/thresholds";
import { NORMALIZATION_VERSION } from "@/server/policy/normalization";
import { evaluateEvidence } from "@/server/policy/evaluate";
import {
  isResolvedEntity,
  isResolvedProfile,
  isSelectionTarget,
  snapshotEntity,
} from "@/server/taste/invariants";
import { isQlooHost } from "@/lib/config/qloo";

export const RECEIPT_SCHEMA_VERSION = "cultural-receipt-v1";
function snapshotExplanation(
  value: Explainability,
  ids: string[],
): Explainability {
  if (value.status === "unavailable") {
    if (
      ![
        "not_returned",
        "provider_warning",
        "unsupported_shape",
        "malformed_contribution",
      ].includes(value.reason)
    )
      throw Error("Invalid receipt evidence");
    return { status: value.status, reason: value.reason };
  }
  if (
    !["complete", "partial"].includes(value.status) ||
    !Array.isArray(value.contributions) ||
    !Array.isArray(value.missingSignalIds) ||
    !Array.isArray(value.omittedSignalIds) ||
    !Array.isArray(value.issues)
  )
    throw Error("Invalid receipt evidence");
  const contributions = value.contributions.map((c) => {
    if (
      !ids.includes(c.signalId) ||
      typeof c.score !== "number" ||
      !Number.isFinite(c.score) ||
      c.score < 0 ||
      c.score > 1
    )
      throw Error("Invalid receipt evidence");
    return { signalId: c.signalId, score: c.score };
  });
  const present = contributions.map((c) => c.signalId),
    missing = ids.filter((id) => !present.includes(id));
  const omissions = value.omittedSignalIds;
  if (
    new Set(present).size !== present.length ||
    value.missingSignalIds.length !== missing.length ||
    new Set(value.missingSignalIds).size !== missing.length ||
    value.missingSignalIds.some((id) => !missing.includes(id)) ||
    new Set(omissions).size !== omissions.length ||
    omissions.some((id) => !missing.includes(id)) ||
    value.issues.some(
      (i) =>
        ![
          "malformed_contribution",
          "missing_signals",
          "provider_warning",
        ].includes(i),
    )
  )
    throw Error("Invalid receipt evidence");
  const unknownMissing = missing.some((id) => !omissions.includes(id));
  const omission = omissions.length
    ? "explicit_provider_omission"
    : missing.length
      ? "unknown"
      : "none";
  if (
    value.omission !== omission ||
    (unknownMissing && !value.issues.includes("missing_signals")) ||
    value.status !== (value.issues.length ? "partial" : "complete")
  )
    throw Error("Invalid receipt evidence");
  return {
    status: value.status,
    contributions,
    missingSignalIds: [...missing],
    omittedSignalIds: [...omissions],
    omission,
    issues: [...value.issues],
  };
}
export function createReceipt(
  input: {
    action: ProposedAction;
    signals: QlooEntity[];
    evidence: CulturalEvidence;
    provenance: InferenceResult["provenance"];
    decision: PolicyDecision;
    requestId: string;
  },
  clock = () => new Date().toISOString(),
  id = () => crypto.randomUUID(),
): CulturalReceipt {
  const { action, signals, evidence, provenance, decision } = input;
  const expected = evaluateEvidence(evidence);
  if (
    !isResolvedProfile(signals) ||
    !isResolvedEntity(action.targetEntity) ||
    !isResolvedEntity(evidence.entity) ||
    action.kind !== "SELECT_ENTITY" ||
    !isSelectionTarget(evidence.entity.type) ||
    action.targetEntity.id !== evidence.entity.id ||
    action.targetEntity.type !== evidence.entity.type ||
    signals.some((s) => s.id === evidence.entity.id) ||
    (action.context !== undefined &&
      (typeof action.context !== "string" || action.context.length > 160)) ||
    expected.status !== "available" ||
    decision.outcome !== expected.data.outcome ||
    decision.reasonCode !== expected.data.reasonCode
  )
    throw Error("Invalid receipt evidence");
  const ids = signals.map((s) => s.id);
  if (
    provenance.provider !== "qloo" ||
    provenance.endpoint !== "/v2/insights" ||
    !isQlooHost(provenance.host) ||
    !Number.isFinite(Date.parse(provenance.fetchedAt)) ||
    provenance.targetType !== evidence.entity.type ||
    provenance.specificCandidateId !== evidence.entity.id ||
    !Array.isArray(provenance.signalIds) ||
    provenance.signalIds.length !== ids.length ||
    provenance.signalIds.some((id, i) => id !== ids[i]) ||
    typeof input.requestId !== "string" ||
    input.requestId.length < 1 ||
    input.requestId.length > 128
  )
    throw Error("Invalid receipt evidence");
  const candidate = snapshotEntity(evidence.entity);
  return {
    receiptId: id(),
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    normalizationVersion: NORMALIZATION_VERSION,
    policyVersion: POLICY_V1.version,
    decision: { outcome: decision.outcome, reasonCode: decision.reasonCode },
    action: {
      kind: action.kind,
      targetEntity: snapshotEntity(action.targetEntity),
      ...(action.context !== undefined ? { context: action.context } : {}),
    },
    candidate,
    inputSignals: signals.map(snapshotEntity),
    alignmentScore: evidence.alignmentScore,
    qlooEvidence: {
      rawAffinity: evidence.rawAffinity,
      scale: evidence.scale,
      provenance: {
        provider: "qloo",
        endpoint: "/v2/insights",
        host: provenance.host,
        fetchedAt: provenance.fetchedAt,
        signalIds: [...ids],
        targetType: provenance.targetType,
        specificCandidateId: provenance.specificCandidateId,
      },
    },
    explainability: snapshotExplanation(evidence.explainability, ids),
    policy: {
      allowAbove: POLICY_V1.allowAbove,
      rejectBelow: POLICY_V1.rejectBelow,
      calibration: POLICY_V1.calibration,
    },
    requestId: input.requestId,
    evaluatedAt: clock(),
  };
}
