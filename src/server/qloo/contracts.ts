import type {
  CulturalEvidence,
  ProviderResult,
  TasteContext,
  TasteSignal,
} from "@/types/domain";
// Future dependency-injected server adapter. No network implementation or fabricated results.
export interface QlooProvider {
  infer(input: {
    signals: readonly TasteSignal[];
    context: TasteContext;
  }): Promise<ProviderResult<readonly CulturalEvidence[]>>;
}
