import type { QlooProvider } from "@/server/qloo/contracts";
import { evaluateAction } from "@/server/taste/service";
import { acquireDemoBudget } from "@/server/taste/budget";
import {
  signalIdentitySet,
  isSelectionTarget,
} from "@/server/taste/invariants";
import { record, uuid } from "@/lib/validation";
import {
  checkDecisionStability,
  explainTasteDecision,
} from "@/lib/proof/receipt";
export {
  checkDecisionStability,
  explainTasteDecision,
} from "@/lib/proof/receipt";
export function validateAgentProposal(input: unknown) {
  const r = record(input),
    action = record(r?.action),
    candidate = record(action?.candidate);
  if (
    !r ||
    Object.keys(r).some(
      (k) => !["signalIds", "identitiesReviewed", "action"].includes(k),
    ) ||
    r.identitiesReviewed !== true ||
    !action ||
    Object.keys(action).some(
      (k) => !["kind", "candidate", "context"].includes(k),
    ) ||
    action.kind !== "SELECT_ENTITY" ||
    !candidate ||
    Object.keys(candidate).some((k) => !["id", "type"].includes(k)) ||
    !isSelectionTarget(candidate.type) ||
    (action.context !== undefined &&
      (typeof action.context !== "string" || action.context.length > 160))
  )
    return null;
  const signalIds = signalIdentitySet(r.signalIds),
    candidateId = uuid(candidate.id);
  if (!signalIds || !candidateId || signalIds.includes(candidateId))
    return null;
  return {
    signalIds,
    candidateId,
    targetType: candidate.type,
    context: action.context as string | undefined,
  };
}
// Trusted local DI boundary. No HTTP endpoint or arbitrary Qloo operation is exposed.
export function createAgentGateway(
  providerFactory: () => QlooProvider | Promise<QlooProvider>,
) {
  return {
    async evaluateTasteAction(input: unknown) {
      const request = validateAgentProposal(input);
      if (!request) return { status: "error" as const, code: "INVALID_INPUT" };
      const release = acquireDemoBudget();
      if (!release)
        return {
          status: "unavailable" as const,
          reason: "rate_limited" as const,
        };
      try {
        const provider = await providerFactory();
        const checkedProvider: QlooProvider = {
          resolve: (query) => provider.resolve(query),
          infer: (input) => provider.infer(input),
          async entities(ids) {
            const result = await provider.entities(ids);
            if (result.status === "available" && !Array.isArray(result.data))
              return { status: "unavailable", reason: "invalid_response" };
            if (
              result.status === "available" &&
              result.data.find((e) => e.id === request.candidateId)?.type !==
                request.targetType
            )
              return { status: "unavailable", reason: "unsupported_entity" };
            return result;
          },
        };
        return await evaluateAction(
          checkedProvider,
          request.signalIds,
          request.candidateId,
          crypto.randomUUID(),
          request.context,
        );
      } catch {
        return { status: "error" as const, code: "INTERNAL_ERROR" };
      } finally {
        release();
      }
    },
    explainTasteDecision,
    checkDecisionStability,
  };
}
