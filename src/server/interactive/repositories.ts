import type {
  ClarificationRecord,
  RepairRecord,
} from "@/lib/interactive/types";
export interface ClarificationRepository {
  find(profileId: string, id: string): Promise<ClarificationRecord | null>;
  byKey(profileId: string, key: string): Promise<ClarificationRecord | null>;
  insert(record: ClarificationRecord): Promise<void>;
}
export interface RepairRepository {
  find(profileId: string, id: string): Promise<RepairRecord | null>;
  byKey(profileId: string, key: string): Promise<RepairRecord | null>;
  insert(record: RepairRecord): Promise<void>;
}
