import "server-only";
import { randomUUID } from "node:crypto";
import type { Repositories, StateStore } from "@/server/state/repositories";
import {
  AUTHORITY_BOUNDARY,
  type MemberAuthorization,
  type GroupAuthorization,
} from "@/lib/subjects/types";
import { hash } from "@/server/state/hash";
import { groupPolicy } from "./policy";
import { replayProxy } from "./proxy-service";
import { applyMemberPolicy, replayMemberPolicy } from "./member-policy";
import {
  object,
  id,
  label,
  integer,
  fail,
  operation,
  owner,
  self,
  subject,
  permitted,
  currentState,
  versionGroup,
  signed,
  checkHash,
  replayEvaluation,
  member,
} from "./common";
// No provider factory: group authorization consumes completed subject evidence only.
export class GroupService {
  constructor(
    readonly store: StateStore,
    readonly clock = () => new Date().toISOString(),
  ) {}
  async inspect(token: string) {
    return this.store.transaction(async (r) => {
      const { profile } = await owner(r, token, this.clock());
      await self(r, profile);
      return Promise.all(
        (await r.groups.list(profile.profileId)).map(async (g) => ({
          group: g,
          closed: await r.groups.closed(profile.profileId, g.groupId),
          version: await r.groups.version(
            profile.profileId,
            g.groupId,
            g.currentVersion,
          ),
        })),
      );
    });
  }
  private members(v: unknown) {
    if (!Array.isArray(v) || v.length < 2 || v.length > 5)
      fail("INVALID_INPUT");
    const ids = (v as unknown[]).map(id);
    if (new Set(ids).size !== ids.length) fail("GROUP_MEMBER_DUPLICATE");
    return ids.sort();
  }
  private async validateMembers(r: Repositories, o: string, ids: string[]) {
    for (const sid of ids) {
      const s = await subject(r, o, sid);
      if (s.subjectKind === "PROXY")
        await permitted(r, s, "GROUP_EVALUATION", this.clock());
    }
  }
  async create(token: string, raw: unknown) {
    const v = object(raw, [
        "idempotencyKey",
        "displayLabel",
        "memberSubjectIds",
      ]),
      displayLabel = label(v.displayLabel),
      members = this.members(v.memberSubjectIds);
    return operation(
      this.store,
      token,
      this.clock(),
      "group.create",
      { ...v, displayLabel, memberSubjectIds: members },
      async (r, p) => {
        await self(r, p);
        await this.validateMembers(r, p.profileId, members);
        const g = {
          ownerProfileId: p.profileId,
          groupId: randomUUID(),
          displayLabel,
          currentVersion: 1,
        };
        await r.groups.insert(g);
        return {
          group: g,
          version: await versionGroup(r, p, g.groupId, members, this.clock()),
        };
      },
    );
  }
  async update(token: string, raw: unknown) {
    const v = object(raw, [
        "idempotencyKey",
        "groupId",
        "expectedGroupVersion",
        "memberSubjectIds",
      ]),
      gid = id(v.groupId),
      n = integer(v.expectedGroupVersion),
      members = this.members(v.memberSubjectIds);
    return operation(
      this.store,
      token,
      this.clock(),
      "group.update",
      { ...v, memberSubjectIds: members },
      async (r, p) => {
        const g = await this.active(r, p.profileId, gid);
        if (g.currentVersion !== n) fail("GROUP_VERSION_CONFLICT");
        await this.validateMembers(r, p.profileId, members);
        const previous =
          (await r.groups.version(p.profileId, gid, n)) ??
          fail("INTEGRITY_ERROR");
        return versionGroup(r, p, gid, members, this.clock(), previous);
      },
    );
  }
  async delete(token: string, raw: unknown) {
    const v = object(raw, ["idempotencyKey", "groupId"]),
      gid = id(v.groupId);
    return operation(
      this.store,
      token,
      this.clock(),
      "group.delete",
      v,
      async (r, p) => {
        await this.active(r, p.profileId, gid);
        await r.groups.close(p.profileId, gid, randomUUID());
        return { groupId: gid, closed: true };
      },
    );
  }
  private async active(r: Repositories, o: string, gid: string) {
    const g = await r.groups.find(o, gid);
    if (!g || (await r.groups.closed(o, gid))) fail("NOT_FOUND");
    return g;
  }
  async authorize(
    token: string,
    raw: unknown,
    requestId: string,
  ): Promise<GroupAuthorization> {
    const v = object(raw, [
        "idempotencyKey",
        "groupId",
        "expectedGroupVersion",
        "memberAuthorizations",
      ]),
      gid = id(v.groupId),
      n = integer(v.expectedGroupVersion);
    if (
      !Array.isArray(v.memberAuthorizations) ||
      v.memberAuthorizations.length < 2 ||
      v.memberAuthorizations.length > 5
    )
      fail("GROUP_EVALUATION_INCOMPLETE");
    const refs = (v.memberAuthorizations as unknown[])
      .map((x) => {
        const a = object(x, ["subjectId", "authorizationId"]);
        return {
          subjectId: id(a.subjectId),
          authorizationId: id(a.authorizationId),
        };
      })
      .sort((a, b) => a.subjectId.localeCompare(b.subjectId));
    if (new Set(refs.map((m) => m.subjectId)).size !== refs.length)
      fail("GROUP_MEMBER_DUPLICATE");
    return operation(
      this.store,
      token,
      this.clock(),
      "group.authorize",
      { ...v, memberAuthorizations: refs },
      async (r, p) => {
        const g = await this.active(r, p.profileId, gid);
        if (g.currentVersion !== n) fail("GROUP_VERSION_CONFLICT");
        const version =
          (await r.groups.version(p.profileId, gid, n)) ??
          fail("INTEGRITY_ERROR");
        checkHash(version);
        if (
          hash(refs.map((m) => m.subjectId)) !== hash(version.memberSubjectIds)
        )
          fail("GROUP_EVALUATION_INCOMPLETE");
        const members: MemberAuthorization[] = [];
        for (const ref of refs) {
          const s = await subject(r, p.profileId, ref.subjectId);
          if (s.subjectKind === "PROXY") {
            await permitted(r, s, "GROUP_EVALUATION", this.clock());
            await replayProxy(r, p.profileId, ref.authorizationId);
          }
          const e = await replayEvaluation(r, s, ref.authorizationId),
            base = member(s, e),
            state = await currentState(r, s);
          if (
            state.stateVersion !== base.stateVersion ||
            state.stateHash !== base.stateHash
          )
            fail("GROUP_MEMBER_STATE_STALE");
          // The recorded evidence-level authorization is stored once and never
          // changes; the member's own policy is applied on top, per group
          // authorization, and captured inside that group's result.
          const stored = await r.subjects.memberAuthorization(
            p.profileId,
            base.authorizationId,
          );
          if (stored && hash(stored) !== hash(base)) fail("INTEGRITY_ERROR");
          if (!stored) await r.subjects.authorization(p.profileId, base);
          members.push(await applyMemberPolicy(r, s, e, this.clock()));
        }
        const first = members[0];
        if (
          members.some(
            (m) =>
              m.candidate.id !== first.candidate.id ||
              m.candidate.type !== first.candidate.type ||
              m.contextHash !== first.contextHash,
          )
        )
          fail("GROUP_MEMBER_INPUT_MISMATCH");
        const result = sealGroup({
          schemaVersion: "group-authorization-v1" as const,
          authorizationId: randomUUID(),
          groupId: gid,
          groupVersion: n,
          policyId: version.policyId,
          candidate: first.candidate,
          context: first.context,
          contextHash: first.contextHash,
          memberResults: members,
          ...groupPolicy(members),
          createdAt: this.clock(),
          requestId,
          authorityBoundary: AUTHORITY_BOUNDARY,
        });
        await r.groups.insertAuthorization(p.profileId, result);
        return result;
      },
    );
  }
  async replay(token: string, raw: unknown) {
    const v = object(raw, ["authorizationId"]),
      aid = id(v.authorizationId);
    return this.store.transaction(async (r) => {
      const { profile } = await owner(r, token, this.clock()),
        o = profile.profileId;
      const captured =
        (await r.groups.authorization(o, aid)) ?? fail("NOT_FOUND");
      if (sealGroup(captured).semanticHash !== captured.semanticHash)
        fail("INTEGRITY_ERROR");
      const version =
        (await r.groups.version(o, captured.groupId, captured.groupVersion)) ??
        fail("INTEGRITY_ERROR");
      checkHash(version);
      const links = await r.groups.members(o, aid),
        members: MemberAuthorization[] = [],
        permissionActiveNow: Record<string, boolean> = {},
        policyChangedSince: Record<string, boolean> = {};
      for (const link of links) {
        const s = await subject(r, o, link.subjectId);
        if (s.subjectKind === "PROXY")
          await replayProxy(r, o, link.authorizationId);
        const e = await replayEvaluation(r, s, link.authorizationId),
          replayed = await replayMemberPolicy(r, s, e, link),
          m = replayed.member;
        if (hash(m) !== hash(link)) fail("INTEGRITY_ERROR");
        members.push(m);
        policyChangedSince[s.subjectId] =
          (link.policy?.version ?? null) !== replayed.currentPolicyVersion;
        try {
          if (s.subjectKind === "PROXY")
            await permitted(r, s, "GROUP_EVALUATION", this.clock());
          permissionActiveNow[s.subjectId] = true;
        } catch {
          permissionActiveNow[s.subjectId] = false;
        }
      }
      if (
        hash(members.map((m) => m.subjectId)) !== hash(version.memberSubjectIds)
      )
        fail("INTEGRITY_ERROR");
      const { semanticHash: ignored, ...body } = captured;
      void ignored;
      const expected = sealGroup({
        ...body,
        memberResults: members,
        ...groupPolicy(members),
      });
      if (hash(expected) !== hash(captured)) fail("INTEGRITY_ERROR");
      return {
        envelope: captured,
        source: "recorded" as const,
        permissionActiveNow,
        // The captured decision above is historical. These say whether the
        // member's rules have changed since, which a replay never applies.
        policyChangedSince,
      };
    });
  }
}

// Semantic identity excludes transport/issuance metadata; captured member references remain material.
function sealGroup<T extends Omit<GroupAuthorization, "semanticHash">>(
  value: T,
): T & { semanticHash: string } {
  const { authorizationId, createdAt, requestId, ...rest } = value;
  void authorizationId;
  void createdAt;
  void requestId;
  const material = { ...rest } as Record<string, unknown>;
  delete material.semanticHash;
  return { ...value, semanticHash: hash(material) };
}
