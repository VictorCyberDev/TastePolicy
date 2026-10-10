import {
  ENTITY_TYPES,
  type EntityQuery,
  type TargetType,
} from "@/types/domain";
import { record, UUID_PATTERN } from "@/lib/validation";
export type DemoInput =
  | { operation: "resolve"; signals: EntityQuery[] }
  | { operation: "discover"; signalIds: string[]; targetType: TargetType }
  | {
      operation: "evaluate";
      signalIds: string[];
      candidateId: string;
      context?: string;
    };
export function validateDemoInput(
  operation: string,
  value: unknown,
): DemoInput | null {
  const r = record(value);
  if (!r) return null;
  if (operation === "resolve") {
    if (
      Object.keys(r).some((k) => k !== "signals") ||
      !Array.isArray(r.signals) ||
      r.signals.length !== 5
    )
      return null;
    const signals: EntityQuery[] = [];
    for (const raw of r.signals) {
      const q = record(raw);
      if (
        !q ||
        Object.keys(q).some((k) => !["query", "expectedType"].includes(k)) ||
        typeof q.query !== "string" ||
        q.query.trim().length < 1 ||
        q.query.length > 120 ||
        !ENTITY_TYPES.includes(q.expectedType as never)
      )
        return null;
      signals.push({
        query: q.query.trim(),
        expectedType: q.expectedType as EntityQuery["expectedType"],
      });
    }
    return { operation, signals };
  }
  if (
    !["discover", "evaluate"].includes(operation) ||
    Object.keys(r).some(
      (k) =>
        !(
          operation === "discover"
            ? ["signalIds", "targetType"]
            : ["signalIds", "candidateId", "context"]
        ).includes(k),
    ) ||
    !Array.isArray(r.signalIds) ||
    r.signalIds.length !== 5 ||
    r.signalIds.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))
  )
    return null;
  const signalIds = (r.signalIds as string[]).map((id) => id.toLowerCase());
  if (new Set(signalIds).size !== 5) return null;
  if (operation === "discover")
    return ["brand", "destination", "place"].includes(r.targetType as string)
      ? { operation, signalIds, targetType: r.targetType as TargetType }
      : null;
  if (
    typeof r.candidateId !== "string" ||
    !UUID_PATTERN.test(r.candidateId) ||
    signalIds.includes(r.candidateId.toLowerCase()) ||
    (r.context !== undefined &&
      (typeof r.context !== "string" || r.context.length > 160))
  )
    return null;
  return {
    operation: "evaluate",
    signalIds,
    candidateId: r.candidateId.toLowerCase(),
    ...(typeof r.context === "string" ? { context: r.context } : {}),
  };
}
