import "server-only";
import { randomUUID } from "node:crypto";
import type { Repositories, StateStore } from "@/server/state/repositories";
import type { Profile, StateEvaluation, StateVersion } from "@/lib/state/types";
import { StateFailure } from "@/lib/state/types";
import {
  SubjectFailure,
  type TasteSubject,
  type PermissionScope,
  type MemberAuthorization,
  type GroupVersion,
} from "@/lib/subjects/types";
import { hash } from "@/server/state/hash";
import { stateDecision } from "@/server/state/policy";
import { readCapturedReceipt } from "@/lib/proof/receipt";
import { stateHash } from "@/server/state/service";
export function fail(
  code: ConstructorParameters<typeof SubjectFailure>[0],
): never {
  throw new SubjectFailure(code);
}
export function object(v: unknown, allowed: string[]): Record<string, unknown> {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !allowed.includes(k))
  )
    fail("INVALID_INPUT");
  return v as Record<string, unknown>;
}
export function id(v: unknown): string {
  if (
    typeof v !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v,
    )
  )
    fail("INVALID_INPUT");
  return (v as string).toLowerCase();
}
export function label(v: unknown): string {
  if (
    typeof v !== "string" ||
    !v.trim() ||
    v.trim().length > 60 ||
    /[\u0000-\u001f]/.test(v)
  )
    fail("INVALID_INPUT");
  return (v as string).trim();
}
export function integer(v: unknown): number {
  if (!Number.isSafeInteger(v) || (v as number) < 0) fail("INVALID_INPUT");
  return v as number;
}
export function key(v: unknown): string {
  if (typeof v !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(v))
    fail("INVALID_INPUT");
  return v as string;
}
export async function owner(r: Repositories, token: string, now: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new StateFailure("SESSION_EXPIRED");
  const session = await r.sessions.find(hash(token), true);
  if (!session || session.expiresAt <= now)
    throw new StateFailure("SESSION_EXPIRED");
  const profile = await r.states.profile(session.profileId, true);
  if (!profile || profile.expiresAt <= now)
    throw new StateFailure("SESSION_EXPIRED");
  return { session, profile };
}
export async function self(r: Repositories, p: Profile) {
  const existing = await r.subjects.find(p.profileId, p.profileId);
  if (existing) return existing;
  const s: TasteSubject = {
    ownerProfileId: p.profileId,
    subjectId: p.profileId,
    stateProfileId: p.profileId,
    subjectKind: "SELF",
    displayLabel: "You",
    createdAt: p.createdAt,
    expiresAt: p.expiresAt,
  };
  await r.subjects.insert(s);
  return s;
}
export async function subject(r: Repositories, o: string, s: string) {
  return (await r.subjects.find(o, s)) ?? fail("NOT_FOUND");
}
export async function permitted(
  r: Repositories,
  s: TasteSubject,
  scope: PermissionScope,
  now: string,
) {
  const p = await r.subjects.permission(s.ownerProfileId, s.subjectId);
  if (
    !p ||
    p.expiresAt <= now ||
    s.expiresAt <= now ||
    (await r.subjects.events(s.ownerProfileId, s.subjectId)).length
  )
    fail("PERMISSION_INACTIVE");
  if (!p.scopes.includes(scope)) fail("PERMISSION_SCOPE_REQUIRED");
  return p;
}
export async function currentState(r: Repositories, s: TasteSubject) {
  const p = await r.states.profile(s.stateProfileId, true);
  if (!p) fail("NOT_FOUND");
  return (
    (await r.states.version(s.stateProfileId, p.currentStateVersion)) ??
    fail("INTEGRITY_ERROR")
  );
}
export async function operation<T>(
  store: StateStore,
  token: string,
  now: string,
  op: string,
  input: Record<string, unknown>,
  work: (r: Repositories, p: Profile) => Promise<T>,
): Promise<T> {
  const k = key(input.idempotencyKey),
    payloadHash = hash(input);
  return store.transaction(async (r) => {
    const { session, profile } = await owner(r, token, now);
    const previous = await r.subjectOperations.find(profile.profileId, op, k);
    if (previous) {
      if (previous.payloadHash !== payloadHash)
        throw new StateFailure("IDEMPOTENCY_KEY_CONFLICT");
      return previous.result as T;
    }
    if (session.mutations >= 100) throw new StateFailure("RATE_LIMITED");
    const result = await work(r, profile);
    await r.subjectOperations.insert(
      profile.profileId,
      op,
      k,
      payloadHash,
      result,
    );
    await r.sessions.consume(session.tokenHash);
    return result;
  });
}
export function signed<T extends object>(
  value: T,
): T & { semanticHash: string } {
  return { ...value, semanticHash: hash(value) };
}
export function checkHash<T extends { semanticHash: string }>(value: T) {
  const { semanticHash, ...body } = value;
  if (hash(body) !== semanticHash) fail("INTEGRITY_ERROR");
}
export async function replayEvaluation(
  r: Repositories,
  s: TasteSubject,
  eid: string,
): Promise<StateEvaluation> {
  const e = await r.receipts.find(s.stateProfileId, eid);
  if (!e) fail("NOT_FOUND");
  const state = await r.states.version(s.stateProfileId, e.stateVersion);
  if (
    !state ||
    state.stateHash !== e.stateHash ||
    stateHash(state.entries) !== state.stateHash ||
    (e.cultural.status === "available" &&
      readCapturedReceipt(e.cultural.data).status !== "available") ||
    hash(
      stateDecision(
        state,
        e.action.candidate,
        e.context,
        e.cultural,
        e.evaluatedAt,
      ),
    ) !== hash(e.decision)
  )
    fail("INTEGRITY_ERROR");
  return e;
}
export function member(
  s: TasteSubject,
  e: StateEvaluation,
): MemberAuthorization {
  return {
    authorizationId: e.evaluationId,
    subjectId: s.subjectId,
    subjectKind: s.subjectKind,
    stateProfileId: s.stateProfileId,
    stateVersion: e.stateVersion,
    stateHash: e.stateHash,
    candidate: e.action.candidate,
    context: e.context,
    contextHash: hash(e.context),
    decision: e.decision.outcome,
    decisionBasis: e.decision.basis,
    evidenceAvailability: e.cultural.status,
  };
}
export async function versionGroup(
  r: Repositories,
  p: Profile,
  groupId: string,
  members: string[],
  now: string,
  previous?: GroupVersion,
) {
  const v = signed({
    ownerProfileId: p.profileId,
    groupId,
    groupVersion: previous ? previous.groupVersion + 1 : 1,
    parentVersion: previous?.groupVersion ?? null,
    memberSubjectIds: [...members].sort(),
    policyId: "UNANIMOUS_NO_VETO_V1" as const,
    createdAt: now,
  });
  await r.groups.insertVersion(v);
  if (previous) await r.groups.advance(p.profileId, groupId, v.groupVersion);
  return v;
}
export async function writeAnchors(
  r: Repositories,
  s: TasteSubject,
  entities: import("@/types/domain").QlooEntity[],
  now: string,
  attestationId: string,
  k: string,
  previous?: StateVersion,
) {
  const mutationId = randomUUID();
  const entries = entities.map(
    (entity) =>
      previous?.entries.find(
        (e) => e.kind === "EXPLICIT_LIKE" && e.entity?.id === entity.id,
      ) ?? {
        signalId: randomUUID(),
        kind: "EXPLICIT_LIKE" as const,
        entity,
        scope: "GLOBAL_PREFERENCE" as const,
        persistence: "DURABLE" as const,
        source: "USER" as const,
        sourceEventId: mutationId,
        createdAt: now,
      },
  );
  const state: StateVersion = {
    profileId: s.stateProfileId,
    stateVersion: previous ? previous.stateVersion + 1 : 1,
    parentVersion: previous?.stateVersion ?? 0,
    mutationId,
    entries,
    createdAt: now,
    stateHash: stateHash(entries),
  };
  await r.states.insertVersion(state);
  await r.mutations.insert({
    profileId: s.stateProfileId,
    key: k,
    payloadHash: hash(entities),
    result: { state, mutationId },
  });
  await r.states.advance(s.stateProfileId, state.stateVersion);
  await r.subjects.provenance({
    ownerProfileId: s.ownerProfileId,
    subjectId: s.subjectId,
    stateProfileId: s.stateProfileId,
    stateVersion: state.stateVersion,
    attestationId,
    source: "DELEGATE_ATTESTED",
    signalIds: entries.map((e) => e.signalId).sort(),
  });
  return state;
}
