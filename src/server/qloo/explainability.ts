import type { Explainability, SignalContribution } from "@/types/domain";
import { record } from "./types";
// These conservative structural readers require live confirmation; unknown structures remain explicit.
export function normalizeExplainability(
  value: unknown,
  signalIds: readonly string[],
): Explainability {
  if (value === undefined || value === null)
    return { status: "unavailable", reason: "not_returned" };
  const object = record(value);
  if (!object) return { status: "unavailable", reason: "unsupported_shape" };
  if (object.warning)
    return { status: "unavailable", reason: "provider_warning" };
  const contributions: SignalContribution[] = [];
  const seen = new Set<string>();
  const add = (id: unknown, score: unknown) => {
    if (
      typeof id !== "string" ||
      typeof score !== "number" ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 1
    )
      return;
    const normalized = id.toLowerCase();
    if (signalIds.includes(normalized) && !seen.has(normalized)) {
      contributions.push({ signalId: normalized, score });
      seen.add(normalized);
    }
  };
  // Allow only known input IDs and numeric 0–1 contribution scores; discard names/free text/raw payloads.
  const entities = object.entities;
  if (Array.isArray(entities))
    for (const entity of entities) {
      const e = record(entity);
      if (e) add(e.entity_id ?? e.id, e.score ?? e.affinity);
    }
  else if (record(entities))
    for (const [id, entry] of Object.entries(
      entities as Record<string, unknown>,
    ))
      add(id, typeof entry === "number" ? entry : record(entry)?.score);
  for (const [id, score] of Object.entries(object)) add(id, score);
  return contributions.length
    ? {
        status: "available",
        contributions: contributions.sort((a, b) => b.score - a.score),
        omittedSignalsMayHaveLowImpact: true,
      }
    : { status: "unavailable", reason: "unsupported_shape" };
}
