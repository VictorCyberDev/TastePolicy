import type { QlooProvider } from "@/server/qloo/contracts";
import type {
  EntityQuery,
  EntityResolution,
  ProviderResult,
} from "@/types/domain";
import { RESOLUTION_CONCURRENCY } from "@/lib/config/qloo-budget";
// Bounded waves preserve each signal's result and order; no retry or fallback.
export async function resolveSignals(
  provider: QlooProvider,
  signals: EntityQuery[],
) {
  const results: ProviderResult<EntityResolution>[] = [];
  for (let i = 0; i < signals.length; i += RESOLUTION_CONCURRENCY) {
    results.push(
      ...(await Promise.all(
        signals
          .slice(i, i + RESOLUTION_CONCURRENCY)
          .map((signal) => provider.resolve(signal)),
      )),
    );
  }
  return results;
}
