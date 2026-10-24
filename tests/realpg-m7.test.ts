// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- assertions over loosely typed JSON responses */
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { realDatabase, REAL_URL } from "./realpg-fixture";
import { init, subjectProvider } from "./platform-fixtures";
import { PolicyService } from "@/server/platform/policy-service";
import { DEFAULT_POLICY, type PolicyDocument } from "@/lib/policy/types";
import type { Principal } from "@/lib/platform/types";

// SYNTHETIC TEST DATA. Real PostgreSQL 16, real concurrent connections.
const suite = REAL_URL ? describe : describe.skip;
suite("M7 on real PostgreSQL: policy history and permissions", () => {
  let d: Awaited<ReturnType<typeof realDatabase>>;
  let svc: PolicyService;
  let n = 0;
  async function owner() {
    const password = randomBytes(20).toString("base64url"),
      res = await d.auth.api.signUpEmail({
        body: {
          name: "SYNTHETIC TEST DATA",
          email: `m7-${++n}-${randomBytes(3).toString("hex")}@example.test`,
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
  beforeAll(async () => {
    d = await realDatabase();
    svc = new PolicyService(d.store);
  }, 120000);
  afterAll(async () => d?.close());

  it("concurrent publishes against one version: exactly one wins, history stays linear", async () => {
    const p = await owner(),
      q = subjectProvider();
    const passport: any = await svc.initialize(p, init(), () => q.q);
    const doc = (i: number): PolicyDocument => ({
      ...DEFAULT_POLICY,
      freshness: { EXPLICIT_POSITIVE: 10 + i },
    });
    const out = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        svc.policyPublish(p, {
          idempotencyKey: `cp-${n}-${i}-key`,
          passportRef: passport.passportRef,
          document: doc(i),
          expectedVersion: 0,
        }),
      ),
    );
    expect(out.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of out)
      if (r.status === "rejected")
        expect((r.reason as { code?: string }).code).toBe(
          "STATE_VERSION_CONFLICT",
        );
    const rows = await d.pool.query(
      "SELECT version, parent_version FROM tastepolicy.policy_versions WHERE passport_ref=$1 ORDER BY version",
      [passport.passportRef],
    );
    expect(rows.rows).toEqual([{ version: 1, parent_version: null }]);
  }, 90000);

  it("concurrent override creation and revocation never leave an unrevoked permission behind a revocation", async () => {
    const p = await owner(),
      q = subjectProvider();
    const passport: any = await svc.initialize(p, init(), () => q.q);
    const made: any[] = [];
    await Promise.allSettled(
      Array.from({ length: 6 }, async (_, i) => {
        const o: any = await svc.overrideCreate(p, {
          idempotencyKey: `co-${n}-${i}-key`,
          passportRef: passport.passportRef,
          effect: "ALLOW_THROUGH_ASK",
          scope: { candidateId: `cand-${i}` },
          days: 2,
        });
        made.push(o);
        await svc.overrideRevoke(p, {
          passportRef: passport.passportRef,
          overrideId: o.overrideId,
        });
      }),
    );
    expect(made.length).toBeGreaterThan(0);
    const live = await d.pool.query(
      "SELECT count(*)::int AS n FROM tastepolicy.policy_overrides WHERE passport_ref=$1 AND revoked_at IS NULL",
      [passport.passportRef],
    );
    expect(live.rows[0].n).toBe(0);
  }, 90000);
});
