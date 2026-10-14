import "server-only";
import type {
  AffinityScale,
  QlooEntity,
  ProviderResult,
  CulturalEvidence,
} from "@/types/domain";
import type { QlooProvider } from "./contracts";
import type { QlooTransport } from "./client";
import { entityList, normalizeEntity } from "./types";
import { record, UUID_PATTERN } from "@/lib/validation";
import { normalizeAffinity } from "@/server/policy/normalization";
import { normalizeExplainability } from "./explainability";
export function createQlooAdapter(
  transport: QlooTransport,
  config: { host?: string; scale?: AffinityScale },
  now = () => new Date().toISOString(),
): QlooProvider {
  async function readEntities(
    path: "/search" | "/entities",
    parameters: URLSearchParams,
  ): Promise<ProviderResult<QlooEntity[]>> {
    const result = await transport(path, parameters);
    if (result.status === "unavailable") return result;
    const list = entityList(result.data);
    if (!list || list.length > 100)
      return { status: "unavailable", reason: "invalid_response" };
    const entities = list.map((item) => normalizeEntity(item, "lookup"));
    if (entities.some((x) => !x))
      return { status: "unavailable", reason: "invalid_response" };
    return {
      status: "available",
      data: [
        ...new Map((entities as QlooEntity[]).map((e) => [e.id, e])).values(),
      ],
    };
  }
  return {
    async resolve(query) {
      if (query.query.trim().length < 1 || query.query.length > 120)
        return { status: "unavailable", reason: "unresolved_profile" };
      const r = await readEntities(
        "/search",
        new URLSearchParams({
          query: query.query,
          types: `urn:entity:${query.expectedType}`,
          take: "12",
        }),
      );
      if (r.status === "unavailable") {
        if (r.reason === "no_evidence")
          return {
            status: "available",
            data: { query, matches: [], state: "no_match" },
          };
        return r;
      }
      if (r.data.some((e) => e.type !== query.expectedType))
        return { status: "unavailable", reason: "invalid_response" };
      return {
        status: "available",
        data: {
          query,
          matches: r.data,
          state:
            r.data.length === 0
              ? "no_match"
              : r.data.length === 1
                ? "single"
                : "ambiguous",
        },
      };
    },
    async entities(ids) {
      if (
        !ids.length ||
        ids.length > 6 ||
        ids.some((id) => !UUID_PATTERN.test(id))
      )
        return { status: "unavailable", reason: "unsupported_entity" };
      const r = await readEntities(
        "/entities",
        new URLSearchParams({ entity_ids: ids.join(",") }),
      );
      if (r.status === "unavailable") return r;
      if (r.data.some((e) => !ids.includes(e.id)))
        return { status: "unavailable", reason: "invalid_response" };
      return { status: "available", data: r.data };
    },
    async infer(input) {
      if (
        input.signalIds.length !== 5 ||
        input.signalIds.some((id) => !UUID_PATTERN.test(id)) ||
        (input.candidateId && !UUID_PATTERN.test(input.candidateId))
      )
        return { status: "unavailable", reason: "unresolved_profile" };
      if (!config.scale)
        return { status: "unavailable", reason: "affinity_scale_unverified" };
      const params = new URLSearchParams({
        "signal.interests.entities": input.signalIds.join(","),
        "filter.type": `urn:entity:${input.targetType}`,
        "feature.explainability": "true",
        take: input.candidateId ? "1" : "8",
      });
      if (input.candidateId)
        params.set("filter.results.entities", input.candidateId);
      else params.set("filter.exclude.entities", input.signalIds.join(","));
      const result = await transport("/v2/insights", params);
      if (result.status === "unavailable") return result;
      const list = entityList(result.data);
      if (!list || list.length > 8)
        return { status: "unavailable", reason: "invalid_response" };
      const candidates: CulturalEvidence[] = [];
      for (const [index, item] of list.entries()) {
        const entity = normalizeEntity(item, "insights");
        const query = record(record(item)?.query);
        const raw = query?.affinity;
        const alignmentScore = normalizeAffinity(raw, config.scale);
        if (
          !entity ||
          entity.type !== input.targetType ||
          alignmentScore === null ||
          (input.candidateId && entity.id !== input.candidateId)
        )
          return { status: "unavailable", reason: "invalid_response" };
        candidates.push({
          entity,
          rawAffinity: raw as number,
          alignmentScore,
          scale: config.scale,
          rank: index + 1,
          explainability: normalizeExplainability(
            query?.explainability,
            input.signalIds,
            {
              warning:
                record(record(record(result.data)?.query)?.explainability)
                  ?.warning ||
                (Array.isArray(record(result.data)?.warnings) &&
                  (record(result.data)?.warnings as unknown[]).length > 0),
            },
          ),
        });
      }
      if (!candidates.length)
        return { status: "unavailable", reason: "no_evidence" };
      return {
        status: "available",
        data: {
          candidates,
          provenance: {
            provider: "qloo",
            endpoint: "/v2/insights",
            host: config.host ?? "",
            fetchedAt: now(),
            signalIds: [...input.signalIds],
            targetType: input.targetType,
            ...(input.candidateId
              ? { specificCandidateId: input.candidateId }
              : {}),
          },
        },
      };
    },
  };
}
