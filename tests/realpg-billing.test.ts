// @vitest-environment node
// SYNTHETIC provider adapter; real PostgreSQL connections, auth, row locks and SQL.
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { realDatabase, REAL_URL } from "./realpg-fixture";
import { WorkspaceService } from "@/server/platform/workspace-service";
import { TestBillingService } from "@/server/billing/service";
import type { TestBillingProvider } from "@/server/billing/stripe-test";
import type { Principal } from "@/lib/platform/types";
const suite = REAL_URL ? describe : describe.skip;
suite("provider test billing under PostgreSQL concurrency", () => {
  let d: Awaited<ReturnType<typeof realDatabase>>;
  beforeAll(async () => {
    d = await realDatabase();
  }, 60000);
  afterAll(async () => d?.close());
  async function owner() {
    const signup = await d.auth.api.signUpEmail({
      body: {
        name: "SYNTHETIC TEST",
        email: randomUUID() + "@example.test",
        password: randomBytes(24).toString("hex"),
      },
      asResponse: true,
    });
    const cookie = signup.headers
        .getSetCookie()
        .map((x) => x.split(";")[0])
        .join("; "),
      headers = new Headers({ cookie });
    const s = (await d.auth.api.getSession({ headers }))!;
    const p: Principal = {
      kind: "SESSION",
      userId: s.user.id,
      sessionId: s.session.id,
      authenticatedAt: s.session.createdAt.toISOString(),
    };
    const workspace = (await new WorkspaceService(d.pool).mutate(
      p,
      "create-workspace",
      { idempotencyKey: randomUUID(), displayLabel: "SYNTHETIC concurrency" },
    )) as { workspaceId: string };
    return { p, headers, ...workspace };
  }
  function adapter() {
    const suffix = randomBytes(10).toString("hex"),
      customerId = "cus_" + suffix,
      checkoutId = "cs_test_" + suffix,
      subscriptionId = "sub_" + suffix;
    let checkoutCalls = 0,
      subscriptionCalls = 0;
    const provider: TestBillingProvider = {
      customer: async () => customerId,
      checkout: async () => {
        checkoutCalls++;
        return {
          id: checkoutId,
          url: "https://checkout.stripe.com/c/pay/" + checkoutId,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        };
      },
      subscription: async () => {
        subscriptionCalls++;
        return {
          id: subscriptionId,
          customerId,
          status: "active",
          correctPrice: true,
          invoice: {
            id: "in_" + suffix,
            paid: true,
            amount: 4900,
            currency: "usd",
          },
        };
      },
      cancel: async () => {},
      verify: (raw) => {
        const e = JSON.parse(raw.toString());
        return { ...e, object: e.data.object };
      },
    };
    return {
      provider,
      customerId,
      checkoutId,
      subscriptionId,
      calls: () => ({ checkoutCalls, subscriptionCalls }),
    };
  }
  it("one concurrent pending checkout and one invoice for duplicate signed-event processing", async () => {
    const w = await owner(),
      a = adapter(),
      service = new TestBillingService(d.pool, a.provider);
    const results = await Promise.all([
      service.checkout(w.p, {
        workspaceId: w.workspaceId,
        idempotencyKey: randomUUID(),
      }),
      service.checkout(w.p, {
        workspaceId: w.workspaceId,
        idempotencyKey: randomUUID(),
      }),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(a.calls().checkoutCalls).toBe(1);
    const raw = Buffer.from(
      JSON.stringify({
        id: "evt_" + randomBytes(10).toString("hex"),
        type: "checkout.session.completed",
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: a.checkoutId,
            customer: a.customerId,
            subscription: a.subscriptionId,
            mode: "subscription",
          },
        },
      }),
    );
    const events = await Promise.all([
      service.webhook(raw, "SYNTHETIC ADAPTER"),
      service.webhook(raw, "SYNTHETIC ADAPTER"),
    ]);
    expect(events.filter((x) => "replay" in x && x.replay)).toHaveLength(1);
    expect(a.calls().subscriptionCalls).toBe(1);
    expect(
      (
        await d.pool.query(
          "SELECT count(*)::int n FROM tastepolicy.workspace_billing_events WHERE workspace_id=$1",
          [w.workspaceId],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await d.pool.query(
          "SELECT plan FROM tastepolicy.workspace_subscriptions WHERE workspace_id=$1 AND mode='LIVE'",
          [w.workspaceId],
        )
      ).rows[0].plan,
    ).toBe("FREE");
  }, 30000);
  it("does not return a new checkout after the authorizing session was revoked during provider work", async () => {
    const w = await owner(),
      a = adapter();
    let entered!: () => void, finish!: () => void;
    const started = new Promise<void>((r) => {
        entered = r;
      }),
      gate = new Promise<void>((r) => {
        finish = r;
      });
    const base = a.provider.checkout;
    a.provider.checkout = async (...args) => {
      entered();
      await gate;
      return base(...args);
    };
    const work = new TestBillingService(d.pool, a.provider).checkout(w.p, {
      workspaceId: w.workspaceId,
      idempotencyKey: randomUUID(),
    });
    const stopped = expect(work).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
    });
    await started;
    await d.auth.api.signOut({ headers: w.headers });
    finish();
    await stopped;
    expect(
      (
        await d.pool.query(
          "SELECT 1 FROM tastepolicy.billing_test_checkouts WHERE workspace_id=$1",
          [w.workspaceId],
        )
      ).rows,
    ).toHaveLength(0);
  }, 30000);
});
