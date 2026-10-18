import type {
  TrajectoryIntent,
  TrajectoryGeneration,
  TrajectoryEvent,
} from "@/lib/trajectory/types";
export interface TrajectoryRepository {
  hasActiveIntent(
    profile: string,
    currentIntentSignalIds: readonly string[],
  ): Promise<boolean>;
  intent(profile: string, id: string): Promise<TrajectoryIntent | null>;
  intentByKey(profile: string, key: string): Promise<TrajectoryIntent | null>;
  insertIntent(value: TrajectoryIntent): Promise<void>;
  generation(profile: string, id: string): Promise<TrajectoryGeneration | null>;
  generationByKey(
    profile: string,
    key: string,
  ): Promise<TrajectoryGeneration | null>;
  generations(
    profile: string,
    trajectory: string,
  ): Promise<TrajectoryGeneration[]>;
  insertGeneration(value: TrajectoryGeneration): Promise<void>;
  eventByKey(profile: string, key: string): Promise<TrajectoryEvent | null>;
  events(profile: string, trajectory: string): Promise<TrajectoryEvent[]>;
  insertEvent(value: TrajectoryEvent): Promise<void>;
}
