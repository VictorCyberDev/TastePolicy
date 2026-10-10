import type { QlooProvider } from "@/server/qloo/contracts";
import type {
  EvaluationResult,
  InferenceResult,
  ProviderResult,
  QlooEntity,
  TargetType,
} from "@/types/domain";
import { evaluateEvidence } from "@/server/policy/evaluate";
import { createReceipt } from "@/server/receipts/createReceipt";
import {
  isResolvedEntity,
  isResolvedProfile,
  isSelectionTarget,
  signalIdentitySet,
} from "./invariants";
import { uuid } from "@/lib/validation";

async function resolveProfile(
  provider: QlooProvider,
  ids: string[],
  candidateId?: string,
): Promise<ProviderResult<{ signals: QlooEntity[]; candidate?: QlooEntity }>> {
  const requested = candidateId ? [...ids, candidateId] : ids;
  const result = await provider.entities(requested);
  if (result.status === "unavailable") return result;
  if (
    !Array.isArray(result.data) ||
    result.data.some(
      (e) => !isResolvedEntity(e) || !requested.includes(e.id),
    ) ||
    new Set(result.data.map((e) => e.id)).size !== result.data.length
  )
    return { status: "unavailable", reason: "invalid_response" };
  const signals = ids.map((id) => result.data.find((e) => e.id === id));
  if (!isResolvedProfile(signals))
    return { status: "unavailable", reason: "unresolved_profile" };
  const candidate = candidateId
    ? result.data.find((e) => e.id === candidateId)
    : undefined;
  if (candidateId && (!candidate || !isSelectionTarget(candidate.type)))
    return { status: "unavailable", reason: "unsupported_entity" };
  return { status: "available", data: { signals, candidate } };
}
export async function discover(
  provider: QlooProvider,
  signalIds: string[],
  targetType: TargetType,
): Promise<ProviderResult<InferenceResult>> {
  const ids = signalIdentitySet(signalIds);
  if (!ids || !isSelectionTarget(targetType))
    return { status: "unavailable", reason: "unresolved_profile" };
  const profile = await resolveProfile(provider, ids);
  if (profile.status === "unavailable") return profile;
  if (!profile.data.signals.some((e) => e.type !== targetType))
    return { status: "unavailable", reason: "unresolved_profile" };
  const inference = await provider.infer({ signalIds: ids, targetType });
  if (inference.status === "unavailable") return inference;
  const candidates = inference.data.candidates;
  if (
    !Array.isArray(candidates) ||
    candidates.length > 8 ||
    candidates.some(
      (e) =>
        !isResolvedEntity(e.entity) ||
        e.entity.type !== targetType ||
        ids.includes(e.entity.id),
    ) ||
    new Set(candidates.map((e) => e.entity.id)).size !== candidates.length
  )
    return { status: "unavailable", reason: "invalid_response" };
  if (!candidates.length)
    return { status: "unavailable", reason: "no_evidence" };
  return inference;
}
export async function evaluateAction(
  provider: QlooProvider,
  signalIds: string[],
  candidateId: string,
  requestId: string,
  context?: string,
): Promise<EvaluationResult> {
  const ids = signalIdentitySet(signalIds),
    candidateIdentity = uuid(candidateId);
  if (
    !ids ||
    !candidateIdentity ||
    ids.includes(candidateIdentity) ||
    (context !== undefined &&
      (typeof context !== "string" || context.length > 160))
  )
    return { status: "unavailable", reason: "unresolved_profile" };
  const profile = await resolveProfile(provider, ids, candidateIdentity);
  if (profile.status === "unavailable") return profile;
  const candidate = profile.data.candidate!;
  const inference = await provider.infer({
    signalIds: ids,
    targetType: candidate.type,
    candidateId: candidateIdentity,
  });
  if (inference.status === "unavailable") return inference;
  if (
    !Array.isArray(inference.data.candidates) ||
    inference.data.candidates.length > 1 ||
    inference.data.candidates.some(
      (e) =>
        !isResolvedEntity(e.entity) ||
        e.entity.id !== candidate.id ||
        e.entity.type !== candidate.type,
    )
  )
    return { status: "unavailable", reason: "invalid_response" };
  const evidence = inference.data.candidates[0] ?? null;
  const decision = evaluateEvidence(evidence);
  if (decision.status === "unavailable" || !evidence)
    return { status: "unavailable", reason: "no_evidence" };
  try {
    return {
      status: "available",
      data: createReceipt({
        action: {
          kind: "SELECT_ENTITY",
          targetEntity: candidate,
          ...(context ? { context } : {}),
        },
        signals: profile.data.signals,
        evidence,
        provenance: inference.data.provenance,
        decision: decision.data,
        requestId,
      }),
    };
  } catch {
    return { status: "unavailable", reason: "invalid_response" };
  }
}
