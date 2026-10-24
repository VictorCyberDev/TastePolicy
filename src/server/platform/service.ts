import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { StateStore, Repositories } from "@/server/state/repositories";
import type {
  Principal,
  PassportRecord,
  Grant,
  ShareScope,
  KeyScope,
  Credential,
  PlatformEvaluation,
} from "@/lib/platform/types";
import {
  platformFail as fail,
  KEY_SCOPES,
  SHARE_SCOPES,
} from "@/lib/platform/types";
import { object, id, label, key, integer } from "@/server/subjects/common";
import { hash } from "@/server/state/hash";
import { stateHash } from "@/server/state/service";
import { evaluationInput } from "@/server/state/validation";
import { isResolvedProfile, snapshotEntity } from "@/server/taste/invariants";
import {
  evaluateStateSnapshot,
  persistStateEvaluation,
} from "@/server/state/evaluate-profile";
import { replayEvaluation } from "@/server/subjects/common";
import type { QlooProvider } from "@/server/qloo/contracts";
import { AUTHORITY_BOUNDARY } from "@/lib/subjects/types";
const ref = () => "tp_" + randomBytes(24).toString("hex");
function reference(v: unknown): string {
  if (typeof v !== "string" || !/^tp_[a-f0-9]{48}$/.test(v))
    fail("INVALID_INPUT");
  return v;
}
const DAY = 86400000;
function scopes<T extends string>(v: unknown, allow: readonly T[]): T[] {
  if (
    !Array.isArray(v) ||
    !v.length ||
    v.length > allow.length ||
    v.some((x) => !allow.includes(x)) ||
    new Set(v).size !== v.length
  )
    fail("INVALID_INPUT");
  return [...v].sort() as T[];
}
function grantSummary(g: Grant) {
  const { profileId, ...summary } = g;
  void profileId;
  return summary;
}
export function continuation(
  decision: import("@/lib/state/types").StateDecision["outcome"],
) {
  const actions = {
    ALLOW: ["recommend", "add_to_draft"],
    ASK: ["request_clarification"],
    REJECT: ["do_not_proceed", "offer_repair"],
    UNAVAILABLE: ["do_not_assume_negative_preference"],
  };
  return {
    schemaVersion: "taste-continuation-v1",
    permitted: actions[decision],
    automaticRetry: false,
    authorityBoundary: AUTHORITY_BOUNDARY,
  };
}
export class PlatformService {
  constructor(
    readonly store: StateStore,
    readonly clock = () => new Date().toISOString(),
  ) {}
  private expiry(v: unknown, limit?: string) {
    if (typeof v !== "string" || !Number.isFinite(Date.parse(v)))
      fail("INVALID_INPUT");
    const e = new Date(v).toISOString();
    if (
      e <= this.clock() ||
      Date.parse(e) > Date.parse(this.clock()) + 30 * DAY ||
      (limit && e > limit)
    )
      fail("INVALID_INPUT");
    return e;
  }
  private async authority(
    r: Repositories,
    p: Principal,
    required?: KeyScope,
    fresh = false,
  ) {
    if (!(await r.platform.user(p.userId))) fail("AUTH_REQUIRED");
    if (p.kind === "SESSION") {
      if (
        !p.sessionId ||
        !(await r.platform.sessionActive(p.userId, p.sessionId, this.clock()))
      )
        fail("AUTH_REQUIRED");
      if (
        fresh &&
        Date.parse(p.authenticatedAt) < Date.parse(this.clock()) - 300000
      )
        fail("RECENT_AUTH_REQUIRED");
    } else {
      if (fresh) fail("ACCESS_DENIED");
      const c =
        p.credentialId && p.credentialHash
          ? await r.platform.findCredential(p.credentialId, p.credentialHash)
          : null;
      if (!c || c.userId !== p.userId) fail("AUTH_REQUIRED");
      if (await r.platform.credentialRevoked(c.credentialId))
        fail("CREDENTIAL_REVOKED");
      if (c.expiresAt <= this.clock()) fail("CREDENTIAL_EXPIRED");
      if (required && !c.scopes.includes(required)) fail("ACCESS_DENIED");
    }
  }
  private async locked(
    r: Repositories,
    p: Principal,
    users: string[],
    required?: KeyScope,
    fresh = false,
  ) {
    for (const u of [...new Set([p.userId, ...users])].sort())
      if (!(await r.platform.user(u, true))) fail("AUTH_REQUIRED");
    await this.authority(r, p, required, fresh);
  }
  private async op<T>(
    p: Principal,
    op: string,
    input: Record<string, unknown>,
    work: (r: Repositories) => Promise<T>,
    fresh = true,
  ): Promise<T> {
    const k = key(input.idempotencyKey),
      h = hash(input);
    return this.store.transaction(async (r) => {
      await this.locked(r, p, [], undefined, fresh);
      const old = await r.platform.op(p.userId, op, k);
      if (old) {
        if (old.hash !== h) fail("IDEMPOTENCY_KEY_CONFLICT");
        return old.result as T;
      }
      const result = await work(r);
      if (op !== "account.delete")
        await r.platform.saveOp(p.userId, op, k, h, result);
      return result;
    });
  }
  // `surface` limits where an OAuth-linked token may be used: it is audience
  // bound to the MCP endpoint, so REST and A2A refuse it (developer keys work
  // everywhere).
  async credentialPrincipal(
    raw: string,
    surface: "rest" | "mcp" | "a2a" = "rest",
  ): Promise<Principal> {
    const match =
      /^tp_live_([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.([A-Za-z0-9_-]{43})$/.exec(
        raw,
      );
    if (!match) fail("AUTH_REQUIRED");
    return this.store.transaction(async (r) => {
      const c = await r.platform.findCredential(match[1], hash(raw));
      if (!c) fail("AUTH_REQUIRED");
      const p: Principal = {
        userId: c.userId,
        kind: "CREDENTIAL",
        credentialId: c.credentialId,
        credentialHash: hash(raw),
        scopes: c.scopes,
        authenticatedAt: c.createdAt,
        ...(c.oauth ? { oauth: c.oauth } : {}),
      };
      if (c.oauth && surface !== "mcp") fail("ACCESS_DENIED");
      await this.locked(r, p, []);
      if (
        !(await r.platform.rate(
          p.userId,
          "api:" + this.clock().slice(0, 16),
          30,
        ))
      )
        fail("RATE_LIMITED");
      return p;
    });
  }
  async initialize(p: Principal, raw: unknown, factory: () => QlooProvider) {
    const v = object(raw, [
        "idempotencyKey",
        "displayLabel",
        "signalIds",
        "identitiesReviewed",
      ]),
      displayLabel = label(v.displayLabel);
    if (
      v.identitiesReviewed !== true ||
      !Array.isArray(v.signalIds) ||
      v.signalIds.length !== 5
    )
      fail("INVALID_INPUT");
    const ids = (v.signalIds as unknown[]).map(id).sort();
    if (new Set(ids).size !== 5) fail("INVALID_INPUT");
    const input = { ...v, displayLabel, signalIds: ids },
      k = key(v.idempotencyKey),
      h = hash(input);
    // Phase 1 (short transaction): is this caller allowed, is it a replay, is the
    // account free. Nothing is held while the provider is called.
    const replayed = await this.store.transaction(async (r) => {
      await this.locked(r, p, [], undefined, true);
      const old = await r.platform.op(p.userId, "passport.create", k);
      if (old) {
        if (old.hash !== h) fail("IDEMPOTENCY_KEY_CONFLICT");
        return true;
      }
      if (await r.platform.owned(p.userId)) fail("STATE_VERSION_CONFLICT");
      return false;
    });
    // Phase 2: the provider call, outside any transaction or lock. A replay
    // needs none: the stored result is returned by the operation below.
    let result: Awaited<
      ReturnType<ReturnType<typeof factory>["entities"]>
    > | null = null;
    if (!replayed)
      try {
        result = await factory().entities(ids);
      } catch {
        fail("PROVIDER_UNAVAILABLE");
      }
    // Phase 3: everything is re-validated and written in one transaction.
    return this.op(p, "passport.create", input, async (r) => {
      if (await r.platform.owned(p.userId)) fail("STATE_VERSION_CONFLICT");
      const found = result;
      if (!found || found.status !== "available") fail("PROVIDER_UNAVAILABLE");
      if (
        !isResolvedProfile(found.data) ||
        hash(found.data.map((e) => e.id).sort()) !== hash(ids)
      )
        fail("INVALID_INPUT");
      const now = this.clock(),
        profileId = randomUUID(),
        expiresAt = new Date(Date.parse(now) + 30 * DAY).toISOString();
      await r.states.create({
        profileId,
        currentStateVersion: 0,
        status: "TEMPORARY",
        createdAt: now,
        expiresAt,
      });
      await r.states.insertVersion({
        profileId,
        stateVersion: 0,
        parentVersion: null,
        mutationId: null,
        entries: [],
        stateHash: stateHash([]),
        createdAt: now,
      });
      const mutationId = randomUUID(),
        entries = found.data.map(snapshotEntity).map((entity) => ({
          signalId: randomUUID(),
          kind: "EXPLICIT_LIKE" as const,
          entity,
          scope: "GLOBAL_PREFERENCE" as const,
          persistence: "DURABLE" as const,
          source: "USER" as const,
          sourceEventId: mutationId,
          createdAt: now,
        }));
      const state = {
        profileId,
        stateVersion: 1,
        parentVersion: 0,
        mutationId,
        entries,
        stateHash: stateHash(entries),
        createdAt: now,
      };
      await r.states.insertVersion(state);
      await r.mutations.insert({
        profileId,
        key: "account-initialize",
        payloadHash: hash(ids),
        result: { state, mutationId },
      });
      await r.states.advance(profileId, 1);
      const passport: PassportRecord = {
        subjectRef: `tps_${randomBytes(24).toString("hex")}`,
        passportRef: ref(),
        userId: p.userId,
        profileId,
        version: 1,
        stateVersion: state.stateVersion,
        stateHash: state.stateHash,
        displayLabel,
        visibility: "PRIVATE",
        createdAt: now,
        expiresAt,
      };
      await r.platform.insertPassport(passport);
      return this.summary(r, passport);
    });
  }
  private async summary(r: Repositories, p: PassportRecord) {
    const profile = await r.states.profile(p.profileId);
    if (!profile) fail("PASSPORT_NOT_FOUND");
    const state = await r.states.version(
      p.profileId,
      profile.currentStateVersion,
    );
    if (!state) fail("INTEGRITY_ERROR");
    const material = {
      schemaVersion: "taste-passport-v1",
      status: p.expiresAt <= this.clock() ? "EXPIRED" : "ACTIVE",
      expiresAt: p.expiresAt,
      subjectRef: p.subjectRef,
      passportVersion: p.version,
      displayLabel: p.displayLabel,
      visibility: p.visibility,
      stateVersion: state.stateVersion,
      stateHash: state.stateHash,
      provenance: "EXPLICIT_USER_REVIEWED",
      supportedCapabilities: ["PREFERENCE_AUTHORIZATION", "CAPTURED_REPLAY"],
      supportedActions: ["SELECT_ENTITY"],
      supportedCandidateDomains: ["brand", "place", "destination"],
    };
    return {
      ...material,
      passportRef: p.passportRef,
      createdAt: p.createdAt,
      expiresAt: p.expiresAt,
      semanticHash: hash(material),
    };
  }
  private async access(
    r: Repositories,
    p: Principal,
    passportRef: string,
    grantId: unknown,
    scope: ShareScope,
    keyScope: KeyScope,
  ) {
    let passport = await r.platform.passport(passportRef);
    if (!passport) fail("PASSPORT_NOT_FOUND");
    await this.locked(r, p, [passport.userId], keyScope);
    passport = await r.platform.passport(passportRef);
    if (!passport || passport.expiresAt <= this.clock())
      fail("PASSPORT_NOT_FOUND");
    let grant: Grant | null = null;
    if (passport.userId !== p.userId) {
      if (!grantId) fail("GRANT_REQUIRED");
      grant = await r.platform.getGrant(id(grantId));
      if (
        !grant ||
        grant.passportRef !== passportRef ||
        grant.granteeUserId !== p.userId
      )
        fail("ACCESS_DENIED");
      if (await r.platform.grantRevoked(grant.grantId)) fail("GRANT_REVOKED");
      if (grant.expiresAt <= this.clock()) fail("GRANT_EXPIRED");
      if (!grant.scopes.includes(scope)) fail("ACCESS_DENIED");
    }
    return { passport, grant };
  }
  async read(p: Principal, raw: unknown) {
    const v = object(raw, ["passportRef", "grantId", "stateSummary"]),
      pr = reference(v.passportRef);
    if (v.stateSummary !== undefined && typeof v.stateSummary !== "boolean")
      fail("INVALID_INPUT");
    return this.store.transaction(async (r) => {
      const { passport } = await this.access(
        r,
        p,
        pr,
        v.grantId,
        v.stateSummary ? "READ_STATE_SUMMARY" : "READ_PASSPORT_SUMMARY",
        "PASSPORT_READ",
      );
      const summary = await this.summary(r, passport);
      if (!v.stateSummary) return summary;
      const state = await r.states.version(
        passport.profileId,
        summary.stateVersion,
      );
      return {
        ...summary,
        stateSummary: {
          entryCounts: Object.fromEntries(
            [
              "EXPLICIT_LIKE",
              "CONSTRAINT",
              "DURABLE_FEEDBACK",
              "CONTEXTUAL_PREFERENCE",
              "EXPLORATION_INTENT",
            ].map((k) => [
              k,
              state!.entries.filter((e) => e.kind === k).length,
            ]),
          ),
        },
      };
    });
  }
  async inspect(p: Principal) {
    return this.store.transaction(async (r) => {
      await this.locked(r, p, []);
      if (p.kind !== "SESSION") fail("ACCESS_DENIED");
      const passport = await r.platform.owned(p.userId),
        grants = await r.platform.grants(p.userId),
        credentials = (await r.platform.credentials(p.userId)).filter(
          (c) => !c.oauth,
        );
      return {
        mode: "AUTHENTICATED_ACCOUNT",
        userId: p.userId,
        passport: passport ? await this.summary(r, passport) : null,
        grants: await Promise.all(
          grants.map(async (g) => ({
            ...grantSummary(g),
            revoked: await r.platform.grantRevoked(g.grantId),
          })),
        ),
        credentials: await Promise.all(
          credentials.map(async (c) => ({
            ...c,
            revoked: await r.platform.credentialRevoked(c.credentialId),
          })),
        ),
      };
    });
  }
  async update(p: Principal, raw: unknown) {
    const v = object(raw, [
        "idempotencyKey",
        "passportRef",
        "expectedPassportVersion",
        "displayLabel",
      ]),
      pr = reference(v.passportRef),
      n = integer(v.expectedPassportVersion),
      displayLabel = label(v.displayLabel);
    return this.op(p, "passport.update", { ...v, displayLabel }, async (r) => {
      const { passport } = await this.access(
        r,
        p,
        pr,
        undefined,
        "READ_PASSPORT_SUMMARY",
        "PASSPORT_READ",
      );
      if (passport.userId !== p.userId) fail("ACCESS_DENIED");
      if (passport.version !== n) fail("STATE_VERSION_CONFLICT");
      const current = await this.summary(r, passport);
      const next = {
        ...passport,
        displayLabel,
        version: n + 1,
        stateVersion: current.stateVersion,
        stateHash: current.stateHash,
      };
      await r.platform.updatePassport(next);
      return this.summary(r, next);
    });
  }
  async grant(p: Principal, raw: unknown) {
    const v = object(raw, [
        "idempotencyKey",
        "passportRef",
        "granteeUserId",
        "scopes",
        "purpose",
        "expiresAt",
      ]),
      pr = reference(v.passportRef),
      grantee = id(v.granteeUserId),
      s = scopes(v.scopes, SHARE_SCOPES),
      purpose = label(v.purpose);
    return this.op(
      p,
      "grant.create",
      { ...v, scopes: s, purpose },
      async (r) => {
        const passport = await r.platform.passport(pr);
        if (!passport || passport.userId !== p.userId)
          fail("PASSPORT_NOT_FOUND");
        if (grantee === p.userId || !(await r.platform.user(grantee)))
          fail("INVALID_INPUT");
        const g: Grant = {
          schemaVersion: "taste-passport-grant-v1",
          grantId: randomUUID(),
          grantorUserId: p.userId,
          granteeUserId: grantee,
          passportRef: pr,
          profileId: passport.profileId,
          scopes: s,
          purpose,
          issuedAt: this.clock(),
          expiresAt: this.expiry(v.expiresAt, passport.expiresAt),
          assurance: "AUTHENTICATED_GRANTOR_CONSENT",
        };
        await r.platform.grant(g);
        if (passport.visibility === "PRIVATE") {
          const current = await this.summary(r, passport);
          await r.platform.updatePassport({
            ...passport,
            version: passport.version + 1,
            visibility: "SHARED_BY_GRANT",
            stateVersion: current.stateVersion,
            stateHash: current.stateHash,
          });
        }
        return grantSummary(g);
      },
    );
  }
  async revokeGrant(p: Principal, raw: unknown) {
    const v = object(raw, ["idempotencyKey", "grantId"]),
      gid = id(v.grantId);
    return this.op(p, "grant.revoke", v, async (r) => {
      const g = await r.platform.getGrant(gid);
      if (!g || g.grantorUserId !== p.userId) fail("ACCESS_DENIED");
      await r.platform.revokeGrant(g, this.clock());
      return { grantId: gid, revoked: true };
    });
  }
  async issueKey(
    p: Principal,
    raw: unknown,
    rotate = false,
  ): Promise<{
    credential: Credential;
    secret?: string;
    oneTimeSecretUnavailable?: boolean;
  }> {
    const v = object(raw, [
        "idempotencyKey",
        "displayLabel",
        "scopes",
        "expiresAt",
        ...(rotate ? ["credentialId"] : []),
      ]),
      s = scopes(v.scopes, KEY_SCOPES),
      displayLabel = label(v.displayLabel);
    let secret: string | undefined;
    const credential = await this.op(
      p,
      rotate ? "key.rotate" : "key.create",
      { ...v, scopes: s, displayLabel },
      async (r) => {
        if (rotate) {
          const old = (await r.platform.credentials(p.userId)).find(
            (c) => c.credentialId === id(v.credentialId),
          );
          if (!old) fail("ACCESS_DENIED");
          if (await r.platform.credentialRevoked(old.credentialId))
            fail("CREDENTIAL_REVOKED");
          await r.platform.revokeCredential(old, this.clock());
        }
        const c: Credential = {
          credentialId: randomUUID(),
          userId: p.userId,
          displayLabel,
          scopes: s,
          createdAt: this.clock(),
          expiresAt: this.expiry(v.expiresAt),
        };
        secret = `tp_live_${c.credentialId}.${randomBytes(32).toString("base64url")}`;
        await r.platform.credential(c, hash(secret));
        return c;
      },
    );
    return {
      credential,
      ...(secret ? { secret } : { oneTimeSecretUnavailable: true }),
    };
  }
  async revokeKey(p: Principal, raw: unknown) {
    const v = object(raw, ["idempotencyKey", "credentialId"]),
      cid = id(v.credentialId);
    return this.op(p, "key.revoke", v, async (r) => {
      const c = (await r.platform.credentials(p.userId)).find(
        (k) => k.credentialId === cid,
      );
      if (!c) fail("ACCESS_DENIED");
      await r.platform.revokeCredential(c, this.clock());
      return { credentialId: cid, revoked: true };
    });
  }
  private response(e: PlatformEvaluation, subjectRef: string) {
    return {
      schemaVersion: "taste-authorization-response-v1",
      subjectRef,
      evaluationRef: e.evaluationRef,
      passportRef: e.passportRef,
      stateVersion: e.stateVersion,
      stateHash: e.stateHash,
      decision: e.evaluation.decision.outcome,
      decisionBasis: e.evaluation.decision.basis,
      unresolvedFactors:
        e.evaluation.decision.outcome === "ASK"
          ? e.evaluation.decision.rules
          : [],
      receiptRef: e.evaluationRef,
      status: "COMPLETED",
      continuation: continuation(e.evaluation.decision.outcome),
      createdAt: e.evaluation.evaluatedAt,
    };
  }
  async evaluate(
    p: Principal,
    raw: unknown,
    factory: () => QlooProvider,
    requestId: string,
  ) {
    const v = object(raw, [
        "idempotencyKey",
        "passportRef",
        "grantId",
        "proposal",
      ]),
      pr = reference(v.passportRef),
      input = evaluationInput(v.proposal),
      k = key(v.idempotencyKey);
    if (!input) fail("INVALID_INPUT");
    const h = hash({ ...v, proposal: input });
    const authorize = (r: Repositories) =>
      this.access(
        r,
        p,
        pr,
        v.grantId,
        "EVALUATE_TASTE_ACTION",
        "TASTE_EVALUATE",
      );
    // Phase 1 (short transaction): authority, replay, quota, and the state the
    // answer will be about. No lock outlives it.
    const pre = await this.store.transaction(async (r) => {
      const { passport } = await authorize(r);
      const old = await r.platform.op(p.userId, "evaluate", k);
      if (old) {
        if (old.hash !== h) fail("IDEMPOTENCY_KEY_CONFLICT");
        return { replay: old.result };
      }
      if (
        !(await r.platform.rate(
          passport.userId,
          "evaluation:" + this.clock().slice(0, 10),
          100,
        ))
      )
        fail("RATE_LIMITED");
      const profile = await r.states.profile(passport.profileId),
        state = profile
          ? await r.states.version(
              profile.profileId,
              profile.currentStateVersion,
            )
          : null;
      if (!state) fail("PASSPORT_NOT_FOUND");
      if (state.stateVersion !== input.expectedStateVersion)
        fail("STATE_VERSION_CONFLICT");
      return { state };
    });
    if ("replay" in pre)
      return pre.replay as ReturnType<PlatformService["response"]>;
    // Phase 2: the cultural provider (slow, up to several calls) runs with no
    // transaction, no row lock and no pooled connection held.
    const evaluation = await evaluateStateSnapshot(
      pre.state,
      input,
      factory,
      requestId,
      this.clock(),
    );
    // Phase 3: authority, state and idempotency are checked again against what
    // is true now. An answer computed on a state that has since moved, or for a
    // grant that has since ended, is discarded, never committed.
    return this.store.transaction(async (r) => {
      const { passport, grant } = await authorize(r);
      const old = await r.platform.op(p.userId, "evaluate", k);
      if (old) {
        if (old.hash !== h) fail("IDEMPOTENCY_KEY_CONFLICT");
        return old.result as ReturnType<PlatformService["response"]>;
      }
      const profile = await r.states.profile(passport.profileId, true),
        state = profile
          ? await r.states.version(
              profile.profileId,
              profile.currentStateVersion,
            )
          : null;
      if (
        !state ||
        state.stateVersion !== pre.state.stateVersion ||
        state.stateHash !== pre.state.stateHash
      )
        fail("STATE_VERSION_CONFLICT");
      await persistStateEvaluation(r, state, evaluation);
      const e: PlatformEvaluation = {
        evaluationRef: ref(),
        passportRef: pr,
        userId: passport.userId,
        actorId: p.userId,
        grantId: grant?.grantId ?? null,
        stateProfileId: state.profileId,
        stateVersion: state.stateVersion,
        stateHash: state.stateHash,
        evaluation,
      };
      await r.platform.evaluation(e);
      const response = this.response(e, passport.subjectRef);
      await r.platform.saveOp(p.userId, "evaluate", k, h, response);
      return response;
    });
  }
  async receipt(p: Principal, raw: unknown, statusOnly = false) {
    const v = object(raw, ["evaluationRef"]),
      er = reference(v.evaluationRef);
    return this.store.transaction(async (r) => {
      const e = await r.platform.getEvaluation(er);
      if (!e) fail("PASSPORT_NOT_FOUND");
      const { passport } = await this.access(
        r,
        p,
        e.passportRef,
        e.grantId,
        "READ_RECEIPT",
        "RECEIPT_READ",
      );
      if (e.userId !== p.userId && e.actorId !== p.userId)
        fail("ACCESS_DENIED");
      const replay = await replayEvaluation(
        r,
        {
          ownerProfileId: e.userId,
          subjectId: e.stateProfileId,
          subjectKind: "SELF",
          stateProfileId: e.stateProfileId,
          displayLabel: "",
          createdAt: e.evaluation.evaluatedAt,
          expiresAt: "9999",
        },
        e.evaluation.evaluationId,
      );
      if (hash(replay) !== hash(e.evaluation)) fail("INTEGRITY_ERROR");
      return statusOnly
        ? this.response(e, passport.subjectRef)
        : {
            ...this.response(e, passport.subjectRef),
            source: "recorded",
            receiptSchemaVersion: "taste-platform-receipt-v1",
            authorizationEvidence: {
              sourceEvaluationSchemaVersion: e.evaluation.schemaVersion,
              evaluationId: e.evaluation.evaluationId,
              stateVersion: e.evaluation.stateVersion,
              stateHash: e.evaluation.stateHash,
              agentId: e.evaluation.agentId,
              action: e.evaluation.action,
              context: e.evaluation.context,
              decision: e.evaluation.decision,
              cultural: e.evaluation.cultural,
              culturalRequest: e.evaluation.culturalRequest,
              requestId: e.evaluation.requestId,
              evaluatedAt: e.evaluation.evaluatedAt,
              source: "recorded" as const,
            },
          };
    });
  }
  async export(p: Principal, raw: unknown) {
    const v = object(raw, ["idempotencyKey", "passportRef"]),
      pr = reference(v.passportRef),
      k = key(v.idempotencyKey),
      payloadHash = hash(v);
    return this.store.transaction(async (r) => {
      await this.locked(r, p, [], undefined, true);
      const passport = await r.platform.passport(pr);
      if (!passport || passport.userId !== p.userId) fail("PASSPORT_NOT_FOUND");
      const old = await r.platform.op(p.userId, "export", k);
      if (old && old.hash !== payloadHash) fail("IDEMPOTENCY_KEY_CONFLICT");
      type Manifest = {
        exportId: string;
        passportVersion: number;
        stateVersion: number;
        receiptReferences: { evaluationId: string; stateVersion: number }[];
        semanticHash?: string;
      };
      const summary = await this.summary(r, passport);
      const manifest: Manifest = old
        ? (old.result as Manifest)
        : {
            exportId: randomUUID(),
            passportVersion: passport.version,
            stateVersion: summary.stateVersion,
            receiptReferences: (await r.receipts.list(passport.profileId)).map(
              (e) => ({
                evaluationId: e.evaluationId,
                stateVersion: e.stateVersion,
              }),
            ),
          };
      const snapshot = await r.platform.version(pr, manifest.passportVersion);
      if (!snapshot) fail("INTEGRITY_ERROR");
      const versions = (await r.platform.versions(passport.profileId)).filter(
        (s) => s.stateVersion <= manifest.stateVersion,
      );
      if (versions.some((s) => stateHash(s.entries) !== s.stateHash))
        fail("INTEGRITY_ERROR");
      const material = {
        schemaVersion: "taste-passport-export-v1",
        passport: {
          schemaVersion: "taste-passport-v1",
          originPassportRef: pr,
          originSubjectRef: passport.subjectRef,
          displayLabel: snapshot.displayLabel,
          passportVersion: snapshot.version,
          snapshotStateVersion: snapshot.stateVersion,
          snapshotStateHash: snapshot.stateHash,
          visibility: snapshot.visibility,
          expiresAt: snapshot.expiresAt,
          provenance: "EXPLICIT_USER_REVIEWED",
        },
        explicitUserState: versions.map((s) => ({
          version: s.stateVersion,
          stateHash: s.stateHash,
          entries: s.entries,
        })),
        providerDerived: {
          format: "NORMALIZED_REFERENCES_ONLY",
          entityIds: [
            ...new Set(
              versions.flatMap((s) =>
                s.entries.flatMap((e) => (e.entity ? [e.entity.id] : [])),
              ),
            ),
          ].sort(),
          rawPayloadsIncluded: false,
        },
        receiptReferences: manifest.receiptReferences,
        delegateAttestedProxyState: { included: false },
        groupAuthorizations: { included: false },
        importSupported: false,
      };
      const result = {
        ...material,
        exportId: manifest.exportId,
        semanticHash: hash(material),
      };
      if (old) {
        if (manifest.semanticHash !== result.semanticHash)
          fail("INTEGRITY_ERROR");
      } else {
        const captured = { ...manifest, semanticHash: result.semanticHash };
        await r.platform.exports(
          p.userId,
          passport,
          manifest.exportId,
          result.semanticHash,
          captured,
        );
        await r.platform.saveOp(p.userId, "export", k, payloadHash, captured);
      }
      return result;
    });
  }
  async delete(p: Principal, raw: unknown, account = false) {
    const v = object(raw, ["idempotencyKey", "passportRef", "confirmation"]);
    if (v.confirmation !== (account ? "DELETE ACCOUNT" : "DELETE PASSPORT"))
      fail("INVALID_INPUT");
    return this.op(
      p,
      account ? "account.delete" : "passport.delete",
      v,
      async (r) => {
        const passport = await r.platform.owned(p.userId);
        if (
          (!passport && !account) ||
          (v.passportRef !== undefined &&
            (!passport || passport.passportRef !== reference(v.passportRef)))
        )
          fail("PASSPORT_NOT_FOUND");
        for (const c of await r.platform.credentials(p.userId))
          await r.platform.revokeCredential(c, this.clock());
        if (passport) await r.platform.deletePassport(passport.passportRef);
        if (account) {
          await r.platform.deleteUser(
            p.userId,
            hash({ user: p.userId, key: v.idempotencyKey }),
            this.clock(),
            new Date(Date.parse(this.clock()) + 30 * DAY).toISOString(),
          );
          return { deleted: true, kind: "ACCOUNT" };
        }
        return { deleted: true, kind: "PASSPORT" };
      },
    );
  }
}
