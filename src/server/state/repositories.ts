import type {
  Profile,
  Session,
  StateVersion,
  FeedbackEvent,
  MutationRecord,
  StateEvaluation,
  EvidenceBundle,
} from "@/lib/state/types";
export interface TasteStateRepository {
  profile(id: string, lock?: boolean): Promise<Profile | null>;
  create(profile: Profile): Promise<void>;
  version(id: string, n: number): Promise<StateVersion | null>;
  insertVersion(state: StateVersion): Promise<void>;
  advance(id: string, n: number): Promise<void>;
}
export interface MutationRepository {
  find(profileId: string, key: string): Promise<MutationRecord | null>;
  insert(record: MutationRecord): Promise<void>;
}
export interface FeedbackEventRepository {
  insert(event: FeedbackEvent): Promise<void>;
  list(profileId: string): Promise<FeedbackEvent[]>;
}
export interface EvidenceRepository {
  insert(bundle: EvidenceBundle): Promise<void>;
}
export interface ProposalRepository {
  insert(evaluation: StateEvaluation): Promise<void>;
}
export interface ReceiptRepository {
  insert(evaluation: StateEvaluation): Promise<void>;
  find(profileId: string, id: string): Promise<StateEvaluation | null>;
  list(profileId: string): Promise<StateEvaluation[]>;
}
export interface DemoSessionRepository {
  find(hash: string, lock?: boolean): Promise<Session | null>;
  insert(session: Session): Promise<void>;
  consume(hash: string): Promise<void>;
  purge(now: string): Promise<void>;
}
export interface Repositories {
  states: TasteStateRepository;
  mutations: MutationRepository;
  feedback: FeedbackEventRepository;
  evidence: EvidenceRepository;
  proposals: ProposalRepository;
  receipts: ReceiptRepository;
  sessions: DemoSessionRepository;
}
export interface StateStore {
  transaction<T>(fn: (repositories: Repositories) => Promise<T>): Promise<T>;
}
