// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- assertions over loosely typed JSON responses */
// SYNTHETIC TEST DATA. Real migrations and production repository SQL: each group
// member is decided under that member's own policy before the M5 rule aggregates.
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { platformDatabase, account } from "./platform-fixtures";
import { subjectProvider, createProxy } from "./subjects-fixtures";
import { setup, NOW, reqId, proposal } from "./interactive-fixtures";
import { ProxyService } from "@/server/subjects/proxy-service";
import { GroupService } from "@/server/subjects/group-service";
import { PolicyService } from "@/server/platform/policy-service";
import { DEFAULT_POLICY, type PolicyDocument } from "@/lib/policy/types";
import type { Principal } from "@/lib/platform/types";

let d: Awaited<ReturnType<typeof platformDatabase>>;
let policy: PolicyService;
beforeAll(async () => {
  d = await platformDatabase();
  policy = new PolicyService(d.store, () => NOW);
}, 30000);
afterAll(async () => d?.db.close());

const observe: PolicyDocument = {
  ...DEFAULT_POLICY,
  autonomy: { default: "OBSERVE", byDomain: {}, byAgent: {} },
};
let n = 0;
// A state profile that belongs to a Passport: this is how a member comes to
// carry that Passport's own policy and temporary permissions.
async function bind(profileId: string) {
  const a = await account(d);
  const [state] = await d.store.transaction(async (r) => {
    const prof = (await r.states.profile(profileId))!;
    return [(await r.states.version(profileId, prof.currentStateVersion))!];
  });
  const ref = "tp_" + randomBytes(24).toString("hex");
  await d.store.transaction((r) =>
    r.platform.insertPassport({
      subjectRef: "tps_" + randomBytes(24).toString("hex"),
      passportRef: ref,
      userId: a.principal.userId,
      profileId,
      version: 1,
      stateVersion: state.stateVersion,
      stateHash: state.stateHash,
      displayLabel: "SYNTHETIC TEST DATA",
      visibility: "PRIVATE",
      createdAt: NOW,
      expiresAt: new Date(Date.parse(NOW) + 30 * 86_400_000).toISOString(),
    }),
  );
  return { principal: a.principal as Principal, ref };
}
const publish = (
  b: Awaited<ReturnType<typeof bind>>,
  document: PolicyDocument,
  expectedVersion: number,
) =>
  policy.policyPublish(b.principal, {
    idempotencyKey: `gp-${++n}-key-x`,
    passportRef: b.ref,
    document,
    expectedVersion,
  });
const override = (b: Awaited<ReturnType<typeof bind>>) =>
  policy.overrideCreate(b.principal, {
    idempotencyKey: `go-${++n}-key-x`,
    passportRef: b.ref,
    effect: "ALLOW_THROUGH_ASK",
    scope: { domain: "destination" },
    days: 3,
  });

async function world(scores: { self?: number; p1?: number; p2?: number } = {}) {
  const owner = await setup(d.store, { score: scores.self ?? 0.9 }),
    proxy = new ProxyService(d.store, () => NOW),
    group = new GroupService(d.store, () => NOW);
  const mk = async (k: string, score: number) => {
    const provider = subjectProvider(score, scores.self ?? 0.9);
    const model = await proxy.create(
      owner.token,
      createProxy(k),
      () => provider.q,
      reqId,
    );
    const evalIt = (key: string) =>
      proxy.evaluate(
        owner.token,
        {
          idempotencyKey: key,
          subjectId: model.subject.subjectId,
          proposal: proposal(1),
        },
        () => provider.q,
        reqId,
      ) as Promise<any>;
    return { model, evalIt, provider };
  };
  const p1 = await mk("p1", scores.p1 ?? 0.9),
    p2 = await mk("p2", scores.p2 ?? 0.9);
  const e1 = await p1.evalIt("e1"),
    e2 = await p2.evalIt("e2");
  const selfEval = await proxy
    .evaluate(
      owner.token,
      // SELF member: evaluated through the same service as a proxy would be, via the M5 group path below
      {
        idempotencyKey: "self",
        subjectId: owner.state.profileId,
        proposal: proposal(1),
      },
      () => p1.provider.q,
      reqId,
    )
    .catch(() => null);
  const g = await group.create(owner.token, {
    idempotencyKey: "grp",
    displayLabel: "Trip",
    memberSubjectIds: [p1.model.subject.subjectId, p2.model.subject.subjectId],
  });
  const authorize = (key: string) =>
    group.authorize(
      owner.token,
      {
        idempotencyKey: key,
        groupId: g.group.groupId,
        expectedGroupVersion: 1,
        memberAuthorizations: [
          {
            subjectId: p1.model.subject.subjectId,
            authorizationId:
              (e1.wrapper ?? e1).baseEvaluation?.evaluationId ??
              e1.authorizationId,
          },
          {
            subjectId: p2.model.subject.subjectId,
            authorizationId:
              (e2.wrapper ?? e2).baseEvaluation?.evaluationId ??
              e2.authorizationId,
          },
        ],
      },
      reqId,
    ) as Promise<any>;
  void selfEval;
  return { owner, group, g, p1, p2, e1, e2, authorize };
}

