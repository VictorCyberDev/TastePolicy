// @vitest-environment node
// SYNTHETIC TEST DATA. Real migration and production PostgreSQL repository SQL.
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import {
  subjectsDatabase,
  subjectProvider,
  proxyAnchors,
  createProxy,
  replacement,
} from "./subjects-fixtures";
import { setup, NOW, reqId, proposal } from "./interactive-fixtures";
import { ProxyService } from "@/server/subjects/proxy-service";
import { GroupService } from "@/server/subjects/group-service";
import { groupPolicy } from "@/server/subjects/policy";
import type { MemberAuthorization } from "@/lib/subjects/types";
import { entities } from "./qloo-fixtures";
let d: Awaited<ReturnType<typeof subjectsDatabase>>;
beforeAll(async () => {
  d = await subjectsDatabase();
}, 30000);
afterAll(async () => d?.db.close());
async function fixture(proxyScore = 0.3, selfScore = 0.9) {
  const owner = await setup(d.store, { score: selfScore }),
    proxy = new ProxyService(d.store, () => NOW),
    group = new GroupService(d.store, () => NOW),
    provider = subjectProvider(proxyScore, selfScore);
  const model = await proxy.create(
    owner.token,
    createProxy(),
    () => provider.q,
    reqId,
  );
  return { ...owner, proxy, group, provider, model };
}
async function evaluate(
  f: Awaited<ReturnType<typeof fixture>>,
  k = "evaluate",
) {
  return f.proxy.evaluate(
    f.token,
    {
      idempotencyKey: k,
      subjectId: f.model.subject.subjectId,
      proposal: proposal(1),
    },
    () => f.provider.q,
    reqId,
  );
}
async function grouped(f: Awaited<ReturnType<typeof fixture>>) {
  const p = await evaluate(f),
    g = await f.group.create(f.token, {
      idempotencyKey: "group",
      displayLabel: "Trip",
      memberSubjectIds: [f.state.profileId, f.model.subject.subjectId],
    });
  const input = {
    idempotencyKey: "aggregate",
    groupId: g.group.groupId,
    expectedGroupVersion: 1,
    memberAuthorizations: [
      { subjectId: f.state.profileId, authorizationId: f.e.evaluationId },
      {
        subjectId: f.model.subject.subjectId,
        authorizationId: p.authorizationId,
      },
    ],
  };
  return { p, g, input };
}
describe("isolated subjects and group policy", () => {
  it("initializes independent state, five delegate-attested anchors and no proxy session", async () => {
    const f = await fixture();
    expect(f.model.subject.stateProfileId).not.toBe(f.state.profileId);
    expect(f.model.state.entries.map((e) => e.entity?.id).sort()).toEqual(
      proxyAnchors.map((e) => e.id).sort(),
    );
    expect((await f.stateService.read(f.token)).state).toEqual(f.state);
    expect(f.model.permission.assuranceLevel).toBe("USER_ATTESTED_PERMISSION");
    expect(
      (
        await d.db.query(
          "SELECT 1 FROM tastepolicy.demo_mutation_sessions WHERE profile_id=$1",
          [f.model.subject.stateProfileId],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it.each([
    [0.3, 0.9, "REJECT"],
    [0.9, 0.3, "ALLOW"],
  ] as const)(
    "proxy follows own evidence %s, never owner evidence %s",
    async (ps, ss, decision) => {
      const f = await fixture(ps, ss);
      const p = await evaluate(f);
      expect(p.baseEvaluation.decision.outcome).toBe(decision);
      const request = f.provider.calls.find((c) => c.kind === "infer")!;
      expect(request.ids.sort()).toEqual(proxyAnchors.map((e) => e.id).sort());
      expect(p.provenance.source).toBe("DELEGATE_ATTESTED");
      expect(f.provider.calls.filter((c) => c.kind === "infer")).toHaveLength(
        1,
      );
    },
  );
  it("create retries and concurrent identical create have one canonical model", async () => {
    const o = await setup(d.store),
      p = new ProxyService(d.store, () => NOW),
      q = subjectProvider(),
      factory = vi.fn(() => q.q);
    const results = await Promise.all([
      p.create(o.token, createProxy(), factory, reqId),
      p.create(o.token, createProxy(), factory, reqId),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(factory).toHaveBeenCalledTimes(1);
    await expect(
      p.create(
        o.token,
        { ...createProxy(), displayLabel: "Different" },
        factory,
        reqId,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
  });
  it("proxy evaluation idempotency precedes factory; concurrent retry has one provider execution", async () => {
    const f = await fixture(),
      factory = vi.fn(() => f.provider.q),
      input = {
        idempotencyKey: "eval",
        subjectId: f.model.subject.subjectId,
        proposal: proposal(1),
      };
    const results = await Promise.all([
      f.proxy.evaluate(f.token, input, factory, reqId),
      f.proxy.evaluate(f.token, input, factory, reqId),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(factory).toHaveBeenCalledTimes(1);
    await expect(
      f.proxy.evaluate(
        f.token,
        { ...input, proposal: { ...proposal(1), agentId: "Other" } },
        factory,
        reqId,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
  });
  it("anchor update advances only proxy, and retry is immutable", async () => {
    const f = await fixture(),
      input = {
        idempotencyKey: "replace",
        subjectId: f.model.subject.subjectId,
        expectedStateVersion: 1,
        replaceEntityId: proxyAnchors[0].id,
        replacementEntityId: replacement.id,
        identityReviewed: true,
      };
    const updated = await f.proxy.update(f.token, input, () => f.provider.q);
    expect(updated.stateVersion).toBe(2);
    expect((await f.stateService.read(f.token)).state).toEqual(f.state);
    expect(
      await f.proxy.update(f.token, input, () => {
        throw Error("must not execute");
      }),
    ).toEqual(updated);
  });
  it.each(["revoke", "expire"])(
    "permission %s blocks new evaluation but preserves replay",
    async (mode) => {
      const f = await fixture(),
        p = await evaluate(f);
      let svc = f.proxy;
      if (mode === "revoke")
        await svc.revoke(
          f.token,
          { idempotencyKey: "revoke", subjectId: f.model.subject.subjectId },
          reqId,
        );
      else
        svc = new ProxyService(d.store, () =>
          new Date(Date.parse(NOW) + 7200_000).toISOString(),
        );
      const factory = vi.fn(() => f.provider.q);
      await expect(
        svc.evaluate(
          f.token,
          {
            idempotencyKey: "new",
            subjectId: f.model.subject.subjectId,
            proposal: proposal(1),
          },
          factory,
          reqId,
        ),
      ).rejects.toMatchObject({ code: "PERMISSION_INACTIVE" });
      expect(factory).not.toHaveBeenCalled();
      const replay = await svc.replay(f.token, {
        authorizationId: p.authorizationId,
      });
      expect(replay.wrapper).toEqual(p);
      expect(replay.permissionActiveNow).toBe(false);
    },
  );
  it("requires group scope", async () => {
    const o = await setup(d.store),
      p = new ProxyService(d.store, () => NOW),
      q = subjectProvider();
    const model = await p.create(
      o.token,
      { ...createProxy(), scopes: ["MODEL_MANAGEMENT", "TASTE_EVALUATION"] },
      () => q.q,
      reqId,
    );
    await expect(
      new GroupService(d.store, () => NOW).create(o.token, {
        idempotencyKey: "g",
        displayLabel: "Group",
        memberSubjectIds: [o.state.profileId, model.subject.subjectId],
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_SCOPE_REQUIRED" });
  });
  it.each([
    [0.9, "ALLOW"],
    [0.65, "ASK"],
    [0.3, "REJECT"],
  ] as const)(
    "aggregates independent completed decisions (%s)",
    async (score, result) => {
      const f = await fixture(score),
        { input } = await grouped(f),
        calls = f.provider.calls.length;
      const g = await f.group.authorize(f.token, input, reqId);
      expect(g.aggregateDecision).toBe(result);
      expect(f.provider.calls).toHaveLength(calls);
      expect(
        (await f.group.replay(f.token, { authorizationId: g.authorizationId }))
          .envelope,
      ).toEqual(g);
      expect(f.provider.calls).toHaveLength(calls);
      expect(
        await f.group.authorize(
          f.token,
          {
            ...input,
            memberAuthorizations: [...input.memberAuthorizations].reverse(),
          },
          reqId,
        ),
      ).toEqual(g);
    },
  );
  it("provider failure stays UNAVAILABLE in proxy and group", async () => {
    const f = await fixture(),
      p = await f.proxy.evaluate(
        f.token,
        {
          idempotencyKey: "unavailable",
          subjectId: f.model.subject.subjectId,
          proposal: proposal(1),
        },
        () => {
          throw Error("secret upstream");
        },
        reqId,
      );
    expect(p.baseEvaluation.decision.outcome).toBe("UNAVAILABLE");
    const g = await f.group.create(f.token, {
      idempotencyKey: "g",
      displayLabel: "Trip",
      memberSubjectIds: [f.state.profileId, p.subjectId],
    });
    const result = await f.group.authorize(
      f.token,
      {
        idempotencyKey: "a",
        groupId: g.group.groupId,
        expectedGroupVersion: 1,
        memberAuthorizations: [
          { subjectId: f.state.profileId, authorizationId: f.e.evaluationId },
          { subjectId: p.subjectId, authorizationId: p.authorizationId },
        ],
      },
      reqId,
    );
    expect(result.aggregateDecision).toBe("UNAVAILABLE");
    expect(JSON.stringify(result)).not.toContain("secret upstream");
  });
  it("rejects incomplete or duplicate member results structurally", async () => {
    const f = await fixture(),
      { input } = await grouped(f);
    await expect(
      f.group.authorize(
        f.token,
        {
          ...input,
          memberAuthorizations: input.memberAuthorizations.slice(0, 1),
        },
        reqId,
      ),
    ).rejects.toMatchObject({ code: "GROUP_EVALUATION_INCOMPLETE" });
    await expect(
      f.group.authorize(
        f.token,
        {
          ...input,
          memberAuthorizations: [
            input.memberAuthorizations[0],
            input.memberAuthorizations[0],
          ],
        },
        reqId,
      ),
    ).rejects.toMatchObject({ code: "GROUP_MEMBER_DUPLICATE" });
  });
  it("immutable membership version and expected version conflict", async () => {
    const f = await fixture(),
      { g, input } = await grouped(f);
    const v = await f.group.update(f.token, {
      idempotencyKey: "update",
      groupId: g.group.groupId,
      expectedGroupVersion: 1,
      memberSubjectIds: g.version.memberSubjectIds,
    });
    expect(v.groupVersion).toBe(2);
    await expect(
      f.group.authorize(f.token, input, reqId),
    ).rejects.toMatchObject({ code: "GROUP_VERSION_CONFLICT" });
    expect(
      await d.store.transaction((r) =>
        r.groups.version(f.state.profileId, g.group.groupId, 1),
      ),
    ).toEqual(g.version);
  });
  it("state advancement blocks new aggregation but old replay stays valid", async () => {
    const f = await fixture(),
      { input } = await grouped(f),
      g = await f.group.authorize(f.token, input, reqId);
    await f.proxy.update(
      f.token,
      {
        idempotencyKey: "u",
        subjectId: f.model.subject.subjectId,
        expectedStateVersion: 1,
        replaceEntityId: proxyAnchors[0].id,
        replacementEntityId: replacement.id,
        identityReviewed: true,
      },
      () => f.provider.q,
    );
    await expect(
      f.group.authorize(f.token, { ...input, idempotencyKey: "new" }, reqId),
    ).rejects.toMatchObject({ code: "GROUP_MEMBER_STATE_STALE" });
    expect(
      (await f.group.replay(f.token, { authorizationId: g.authorizationId }))
        .envelope,
    ).toEqual(g);
  });
  it("same-context constraint rejects independent different contexts", async () => {
    const f = await fixture(),
      { input } = await grouped(f),
      other = await f.proxy.evaluate(
        f.token,
        {
          idempotencyKey: "different-context",
          subjectId: f.model.subject.subjectId,
          proposal: proposal(1, { key: "different", domain: "destination" }),
        },
        () => f.provider.q,
        reqId,
      );
    input.memberAuthorizations[1].authorizationId = other.authorizationId;
    await expect(
      f.group.authorize(f.token, input, reqId),
    ).rejects.toMatchObject({ code: "GROUP_MEMBER_INPUT_MISMATCH" });
  });
  it("cross-owner access is not found", async () => {
    const a = await fixture(),
      b = await fixture(),
      p = await evaluate(a);
    await expect(
      b.proxy.evaluate(
        b.token,
        {
          idempotencyKey: "foreign",
          subjectId: a.model.subject.subjectId,
          proposal: proposal(1),
        },
        () => b.provider.q,
        reqId,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      b.proxy.replay(b.token, { authorizationId: p.authorizationId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      b.proxy.revoke(
        b.token,
        { idempotencyKey: "foreign", subjectId: a.model.subject.subjectId },
        reqId,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      b.group.create(b.token, {
        idempotencyKey: "foreign",
        displayLabel: "No",
        memberSubjectIds: [b.state.profileId, a.model.subject.subjectId],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("delete tombstones proxy, closes undersized group, preserves replay and SELF", async () => {
    const f = await fixture(),
      { input, p, g } = await grouped(f);
    await f.group.authorize(f.token, input, reqId);
    await f.proxy.revoke(
      f.token,
      { idempotencyKey: "delete", subjectId: p.subjectId },
      reqId,
      true,
    );
    expect(
      (await f.proxy.inspect(f.token)).find(
        (s) => s.subject.subjectId === p.subjectId,
      ),
    ).toMatchObject({
      deleted: true,
      state: null,
      subject: { displayLabel: "Deleted proxy" },
    });
    expect(
      (await f.group.inspect(f.token)).find(
        (x) => x.group.groupId === g.group.groupId,
      )?.closed,
    ).toBe(true);
    expect(
      (await f.proxy.replay(f.token, { authorizationId: p.authorizationId }))
        .wrapper,
    ).toEqual(p);
    expect((await f.stateService.read(f.token)).state).toEqual(f.state);
  });
  it("group delete preserves member state", async () => {
    const f = await fixture(),
      { g } = await grouped(f);
    await f.group.delete(f.token, {
      idempotencyKey: "delete",
      groupId: g.group.groupId,
    });
    expect(
      (await f.proxy.inspect(f.token)).find(
        (s) => s.subject.subjectId === f.model.subject.subjectId,
      )?.state,
    ).toEqual(f.model.state);
  });
  it("owner purge leaves no proxy state orphan", async () => {
    const f = await fixture();
    await d.db.query(
      "DELETE FROM tastepolicy.taste_profiles WHERE profile_id=$1",
      [f.state.profileId],
    );
    expect(
      (
        await d.db.query(
          "SELECT 1 FROM tastepolicy.taste_profiles WHERE profile_id=$1",
          [f.model.subject.stateProfileId],
        )
      ).rows,
    ).toHaveLength(0);
  });
});
describe("unanimous equal-rights policy", () => {
  it.each([
    [["ALLOW", "ALLOW"], "ALLOW"],
    [["ALLOW", "ASK"], "ASK"],
    [["ALLOW", "REJECT"], "REJECT"],
    [["ALLOW", "UNAVAILABLE"], "UNAVAILABLE"],
    [["REJECT", "UNAVAILABLE"], "REJECT"],
    [["ALLOW", "ALLOW", "ALLOW", "ALLOW", "REJECT"], "REJECT"],
  ] as const)(
    "%j => %s, independent of order and raw affinities",
    (decisions, expected) => {
      const members = decisions.map((decision, i) => ({
        subjectId: `subject-${i}`,
        decision,
        rawAffinity: i * 100,
      })) as unknown as MemberAuthorization[];
      expect(groupPolicy(members).aggregateDecision).toBe(expected);
      expect(groupPolicy([...members].reverse())).toEqual(groupPolicy(members));
      expect(
        groupPolicy(members.map((m) => ({ ...m, rawAffinity: NaN }))),
      ).toEqual(groupPolicy(members));
    },
  );
});
describe("relational integrity and durable evidence", () => {
  it("rejects proxy public session, SELF substitution, and invalid state separation", async () => {
    const f = await fixture(),
      s = f.model.subject;
    await expect(
      d.db.query(
        "INSERT INTO tastepolicy.demo_mutation_sessions VALUES($1,$2,$3,0)",
        ["a".repeat(64), s.stateProfileId, s.expiresAt],
      ),
    ).rejects.toThrow();
    await expect(
      d.db.query(
        "INSERT INTO tastepolicy.taste_subjects VALUES($1,$2,'PROXY',$1,'{}')",
        [f.state.profileId, entities[0].id],
      ),
    ).rejects.toThrow();
    await expect(
      d.db.query(
        "INSERT INTO tastepolicy.taste_subjects VALUES($1,$2,'SELF',$2,'{}')",
        [f.state.profileId, s.stateProfileId],
      ),
    ).rejects.toThrow();
  });
  it("rejects cross-owner membership and duplicate membership at SQL boundary", async () => {
    const a = await fixture(),
      b = await fixture(),
      { g } = await grouped(a);
    await expect(
      d.db.query(
        "INSERT INTO tastepolicy.taste_group_members VALUES($1,$2,1,$3)",
        [a.state.profileId, g.group.groupId, b.model.subject.subjectId],
      ),
    ).rejects.toThrow();
    await expect(
      d.db.query(
        "INSERT INTO tastepolicy.taste_group_members VALUES($1,$2,1,$3)",
        [a.state.profileId, g.group.groupId, a.state.profileId],
      ),
    ).rejects.toThrow();
  });
  it("rejects mismatched candidate, context, subject and group-version links by composite FK", async () => {
    const f = await fixture(),
      { input } = await grouped(f),
      g = await f.group.authorize(f.token, input, reqId);
    const first = g.memberResults[0],
      other = g.memberResults[1];
    for (const patch of [
      { candidate: entities[0].id },
      { context: "a".repeat(64) },
      { subject: other.subjectId },
      { version: 2 },
    ]) {
      const parent = crypto.randomUUID();
      await d.db.exec("BEGIN");
      try {
        await d.db.query(
          "INSERT INTO tastepolicy.group_authorizations SELECT owner_profile_id,$2,group_id,version,candidate_id,candidate_type,context_hash,decision,semantic_hash,data FROM tastepolicy.group_authorizations WHERE authorization_id=$1",
          [g.authorizationId, parent],
        );
        await expect(
          d.db.query(
            "INSERT INTO tastepolicy.group_member_authorizations SELECT owner_profile_id,$2,group_id,$3,$4,state_profile_id,state_version,authorization_id,$5,candidate_type,$6,decision,data FROM tastepolicy.group_member_authorizations WHERE group_authorization_id=$1 AND subject_id=$7",
            [
              g.authorizationId,
              parent,
              patch.version ?? 1,
              patch.subject ?? first.subjectId,
              patch.candidate ?? g.candidate.id,
              patch.context ?? g.contextHash,
              first.subjectId,
            ],
          ),
        ).rejects.toMatchObject({ code: "23503" });
      } finally {
        await d.db.exec("ROLLBACK");
      }
    }
  });
  it("rejects direct member-link deletion and version mutation", async () => {
    const f = await fixture(),
      { input, g } = await grouped(f),
      a = await f.group.authorize(f.token, input, reqId);
    await expect(
      d.db.query(
        "UPDATE tastepolicy.taste_group_versions SET data='{}' WHERE group_id=$1",
        [g.group.groupId],
      ),
    ).rejects.toThrow("Immutable snapshot");
    await expect(
      d.db.query(
        "DELETE FROM tastepolicy.group_member_authorizations WHERE group_authorization_id=$1",
        [a.authorizationId],
      ),
    ).rejects.toThrow();
    await expect(
      d.db.query(
        "DELETE FROM tastepolicy.taste_group_members WHERE group_id=$1",
        [g.group.groupId],
      ),
    ).rejects.toThrow();
  });
  it("new tables enable RLS and grant no PUBLIC privileges", async () => {
    const tables = (
      await d.db.query<{
        relname: string;
        relrowsecurity: boolean;
        public_access: boolean;
      }>(
        "SELECT c.relname,c.relrowsecurity,EXISTS(SELECT 1 FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) public_access FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='tastepolicy' AND c.relname IN ('taste_subjects','subject_permission_attestations','subject_permission_events','proxy_signal_provenance','subject_authorizations','proxy_authorizations','taste_groups','taste_group_versions','taste_group_members','taste_group_events','group_authorizations','group_member_authorizations','subject_operations')",
      )
    ).rows;
    expect(tables).toHaveLength(13);
    expect(tables.every((t) => t.relrowsecurity && !t.public_access)).toBe(
      true,
    );
  });
  it("concurrent membership updates yield one version and one conflict", async () => {
    const f = await fixture(),
      { g } = await grouped(f),
      input = {
        groupId: g.group.groupId,
        expectedGroupVersion: 1,
        memberSubjectIds: g.version.memberSubjectIds,
      };
    const result = await Promise.allSettled([
      f.group.update(f.token, { ...input, idempotencyKey: "u1" }),
      f.group.update(f.token, { ...input, idempotencyKey: "u2" }),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(result.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("concurrent same-key aggregation yields one durable receipt", async () => {
    const f = await fixture(),
      { input } = await grouped(f),
      results = await Promise.all([
        f.group.authorize(f.token, input, reqId),
        f.group.authorize(f.token, input, reqId),
      ]);
    expect(results[0]).toEqual(results[1]);
    expect(
      (
        await d.db.query(
          "SELECT 1 FROM tastepolicy.group_authorizations WHERE group_id=$1",
          [input.groupId],
        )
      ).rows,
    ).toHaveLength(1);
    await expect(
      f.group.authorize(f.token, { ...input, expectedGroupVersion: 2 }, reqId),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
  });
  it("revocation blocks new group authorization but historical replay remains", async () => {
    const f = await fixture(),
      { input } = await grouped(f),
      a = await f.group.authorize(f.token, input, reqId);
    await f.proxy.revoke(
      f.token,
      { idempotencyKey: "r", subjectId: f.model.subject.subjectId },
      reqId,
    );
    await expect(
      f.group.authorize(f.token, { ...input, idempotencyKey: "new" }, reqId),
    ).rejects.toMatchObject({ code: "PERMISSION_INACTIVE" });
    expect(
      (await f.group.replay(f.token, { authorizationId: a.authorizationId }))
        .permissionActiveNow[f.model.subject.subjectId],
    ).toBe(false);
  });
  it("SQL rollback after proxy wrapper write leaves no evaluation or operation", async () => {
    const f = await fixture(),
      store = {
        transaction: <T>(fn: Parameters<typeof d.store.transaction<T>>[0]) =>
          d.store.transaction((r) =>
            fn({
              ...r,
              subjects: {
                ...r.subjects,
                insertProxy: async (o, p) => {
                  await r.subjects.insertProxy(o, p);
                  throw Error("injected");
                },
              },
            }),
          ),
      };
    await expect(
      new ProxyService(store, () => NOW).evaluate(
        f.token,
        {
          idempotencyKey: "rollback",
          subjectId: f.model.subject.subjectId,
          proposal: proposal(1),
        },
        () => f.provider.q,
        reqId,
      ),
    ).rejects.toThrow("injected");
    expect(
      (
        await d.db.query(
          "SELECT 1 FROM tastepolicy.cultural_receipts WHERE profile_id=$1",
          [f.model.subject.stateProfileId],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it.each(["parent", "member"])(
    "SQL rollback after group %s write leaves no partial authorization",
    async (point) => {
      const f = await fixture(),
        { input } = await grouped(f);
      const store = {
        transaction: <T>(fn: Parameters<typeof d.store.transaction<T>>[0]) =>
          d.store.transaction(async (r) => {
            await d.db.exec(
              `CREATE TRIGGER inject_group BEFORE INSERT ON tastepolicy.${point === "parent" ? "group_member_authorizations" : "subject_operations"} FOR EACH ROW EXECUTE FUNCTION tastepolicy.immutable_snapshot()`,
            );
            return fn(r);
          }),
      };
      await expect(
        new GroupService(store, () => NOW).authorize(f.token, input, reqId),
      ).rejects.toThrow("Immutable snapshot");
      expect(
        (
          await d.db.query(
            "SELECT 1 FROM tastepolicy.group_authorizations WHERE group_id=$1",
            [input.groupId],
          )
        ).rows,
      ).toHaveLength(0);
    },
  );
  it("captured wrapper and group tampering fails closed", async () => {
    const f = await fixture(),
      { input, p } = await grouped(f),
      g = await f.group.authorize(f.token, input, reqId);
    const store = {
      transaction: <T>(fn: Parameters<typeof d.store.transaction<T>>[0]) =>
        d.store.transaction((r) =>
          fn({
            ...r,
            subjects: {
              ...r.subjects,
              proxy: async () => ({ ...p, stateVersion: 999 }),
            },
            groups: {
              ...r.groups,
              authorization: async () => ({
                ...g,
                aggregateDecision: "ALLOW" as const,
              }),
            },
          }),
        ),
    };
    await expect(
      new ProxyService(store, () => NOW).replay(f.token, {
        authorizationId: p.authorizationId,
      }),
    ).rejects.toMatchObject({ code: "INTEGRITY_ERROR" });
    await expect(
      new GroupService(store, () => NOW).replay(f.token, {
        authorizationId: g.authorizationId,
      }),
    ).rejects.toMatchObject({ code: "INTEGRITY_ERROR" });
  });
  it("close/reopen preserves proxy, permission, group, wrappers and zero-provider replay", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises"),
      { tmpdir } = await import("node:os"),
      { join } = await import("node:path"),
      dir = await mkdtemp(join(tmpdir(), "tastepolicy-m5-"));
    let local = await subjectsDatabase(dir);
    try {
      const o = await setup(local.store),
        p = new ProxyService(local.store, () => NOW),
        s = await p.create(
          o.token,
          createProxy(),
          () => subjectProvider().q,
          reqId,
        ),
        e = await p.evaluate(
          o.token,
          {
            idempotencyKey: "e",
            subjectId: s.subject.subjectId,
            proposal: proposal(1),
          },
          () => subjectProvider().q,
          reqId,
        ),
        gs = new GroupService(local.store, () => NOW),
        g = await gs.create(o.token, {
          idempotencyKey: "g",
          displayLabel: "Trip",
          memberSubjectIds: [o.state.profileId, s.subject.subjectId],
        }),
        a = await gs.authorize(
          o.token,
          {
            idempotencyKey: "a",
            groupId: g.group.groupId,
            expectedGroupVersion: 1,
            memberAuthorizations: [
              {
                subjectId: o.state.profileId,
                authorizationId: o.e.evaluationId,
              },
              {
                subjectId: s.subject.subjectId,
                authorizationId: e.authorizationId,
              },
            ],
          },
          reqId,
        );
      await local.db.close();
      local = await subjectsDatabase(dir, false);
      expect(
        (
          await new ProxyService(local.store, () => NOW).replay(o.token, {
            authorizationId: e.authorizationId,
          })
        ).wrapper,
      ).toEqual(e);
      expect(
        (
          await new GroupService(local.store, () => NOW).replay(o.token, {
            authorizationId: a.authorizationId,
          })
        ).envelope,
      ).toEqual(a);
    } finally {
      await local.db.close();
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);
});
it("same-candidate mismatch cannot combine valid different receipts", async () => {
  const f = await fixture(),
    { input } = await grouped(f);
  const { ALT, provider } = await import("./interactive-fixtures");
  // Independent provider revalidates the alternate candidate for the same proxy model.
  const q = subjectProvider().q,
    alternate = {
      ...q,
      entities: async (ids: readonly string[]) => ({
        status: "available" as const,
        data: ids.map((i) =>
          i === ALT.id
            ? ALT
            : [...proxyAnchors, ...entities].find((e) => e.id === i)!,
        ),
      }),
      infer: provider().q.infer,
    };
  const e = await f.proxy.evaluate(
    f.token,
    {
      idempotencyKey: "alternate",
      subjectId: f.model.subject.subjectId,
      proposal: { ...proposal(1), candidate: ALT },
    },
    () => alternate,
    reqId,
  );
  input.memberAuthorizations[1].authorizationId = e.authorizationId;
  await expect(f.group.authorize(f.token, input, reqId)).rejects.toMatchObject({
    code: "GROUP_MEMBER_INPUT_MISMATCH",
  });
});
it("re-evaluated changed member restores freshness", async () => {
  const f = await fixture(),
    { input } = await grouped(f);
  await f.proxy.update(
    f.token,
    {
      idempotencyKey: "u",
      subjectId: f.model.subject.subjectId,
      expectedStateVersion: 1,
      replaceEntityId: proxyAnchors[0].id,
      replacementEntityId: replacement.id,
      identityReviewed: true,
    },
    () => f.provider.q,
  );
  const p = await f.proxy.evaluate(
    f.token,
    {
      idempotencyKey: "new",
      subjectId: f.model.subject.subjectId,
      proposal: proposal(2),
    },
    () => f.provider.q,
    reqId,
  );
  input.memberAuthorizations[1].authorizationId = p.authorizationId;
  expect(
    (await f.group.authorize(f.token, input, reqId)).aggregateDecision,
  ).toBe("REJECT");
});
it("owner REJECT has no extra weight, proxy ALLOW cannot erase veto", async () => {
  const f = await fixture(0.9, 0.3),
    { input } = await grouped(f),
    g = await f.group.authorize(f.token, input, reqId);
  expect(g.aggregateDecision).toBe("REJECT");
  expect(g.rejectingMembers).toEqual([f.state.profileId]);
});
it("member additions/removals preserve old membership and delete proxy versions affected groups", async () => {
  const f = await fixture(),
    { g } = await grouped(f),
    second = await f.proxy.create(
      f.token,
      { ...createProxy("second"), displayLabel: "Sam" },
      () => f.provider.q,
      reqId,
    );
  const three = await f.group.update(f.token, {
    idempotencyKey: "three",
    groupId: g.group.groupId,
    expectedGroupVersion: 1,
    memberSubjectIds: [...g.version.memberSubjectIds, second.subject.subjectId],
  });
  expect(three.memberSubjectIds).toHaveLength(3);
  await f.proxy.revoke(
    f.token,
    { idempotencyKey: "delete", subjectId: second.subject.subjectId },
    reqId,
    true,
  );
  const current = (await f.group.inspect(f.token)).find(
    (x) => x.group.groupId === g.group.groupId,
  )!;
  expect(current.version?.groupVersion).toBe(3);
  expect(current.version?.memberSubjectIds).toEqual(g.version.memberSubjectIds);
  expect(
    await d.store.transaction((r) =>
      r.groups.version(f.state.profileId, g.group.groupId, 2),
    ),
  ).toEqual(three);
});
it("proxy rejects malformed/duplicate/incomplete anchors before provider work", async () => {
  const f = await fixture(),
    factory = vi.fn(() => f.provider.q);
  for (const signalIds of [
    proxyAnchors.slice(0, 4).map((e) => e.id),
    Array(5).fill(proxyAnchors[0].id),
    ["invalid", ...proxyAnchors.slice(1).map((e) => e.id)],
  ])
    await expect(
      f.proxy.create(
        f.token,
        { ...createProxy("bad"), signalIds },
        factory,
        reqId,
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(factory).not.toHaveBeenCalled();
});
it("group replay detects relational projection tampering even if envelope is intact", async () => {
  const f = await fixture(),
    { input } = await grouped(f),
    g = await f.group.authorize(f.token, input, reqId);
  const store = {
    transaction: <T>(fn: Parameters<typeof d.store.transaction<T>>[0]) =>
      d.store.transaction((r) =>
        fn({
          ...r,
          groups: {
            ...r.groups,
            members: async (o, id) =>
              (await r.groups.members(o, id)).map((m) => ({
                ...m,
                contextHash: "tampered",
              })),
          },
        }),
      ),
  };
  await expect(
    new GroupService(store, () => NOW).replay(f.token, {
      authorizationId: g.authorizationId,
    }),
  ).rejects.toMatchObject({ code: "INTEGRITY_ERROR" });
});

it("group semantic hash ignores issuance IDs/time/request and input order", async () => {
  const f = await fixture(),
    { input } = await grouped(f),
    a = await f.group.authorize(f.token, input, reqId),
    b = await f.group.authorize(
      f.token,
      {
        ...input,
        idempotencyKey: "different-key",
        memberAuthorizations: [...input.memberAuthorizations].reverse(),
      },
      entities[0].id,
    );
  expect(a.authorizationId).not.toBe(b.authorizationId);
  expect(a.semanticHash).toBe(b.semanticHash);
});

it("owner purge cascades completed groups and proxy state together", async () => {
  const f = await fixture(),
    { input } = await grouped(f);
  await f.group.authorize(f.token, input, reqId);
  await d.db.query(
    "DELETE FROM tastepolicy.taste_profiles WHERE profile_id=$1",
    [f.state.profileId],
  );
  for (const table of [
    "taste_subjects",
    "subject_permission_attestations",
    "proxy_authorizations",
    "taste_groups",
    "group_authorizations",
    "group_member_authorizations",
    "subject_operations",
  ])
    expect(
      (
        await d.db.query(
          `SELECT 1 FROM tastepolicy.${table} WHERE owner_profile_id=$1`,
          [f.state.profileId],
        )
      ).rows,
    ).toHaveLength(0);
  expect(
    (
      await d.db.query(
        "SELECT 1 FROM tastepolicy.taste_profiles WHERE profile_id=$1",
        [f.model.subject.stateProfileId],
      )
    ).rows,
  ).toHaveLength(0);
});

it("permission expiry does not purge historical proxy lineage before owner retention", async () => {
  const f = await fixture(),
    { input } = await grouped(f),
    a = await f.group.authorize(f.token, input, reqId),
    later = new Date(Date.parse(NOW) + 7200_000).toISOString();
  await d.store.transaction((r) => r.sessions.purge(later));
  expect(
    (
      await new GroupService(d.store, () => later).replay(f.token, {
        authorizationId: a.authorizationId,
      })
    ).permissionActiveNow[f.model.subject.subjectId],
  ).toBe(false);
});
