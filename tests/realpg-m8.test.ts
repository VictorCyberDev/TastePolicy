// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- assertions over loosely typed JSON responses */
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { realDatabase, REAL_URL } from "./realpg-fixture";
import { init, subjectProvider } from "./platform-fixtures";
import { proposal, reqId, commitOf } from "./interactive-fixtures";
import { LeaseService } from "@/server/platform/lease-service";
import { DEFAULT_POLICY, type PolicyDocument } from "@/lib/policy/types";
import type { Principal } from "@/lib/platform/types";

// SYNTHETIC TEST DATA. Real PostgreSQL 16, real concurrent connections.
const suite = REAL_URL ? describe : describe.skip;
const observe: PolicyDocument = {
  ...DEFAULT_POLICY,
  autonomy: { default: "OBSERVE", byDomain: {}, byAgent: {} },
};
suite("M8 on real PostgreSQL: leases, ASK and lock ordering", () => {
  let d: Awaited<ReturnType<typeof realDatabase>>;
  let svc: LeaseService;
  let n = 0;
  async function owner() {
    const password = randomBytes(20).toString("base64url"),
      res = await d.auth.api.signUpEmail({
        body: {
          name: "SYNTHETIC TEST DATA",
          email: `m8-${++n}-${randomBytes(3).toString("hex")}@example.test`,
          password,
        },
        asResponse: true,
      });
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const s = (await d.auth.api.getSession({
      headers: new Headers({ cookie }),
    }))!;
    return {
      userId: s.user.id,
      sessionId: s.session.id,
      authenticatedAt: s.session.createdAt.toISOString(),
      kind: "SESSION",
    } as Principal;
  }
  async function world() {
    const o = await owner(),
      q = subjectProvider();
    const passport: any = await svc.initialize(o, init(), () => q.q);
    const key: any = await svc.issueKey(o, {
      idempotencyKey: "k" + ++n,
      displayLabel: "SYNTHETIC TEST DATA",
      scopes: ["PASSPORT_READ", "TASTE_EVALUATE", "RECEIPT_READ"],
      expiresAt: new Date(Date.now() + 20 * 86400000).toISOString(),
    });
    const agent = await svc.credentialPrincipal(key.secret);
    const evaluate = () =>
      svc.evaluate(
        agent,
        {
          idempotencyKey: "e" + ++n,
          passportRef: passport.passportRef,
          proposal: proposal(1),
        },
        () => q.q,
        reqId,
      ) as Promise<any>;
    const lease = (evaluationRef: string) =>
      svc.leaseRequest(agent, {
        idempotencyKey: `l${++n}-key-x`,
        evaluationRef,
      }) as Promise<any>;
    const publish = (document: PolicyDocument, expectedVersion: number) =>
      svc.policyPublish(o, {
        idempotencyKey: `p${++n}-key-x`,
        passportRef: passport.passportRef,
        document,
        expectedVersion,
      });
    return {
      owner: o,
      agent,
      ref: passport.passportRef as string,
      evaluate,
      lease,
      publish,
    };
  }
  beforeAll(async () => {
    d = await realDatabase();
    svc = new LeaseService(d.store);
  }, 120000);
  afterAll(async () => d?.close());

  it("twelve concurrent lease requests for one choice create exactly one live lease", async () => {
    const w = await world(),
      e = await w.evaluate();
    const out = await Promise.allSettled(
      Array.from({ length: 12 }, () => w.lease(e.evaluationRef)),
    );
    expect(out.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const live = await d.pool.query(
      "SELECT count(*)::int AS n FROM tastepolicy.platform_leases WHERE passport_ref=$1 AND status IN ('ACTIVE','ASK_PENDING','SUSPENDED')",
      [w.ref],
    );
    expect(live.rows[0].n).toBe(1);
  }, 60000);

  it("a storm of agent and owner operations never deadlocks (accounts are locked before leases, always)", async () => {
    const w = await world();
    const e = await w.evaluate();
    const lease = await w.lease(e.evaluationRef);
    const ops: Promise<unknown>[] = [];
    for (let i = 0; i < 10; i++) {
      ops.push(
        svc.leaseVerify(w.agent, {
          leaseRef: lease.leaseRef,
          ...commitOf(lease),
        }),
      );
      ops.push(
        svc.leaseCheckpoint(w.agent, {
          leaseRef: lease.leaseRef,
          ...commitOf(lease),
        }),
      );
      ops.push(svc.leaseList(w.owner, { passportRef: w.ref }));
    }
    ops.push(w.publish(observe, 0));
    ops.push(svc.leaseRevoke(w.owner, { passportRef: w.ref }));
    const out = await Promise.allSettled(ops);
    for (const r of out)
      if (r.status === "rejected") {
        const code =
          (r.reason as { code?: string }).code ?? (r.reason as Error).message;
        expect([
          "LEASE_STATE_CONFLICT",
          "LEASE_NOT_FOUND",
          "STATE_VERSION_CONFLICT",
        ]).toContain(code);
      }
    const left = await d.pool.query(
      "SELECT count(*)::int AS n FROM tastepolicy.platform_leases WHERE passport_ref=$1 AND status IN ('ACTIVE','SUSPENDED','ASK_PENDING')",
      [w.ref],
    );
    expect(left.rows[0].n).toBe(0);
  }, 90000);

  it("approve racing revoke and decline ends in exactly one terminal or active state, never both", async () => {
    const w = await world();
    await w.publish(observe, 0);
    const lease = await w.lease((await w.evaluate()).evaluationRef);
    expect(lease.ask.kind).toBe("AUTHORITY_CONFIRMATION");
    const out = await Promise.allSettled([
      svc.leaseApprove(w.owner, {
        idempotencyKey: `ap${++n}-key-x`,
        leaseRef: lease.leaseRef,
        confirm: true,
      }),
      svc.leaseRevoke(w.owner, { leaseRef: lease.leaseRef }),
      svc.leaseDecline(w.owner, { leaseRef: lease.leaseRef }),
    ]);
    for (const r of out)
      if (r.status === "rejected")
        expect(["LEASE_STATE_CONFLICT", "LEASE_NOT_FOUND"]).toContain(
          (r.reason as { code?: string }).code,
        );
    const row = await d.pool.query(
      "SELECT status FROM tastepolicy.platform_leases WHERE lease_ref=$1",
      [lease.leaseRef],
    );
    expect(["ACTIVE", "REVOKED", "DECLINED"]).toContain(row.rows[0].status);
    // the audit trail replays to the same state
    const ev = await d.pool.query(
      "SELECT data->>'kind' AS kind FROM tastepolicy.lease_events WHERE lease_ref=$1 ORDER BY seq",
      [lease.leaseRef],
    );
    const kinds = ev.rows.map((r) => r.kind);
    expect(kinds[0]).toBe("ISSUED");
    expect(
      kinds.filter((k) => ["APPROVED", "DECLINED", "REVOKED"].includes(k))
        .length,
    ).toBeGreaterThanOrEqual(1);
  }, 90000);

  it("a missing fact never becomes a lease or an approval on a real server", async () => {
    const w = await world();
    await w.publish(
      {
        ...DEFAULT_POLICY,
        autonomy: {
          default: "CONFIRM_ABOVE_LIMIT",
          byDomain: {},
          byAgent: {},
          limit: { amount: 100, currency: "USD" },
        },
      },
      0,
    );
    const ev = await w.evaluate(); // price unknown
    expect(ev.ask.kind).toBe("CLARIFICATION_REQUIRED");
    await expect(w.lease(ev.evaluationRef)).rejects.toMatchObject({
      code: "CLARIFICATION_REQUIRED",
    });
    const n0 = await d.pool.query(
      "SELECT count(*)::int AS n FROM tastepolicy.platform_leases WHERE passport_ref=$1",
      [w.ref],
    );
    expect(n0.rows[0].n).toBe(0);
  }, 60000);
});
