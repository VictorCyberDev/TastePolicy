import type {
  TasteSubject,
  PermissionAttestation,
  SubjectEvent,
  AnchorProvenance,
  ProxyAuthorization,
  MemberAuthorization,
  TasteGroup,
  GroupVersion,
  GroupAuthorization,
} from "@/lib/subjects/types";
export interface SubjectRepository {
  insert(subject: TasteSubject): Promise<void>;
  find(owner: string, id: string): Promise<TasteSubject | null>;
  list(owner: string): Promise<TasteSubject[]>;
  grant(value: PermissionAttestation): Promise<void>;
  permission(
    owner: string,
    subject: string,
  ): Promise<PermissionAttestation | null>;
  event(value: SubjectEvent): Promise<void>;
  events(owner: string, subject: string): Promise<SubjectEvent[]>;
  provenance(value: AnchorProvenance): Promise<void>;
  anchorProvenance(
    owner: string,
    subject: string,
    version: number,
  ): Promise<AnchorProvenance | null>;
  authorization(owner: string, value: MemberAuthorization): Promise<void>;
  memberAuthorization(
    owner: string,
    id: string,
  ): Promise<MemberAuthorization | null>;
  insertProxy(owner: string, value: ProxyAuthorization): Promise<void>;
  proxy(owner: string, id: string): Promise<ProxyAuthorization | null>;
}
export interface GroupRepository {
  insert(group: TasteGroup): Promise<void>;
  find(owner: string, id: string): Promise<TasteGroup | null>;
  list(owner: string): Promise<TasteGroup[]>;
  version(owner: string, id: string, n: number): Promise<GroupVersion | null>;
  insertVersion(value: GroupVersion): Promise<void>;
  advance(owner: string, id: string, version: number): Promise<void>;
  close(owner: string, id: string, eventId: string): Promise<void>;
  closed(owner: string, id: string): Promise<boolean>;
  insertAuthorization(owner: string, value: GroupAuthorization): Promise<void>;
  authorization(owner: string, id: string): Promise<GroupAuthorization | null>;
  members(owner: string, authorization: string): Promise<MemberAuthorization[]>;
}
export interface SubjectOperationRepository {
  find(
    owner: string,
    op: string,
    key: string,
  ): Promise<{ payloadHash: string; result: unknown } | null>;
  insert(
    owner: string,
    op: string,
    key: string,
    payloadHash: string,
    result: unknown,
  ): Promise<void>;
}
