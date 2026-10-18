import "server-only";
import { ENTITY_TYPES, type EntityType } from "@/types/domain";
import { randomUUID } from "node:crypto";
import type { StateStore, Repositories } from "@/server/state/repositories";
import type { QlooProvider } from "@/server/qloo/contracts";
import type {
  TasteSubject,
  PermissionScope,
  ProxyAuthorization,
} from "@/lib/subjects/types";
import { AUTHORITY_BOUNDARY, PERMISSION_SCOPES } from "@/lib/subjects/types";
import { StateFailure } from "@/lib/state/types";
import { hash } from "@/server/state/hash";
import { stateHash } from "@/server/state/service";
import { evaluationInput } from "@/server/state/validation";
import { isResolvedProfile, snapshotEntity } from "@/server/taste/invariants";
import {
  evaluateStateSnapshot,
  persistStateEvaluation,
} from "@/server/state/evaluate-profile";
import {
  owner,
  self,
  subject,
  permitted,
  currentState,
  operation,
  signed,
  checkHash,
  member,
  replayEvaluation,
  object,
  id,
  label,
  integer,
  fail,
  writeAnchors,
  versionGroup,
} from "./common";
export class ProxyService {
  constructor(
    readonly store: StateStore,
    readonly clock = () => new Date().toISOString(),
  ) {}
  async resolve(token: string, raw: unknown, factory: () => QlooProvider) {
    const v = object(raw, ["query", "expectedType"]);
    if (
      typeof v.query !== "string" ||
      !v.query.trim() ||
      v.query.length > 120 ||
      !ENTITY_TYPES.includes(v.expectedType as EntityType)
    )
      fail("INVALID_INPUT");
    return this.store.transaction(async (r) => {
      const { session } = await owner(r, token, this.clock());
      if (session.mutations >= 100) throw new StateFailure("RATE_LIMITED");
      await r.sessions.consume(session.tokenHash);
      try {
        return await factory().resolve({
          query: (v.query as string).trim(),
          expectedType: v.expectedType as EntityType,
        });
      } catch {
        fail("PROVIDER_UNAVAILABLE");
      }
    });
  }
  async inspect(token: string) {
    return this.store.transaction(async (r) => {
      const { profile } = await owner(r, token, this.clock());
      await self(r, profile);
      return Promise.all(
        (await r.subjects.list(profile.profileId)).map(async (s) => {
          const events = await r.subjects.events(
              profile.profileId,
              s.subjectId,
            ),
            deleted = events.some((e) => e.kind === "PROXY_DELETED");
          return {
            subject: deleted ? { ...s, displayLabel: "Deleted proxy" } : s,
            deleted,
            permission: await r.subjects.permission(
              profile.profileId,
              s.subjectId,
            ),
            permissionActive:
              s.subjectKind === "SELF" ||
              (!events.length && s.expiresAt > this.clock()),
            state: deleted ? null : await currentState(r, s),
          };
        }),
      );
    });
  }
  async create(
    token: string,
    raw: unknown,
    factory: () => QlooProvider,
    requestId: string,
  ) {
    const v = object(raw, [
      "idempotencyKey",
      "displayLabel",
      "signalIds",
      "identityReviewed",
      "permissionAttested",
      "scopes",
      "expiresAt",
    ]);
    const displayLabel = label(v.displayLabel);
    if (
      v.identityReviewed !== true ||
      v.permissionAttested !== true ||
      !Array.isArray(v.signalIds) ||
      v.signalIds.length !== 5 ||
      !Array.isArray(v.scopes) ||
      v.scopes.some((s) => !PERMISSION_SCOPES.includes(s as PermissionScope)) ||
      new Set(v.scopes).size !== v.scopes.length ||
      !v.scopes.includes("MODEL_MANAGEMENT") ||
      !v.scopes.includes("TASTE_EVALUATION")
    )
      fail("INVALID_INPUT");
    const ids = (v.signalIds as unknown[]).map(id);
    if (new Set(ids).size !== 5) fail("INVALID_INPUT");
    return operation(
      this.store,
      token,
      this.clock(),
      "proxy.create",
      {
        ...v,
        displayLabel,
        signalIds: [...ids].sort(),
        scopes: [...(v.scopes as PermissionScope[])].sort(),
      },
      async (r, p) => {
        const now = this.clock();
        const expiresAt =
          v.expiresAt === undefined
            ? p.expiresAt
            : typeof v.expiresAt === "string" &&
                Number.isFinite(Date.parse(v.expiresAt))
              ? new Date(v.expiresAt).toISOString()
              : fail("INVALID_INPUT");
        if (expiresAt <= now || expiresAt > p.expiresAt) fail("INVALID_INPUT");
        const anchors = await this.anchors(factory, ids);
        const s: TasteSubject = {
          ownerProfileId: p.profileId,
          subjectId: randomUUID(),
          subjectKind: "PROXY",
          stateProfileId: randomUUID(),
          displayLabel,
          createdAt: now,
          expiresAt,
        };
        await r.states.create({
          profileId: s.stateProfileId,
          currentStateVersion: 0,
          status: "TEMPORARY",
          createdAt: now,
          // Audit retention follows owner expiry; permission may end earlier.
          expiresAt: p.expiresAt,
        });
        await r.states.insertVersion({
          profileId: s.stateProfileId,
          stateVersion: 0,
          parentVersion: null,
          mutationId: null,
          createdAt: now,
          stateHash: stateHash([]),
          entries: [],
        });
        await r.subjects.insert(s);
        const permission = {
          ownerProfileId: p.profileId,
          subjectId: s.subjectId,
          attestationId: randomUUID(),
          assuranceLevel: "USER_ATTESTED_PERMISSION" as const,
          scopes: [...(v.scopes as PermissionScope[])].sort(),
          attestedAt: now,
          expiresAt,
          provenance: "DELEGATE_ATTESTED" as const,
          requestId,
        };
        await r.subjects.grant(permission);
        const state = await writeAnchors(
          r,
          s,
          anchors,
          now,
          permission.attestationId,
          "create",
        );
        return { subject: s, permission, state };
      },
    );
  }
  private async anchors(factory: () => QlooProvider, ids: string[]) {
    let result;
    try {
      result = await factory().entities(ids);
    } catch {
      fail("PROVIDER_UNAVAILABLE");
    }
    if (result.status !== "available") fail("PROVIDER_UNAVAILABLE");
    if (
      !isResolvedProfile(result.data) ||
      hash(result.data.map((e) => e.id).sort()) !== hash([...ids].sort())
    )
      fail("PROXY_MODEL_INSUFFICIENT");
    return result.data.map(snapshotEntity);
  }
  async update(token: string, raw: unknown, factory: () => QlooProvider) {
    const v = object(raw, [
        "idempotencyKey",
        "subjectId",
        "expectedStateVersion",
        "replaceEntityId",
        "replacementEntityId",
        "identityReviewed",
      ]),
      sid = id(v.subjectId),
      n = integer(v.expectedStateVersion),
      old = id(v.replaceEntityId),
      replacement = id(v.replacementEntityId);
    if (v.identityReviewed !== true) fail("INVALID_INPUT");
    return operation(
      this.store,
      token,
      this.clock(),
      "proxy.update",
      {
        ...v,
        subjectId: sid,
        replaceEntityId: old,
        replacementEntityId: replacement,
      },
      async (r, p) => {
        const s = await subject(r, p.profileId, sid);
        if (s.subjectKind !== "PROXY") fail("NOT_FOUND");
        const permission = await permitted(
            r,
            s,
            "MODEL_MANAGEMENT",
            this.clock(),
          ),
          state = await currentState(r, s);
        if (state.stateVersion !== n)
          throw new StateFailure("STATE_VERSION_CONFLICT");
        const ids = state.entries
          .filter((e) => e.kind === "EXPLICIT_LIKE")
          .map((e) => e.entity!.id);
        if (ids.length !== 5 || !ids.includes(old) || ids.includes(replacement))
          fail("INVALID_INPUT");
        const anchors = await this.anchors(
          factory,
          ids.map((i) => (i === old ? replacement : i)),
        );
        return writeAnchors(
          r,
          s,
          anchors,
          this.clock(),
          permission.attestationId,
          `update-${randomUUID()}`,
          state,
        );
      },
    );
  }
  async revoke(
    token: string,
    raw: unknown,
    requestId: string,
    deleted = false,
  ) {
    const v = object(raw, ["idempotencyKey", "subjectId"]),
      sid = id(v.subjectId);
    return operation(
      this.store,
      token,
      this.clock(),
      deleted ? "proxy.delete" : "proxy.revoke",
      v,
      async (r, p) => {
        const s = await subject(r, p.profileId, sid);
        if (s.subjectKind !== "PROXY") fail("NOT_FOUND");
        const permission =
            (await r.subjects.permission(p.profileId, sid)) ??
            fail("INTEGRITY_ERROR"),
          kind = deleted
            ? ("PROXY_DELETED" as const)
            : ("PERMISSION_REVOKED" as const);
        if (
          !(await r.subjects.events(p.profileId, sid)).some(
            (e) => e.kind === kind,
          )
        )
          await r.subjects.event({
            ownerProfileId: p.profileId,
            subjectId: sid,
            eventId: randomUUID(),
            attestationId: permission.attestationId,
            kind,
            createdAt: this.clock(),
            requestId,
          });
        if (deleted)
          for (const g of await r.groups.list(p.profileId)) {
            if (await r.groups.closed(p.profileId, g.groupId)) continue;
            const current =
              (await r.groups.version(
                p.profileId,
                g.groupId,
                g.currentVersion,
              )) ?? fail("INTEGRITY_ERROR");
            if (!current.memberSubjectIds.includes(sid)) continue;
            const remaining = current.memberSubjectIds.filter((i) => i !== sid);
            if (remaining.length < 2)
              await r.groups.close(p.profileId, g.groupId, randomUUID());
            else
              await versionGroup(
                r,
                p,
                g.groupId,
                remaining,
                this.clock(),
                current,
              );
          }
        return { subjectId: sid, event: kind };
      },
    );
  }
  async evaluate(
    token: string,
    raw: unknown,
    factory: () => QlooProvider,
    requestId: string,
  ): Promise<ProxyAuthorization> {
    const v = object(raw, ["idempotencyKey", "subjectId", "proposal"]),
      sid = id(v.subjectId),
      input = evaluationInput(v.proposal);
    if (!input) fail("INVALID_INPUT");
    return operation(
      this.store,
      token,
      this.clock(),
      "proxy.evaluate",
      { ...v, subjectId: sid, proposal: input },
      async (r, p) => {
        const s = await subject(r, p.profileId, sid);
        if (s.subjectKind !== "PROXY") fail("NOT_FOUND");
        const permission = await permitted(
            r,
            s,
            "TASTE_EVALUATION",
            this.clock(),
          ),
          state = await currentState(r, s);
        if (state.stateVersion !== input.expectedStateVersion)
          throw new StateFailure("STATE_VERSION_CONFLICT");
        if (
          !isResolvedProfile(
            state.entries
              .filter((e) => e.kind === "EXPLICIT_LIKE")
              .map((e) => e.entity),
          )
        )
          fail("PROXY_MODEL_INSUFFICIENT");
        const provenance =
          (await r.subjects.anchorProvenance(
            p.profileId,
            sid,
            state.stateVersion,
          )) ?? fail("INTEGRITY_ERROR");
        const evaluation = await evaluateStateSnapshot(
          state,
          input,
          factory,
          requestId,
          this.clock(),
        );
        await persistStateEvaluation(r, state, evaluation);
        const wrapper = signed({
          schemaVersion: "proxy-authorization-v1" as const,
          authorizationId: evaluation.evaluationId,
          subjectId: sid,
          subjectKind: "PROXY" as const,
          permissionAttestationId: permission.attestationId,
          permissionAssurance: "USER_ATTESTED_PERMISSION" as const,
          provenance,
          stateVersion: state.stateVersion,
          stateHash: state.stateHash,
          baseEvaluation: evaluation,
          authorityBoundary: AUTHORITY_BOUNDARY,
          createdAt: evaluation.evaluatedAt,
        });
        await r.subjects.authorization(p.profileId, member(s, evaluation));
        await r.subjects.insertProxy(p.profileId, wrapper);
        return wrapper;
      },
    );
  }
  async replay(token: string, raw: unknown) {
    const v = object(raw, ["authorizationId"]),
      aid = id(v.authorizationId);
    return this.store.transaction(async (r) => {
      const { profile } = await owner(r, token, this.clock());
      const wrapper = await replayProxy(r, profile.profileId, aid);
      const s = await subject(r, profile.profileId, wrapper.subjectId);
      let permissionActiveNow = true;
      try {
        await permitted(r, s, "TASTE_EVALUATION", this.clock());
      } catch {
        permissionActiveNow = false;
      }
      return { wrapper, source: "recorded" as const, permissionActiveNow };
    });
  }
}
export async function replayProxy(r: Repositories, o: string, aid: string) {
  const w = (await r.subjects.proxy(o, aid)) ?? fail("NOT_FOUND");
  checkHash(w);
  const s = await subject(r, o, w.subjectId),
    e = await replayEvaluation(r, s, aid),
    provenance = await r.subjects.anchorProvenance(
      o,
      w.subjectId,
      w.stateVersion,
    ),
    permission = await r.subjects.permission(o, w.subjectId);
  const state = await r.states.version(s.stateProfileId, w.stateVersion);
  if (
    !state ||
    !provenance ||
    !permission ||
    provenance.stateProfileId !== s.stateProfileId ||
    provenance.attestationId !== permission.attestationId ||
    provenance.source !== "DELEGATE_ATTESTED" ||
    hash(provenance.signalIds) !==
      hash(
        state.entries
          .filter((x) => x.kind === "EXPLICIT_LIKE")
          .map((x) => x.signalId)
          .sort(),
      )
  )
    fail("INTEGRITY_ERROR");
  if (
    e.cultural.status === "available" &&
    hash([...e.cultural.data.qlooEvidence.provenance.signalIds].sort()) !==
      hash(
        state.entries
          .filter((x) => x.kind === "EXPLICIT_LIKE")
          .map((x) => x.entity!.id)
          .sort(),
      )
  )
    fail("INTEGRITY_ERROR");
  if (
    s.subjectKind !== "PROXY" ||
    hash(e) !== hash(w.baseEvaluation) ||
    e.stateHash !== w.stateHash ||
    e.stateVersion !== w.stateVersion ||
    hash(provenance) !== hash(w.provenance) ||
    permission?.attestationId !== w.permissionAttestationId ||
    e.evaluatedAt >= permission.expiresAt ||
    e.evaluatedAt < permission.attestedAt ||
    w.authorityBoundary !== AUTHORITY_BOUNDARY ||
    w.subjectKind !== "PROXY" ||
    w.permissionAssurance !== "USER_ATTESTED_PERMISSION"
  )
    fail("INTEGRITY_ERROR");
  return w;
}
