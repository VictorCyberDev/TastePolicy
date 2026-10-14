import type {
  EntityQuery,
  EntityResolution,
  QlooEntity,
  EntityType,
  InferenceResult,
  ProviderResult,
} from "@/types/domain";
export interface QlooProvider {
  resolve(query: EntityQuery): Promise<ProviderResult<EntityResolution>>;
  entities(ids: readonly string[]): Promise<ProviderResult<QlooEntity[]>>;
  infer(input: {
    signalIds: readonly string[];
    targetType: EntityType;
    candidateId?: string;
  }): Promise<ProviderResult<InferenceResult>>;
}
