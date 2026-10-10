import type { AffinityScale } from "@/types/domain";
// Explicit scale only: no magnitude guessing, clamping, string coercion, or rounding.
export function normalizeAffinity(
  value: unknown,
  scale: AffinityScale,
): number | null {
  if (scale !== "unit" && scale !== "percent") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const maximum = scale === "percent" ? 100 : 1;
  return value >= 0 && value <= maximum ? value / maximum : null;
}
