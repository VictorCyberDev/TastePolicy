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
async function resolveProfile(
  provider: QlooProvider,
  ids: string[],
  candidateId?: string,
): Promise<ProviderResult<{ signals: QlooEntity[]; candidate?: QlooEntity }>> {
  const result = await provider.entities(
    candidateId ? [...ids, candidateId] : ids,
  );
  if (result.status === "unavailable") return result;
  const signals = ids.map((id) => result.data.find((e) => e.id === id));
  if (
    signals.some((e) => !e) ||
    new Set(result.data.filter((e) => ids.includes(e.id)).map((e) => e.type))
      .size < 2
  )
    return { status: "unavailable", reason: "unresolved_profile" };
  const candidate = candidateId
    ? result.data.find((e) => e.id === candidateId)
    : undefined;
  if (candidateId && !candidate)
    return { status: "unavailable", reason: "unsupported_entity" };
  return {
    status: "available",
    data: { signals: signals as QlooEntity[], candidate },
  };
}
export async function discover(
  provider: QlooProvider,
  signalIds: string[],
  targetType: TargetType,
): Promise<ProviderResult<InferenceResult>> {
  const profile = await resolveProfile(provider, signalIds);
  if (profile.status === "unavailable") return profile;
  if (!profile.data.signals.some((e) => e.type !== targetType))
    return { status: "unavailable", reason: "unresolved_profile" };
  return provider.infer({ signalIds, targetType });
}
export async function evaluateAction(
  provider: QlooProvider,
  signalIds: string[],
  candidateId: string,
  requestId: string,
  context?: string,
): Promise<EvaluationResult> {
  const profile = await resolveProfile(provider, signalIds, candidateId);
  if (profile.status === "unavailable") return profile;
  const candidate = profile.data.candidate!;
  if (!["brand", "place", "destination"].includes(candidate.type))
    return { status: "unavailable", reason: "unsupported_entity" };
  const inference = await provider.infer({
    signalIds,
    targetType: candidate.type,
    candidateId,
  });
  if (inference.status === "unavailable") return inference;
  const evidence =
    inference.data.candidates.find((e) => e.entity.id === candidateId) ?? null;
  const decision = evaluateEvidence(evidence);
  if (decision.status === "unavailable" || !evidence)
    return { status: "unavailable", reason: "no_evidence" };
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
}