describe("group authorization routes every member through that member's own policy", () => {
  it("a member whose own policy says ask holds the group at ASK; the recorded base decision is kept", async () => {
    const w = await world();
    const b1 = await bind(w.p1.model.subject.stateProfileId);
    await publish(b1, observe, 0);
    const out = await w.authorize("a1");
    const m1 = out.memberResults.find(
      (m: any) => m.subjectId === w.p1.model.subject.subjectId,
    );
    const m2 = out.memberResults.find(
      (m: any) => m.subjectId === w.p2.model.subject.subjectId,
    );
    expect(m1.decision).toBe("ASK");
    expect(m1.decisionBasis).toBe("AUTONOMY_CEILING");
    expect(m1.policy).toMatchObject({ version: 1, baseDecision: "ALLOW" });
    expect(m2.decision).toBe("ALLOW");
    expect(m2.policy).toBeUndefined(); // no policy layer: unchanged M5 shape
    expect(out.aggregateDecision).toBe("ASK");
    expect(out.askingMembers).toEqual([w.p1.model.subject.subjectId]);
  }, 60000);

  it("a member's own temporary permission releases only that member; another member's ASK still holds the group", async () => {
    const w = await world();
    const b1 = await bind(w.p1.model.subject.stateProfileId),
      b2 = await bind(w.p2.model.subject.stateProfileId);
    await publish(b1, observe, 0);
    await publish(b2, observe, 0);
    await override(b1);
    const out = await w.authorize("a2");
    const dec = (id: string) =>
      out.memberResults.find((m: any) => m.subjectId === id);
    expect(dec(w.p1.model.subject.subjectId).decision).toBe("ALLOW");
    expect(dec(w.p1.model.subject.subjectId).decisionBasis).toBe(
      "USER_TEMPORARY_OVERRIDE",
    );
    expect(dec(w.p2.model.subject.subjectId).decision).toBe("ASK");
    expect(out.aggregateDecision).toBe("ASK");
    // once the second member gives their own permission the group may proceed
    await override(b2);
    expect((await w.authorize("a2b")).aggregateDecision).toBe("ALLOW");
  }, 60000);

  it("one member's REJECT vetoes the group even when the other member allows and holds a permission", async () => {
    const w = await world({ p2: 0.2 });
    const b1 = await bind(w.p1.model.subject.stateProfileId);
    await publish(b1, observe, 0);
    await override(b1);
    const out = await w.authorize("a3");
    expect(out.aggregateDecision).toBe("REJECT");
    expect(out.rejectingMembers).toEqual([w.p2.model.subject.subjectId]);
  }, 60000);

  it("replay reproduces the captured policy-aware decision from the captured version, not today's rules, and reports that the rules changed", async () => {
    const w = await world();
    const b1 = await bind(w.p1.model.subject.stateProfileId);
    await publish(b1, observe, 0);
    const out = await w.authorize("a4");
    expect(out.aggregateDecision).toBe("ASK");
    // the owner later relaxes the rule; the historical decision must not change
    await publish(b1, DEFAULT_POLICY, 1);
    const replay: any = await w.group.replay(w.owner.token, {
      authorizationId: out.authorizationId,
    });
    expect(replay.envelope.aggregateDecision).toBe("ASK");
    expect(replay.source).toBe("recorded");
    expect(replay.policyChangedSince[w.p1.model.subject.subjectId]).toBe(true);
    expect(replay.policyChangedSince[w.p2.model.subject.subjectId]).toBe(false);
    // a fresh authorization now sees the relaxed rule
    expect((await w.authorize("a4b")).aggregateDecision).toBe("ALLOW");
  }, 60000);
});
