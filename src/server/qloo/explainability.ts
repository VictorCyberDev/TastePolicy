import type {
  Explainability,
  ExplainabilityIssue,
  SignalContribution,
} from "@/types/domain";
import { record, uuid } from "@/lib/validation";

// One provisional structural reader only. Not a claim about the live Qloo schema.
// Omission IDs must be explicitly supplied by a verified adapter contract; gaps
// alone never imply that Qloo deliberately omitted a low-impact signal.
export function normalizeExplainability(
  value: unknown,
  signalIds: readonly string[],
  metadata: { warning?: unknown; omittedSignalIds?: readonly string[] } = {},
): Explainability {
  const object = record(value);
  const warning = Boolean(metadata.warning || object?.warning);
  if (value === undefined || value === null)
    return {
      status: "unavailable",
      reason: warning ? "provider_warning" : "not_returned",
    };
  if (!object || !Array.isArray(object.entities))
    return {
      status: "unavailable",
      reason: warning ? "provider_warning" : "unsupported_shape",
    };
  const contributions: SignalContribution[] = [];
  const seen = new Set<string>();
  let malformed = false;
  for (const entry of object.entities) {
    const e = record(entry);
    const id = uuid(e?.entity_id);
    const score = e?.score;
    if (
      !id ||
      !signalIds.includes(id) ||
      seen.has(id) ||
      typeof score !== "number" ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 1
    ) {
      malformed = true;
      continue;
    }
    contributions.push({ signalId: id, score });
    seen.add(id);
  }
  const missingSignalIds = signalIds.filter((id) => !seen.has(id));
  const omittedSignalIds: string[] = [];
  for (const raw of metadata.omittedSignalIds ?? []) {
    const id = uuid(raw);
    if (!id || !missingSignalIds.includes(id) || omittedSignalIds.includes(id))
      malformed = true;
    else omittedSignalIds.push(id);
  }
  const issues: ExplainabilityIssue[] = [];
  if (malformed) issues.push("malformed_contribution");
  if (missingSignalIds.some((id) => !omittedSignalIds.includes(id)))
    issues.push("missing_signals");
  if (warning) issues.push("provider_warning");
  if (!contributions.length && (malformed || warning))
    return {
      status: "unavailable",
      reason: warning ? "provider_warning" : "malformed_contribution",
    };
  return {
    status: issues.length ? "partial" : "complete",
    contributions: contributions.sort((a, b) => b.score - a.score),
    missingSignalIds: [...missingSignalIds],
    omittedSignalIds,
    omission: omittedSignalIds.length
      ? "explicit_provider_omission"
      : missingSignalIds.length
        ? "unknown"
        : "none",
    issues,
  };
}
