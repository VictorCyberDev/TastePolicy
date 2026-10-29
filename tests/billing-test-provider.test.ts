// @vitest-environment node
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import Stripe from "stripe";
import { platformDatabase, account } from "./platform-fixtures";
import { WorkspaceService } from "@/server/platform/workspace-service";
import { TestBillingService } from "@/server/billing/service";
import {
  createStripeTestProvider,
  stripeTestConfigured,
  type TestBillingProvider,
  type TestSubscription,
} from "@/server/billing/stripe-test";
import { billingWebhookBody } from "@/server/billing/body";
let d: Awaited<ReturnType<typeof platformDatabase>>;
beforeAll(async () => {
  d = await platformDatabase();
}, 30000);
afterAll(async () => d?.db.close());
const secret = "whsec_" + randomBytes(32).toString("hex");
const config = {
  BILLING_TEST_ENABLED: "true",
  STRIPE_TEST_SECRET_KEY: "sk_test_" + randomBytes(24).toString("hex"),
  STRIPE_TEST_WEBHOOK_SECRET: secret,
  STRIPE_TEST_PRO_PRICE_ID: "price_synthetic_pro",
};
const verifier = createStripeTestProvider("https://tastepolicy.test", config);
const stripe = new Stripe(config.STRIPE_TEST_SECRET_KEY);
async function world() {
  const a = await account(d),
    workspace = new WorkspaceService(d.store.pool),
    w = (await workspace.mutate(a.principal, "create-workspace", {
      displayLabel: "SYNTHETIC TEST",
      idempotencyKey: randomUUID(),
    })) as { workspaceId: string };
  const n = randomUUID().replaceAll("-", ""),
    customerId = "cus_" + n,
    checkoutId = "cs_test_" + n,
    subscriptionId = "sub_" + n;
  let subscription: TestSubscription = {
    id: subscriptionId,
    customerId,
    status: "active",
    correctPrice: true,
    invoice: { id: "in_" + n, paid: true, amount: 4900, currency: "usd" },
  };
  const provider: TestBillingProvider = {
    customer: vi.fn(async () => customerId),
    checkout: vi.fn(async () => ({
      id: checkoutId,
      url: "https://checkout.stripe.com/c/pay/" + checkoutId,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    })),
    subscription: vi.fn(async () => subscription),
    cancel: vi.fn(async () => {
      subscription = { ...subscription, status: "canceled" };
    }),
    verify: verifier.verify,
  };
  const service = new TestBillingService(d.store.pool, provider);
  const signed = (
    type: string,
    object: Record<string, unknown>,
    eventId = "evt_" + randomUUID().replaceAll("-", ""),
    livemode = false,
  ) => {
    const raw = Buffer.from(
      JSON.stringify({
        id: eventId,
        type,
        created: Math.floor(Date.now() / 1000),
        livemode,
        data: { object },
      }),
    );
    return {
      raw,
      signature: stripe.webhooks.generateTestHeaderString({
        payload: raw.toString(),
        secret,
      }),
    };
  };
  const completion = () =>
    signed("checkout.session.completed", {
      id: checkoutId,
      mode: "subscription",
      customer: customerId,
      subscription: subscriptionId,
    });
  return {
    a,
    ...w,
    provider,
    service,
    customerId,
    checkoutId,
    subscriptionId,
    signed,
    completion,
    setSubscription: (v: Partial<TestSubscription>) => {
      subscription = { ...subscription, ...v };
    },
  };
}
it("requires a real session, fresh authentication, strict input and owned workspace before provider work", async () => {
  const w = await world(),
    other = await account(d),
    raw = { workspaceId: w.workspaceId, idempotencyKey: randomUUID() };
  await expect(w.service.checkout(other.principal, raw)).rejects.toMatchObject({
    code: "ACCESS_DENIED",
  });
  await expect(
    w.service.checkout({ ...w.a.principal, kind: "CREDENTIAL" }, raw),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  await expect(
    w.service.checkout(
      {
        ...w.a.principal,
        authenticatedAt: new Date(Date.now() - 600000).toISOString(),
      },
      raw,
    ),
  ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
  await expect(
    w.service.checkout(w.a.principal, { ...raw, mode: "LIVE" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(w.provider.customer).not.toHaveBeenCalled();
});
it("coalesces pending checkout and replays the same request without a second provider session", async () => {
  const w = await world(),
    raw = { workspaceId: w.workspaceId, idempotencyKey: randomUUID() };
  const a = await w.service.checkout(w.a.principal, raw),
    b = await w.service.checkout(w.a.principal, raw),
    c = await w.service.checkout(w.a.principal, {
      ...raw,
      idempotencyKey: randomUUID(),
    });
  expect(a).toEqual(b);
  expect(c).toEqual(a);
  expect(w.provider.checkout).toHaveBeenCalledTimes(1);
  expect(a).toMatchObject({ mode: "SANDBOX", charged: false });
  expect(
    (
      await d.store.pool.query(
        "SELECT plan,provider FROM tastepolicy.workspace_subscriptions WHERE workspace_id=$1 AND mode='LIVE'",
        [w.workspaceId],
      )
    ).rows[0],
  ).toEqual({ plan: "FREE", provider: "NONE" });
});
it("validates actual SDK signatures, rejects stale/tampered/live-mode events and never updates live entitlement", async () => {
  const w = await world();
  await w.service.checkout(w.a.principal, {
    workspaceId: w.workspaceId,
    idempotencyKey: randomUUID(),
  });
  const e = w.completion();
  await expect(
    w.service.webhook(Buffer.from(e.raw.toString() + " "), e.signature),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const expired = stripe.webhooks.generateTestHeaderString({
    payload: e.raw.toString(),
    secret,
    timestamp: Math.floor(Date.now() / 1000) - 600,
  });
  await expect(w.service.webhook(e.raw, expired)).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  const live = w.signed(
    "checkout.session.completed",
    {
      id: w.checkoutId,
      mode: "subscription",
      customer: w.customerId,
      subscription: w.subscriptionId,
    },
    undefined,
    true,
  );
  await expect(
    w.service.webhook(live.raw, live.signature),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(await w.service.webhook(e.raw, e.signature)).toMatchObject({
    plan: "PRO",
    state: "ACTIVE",
    mode: "SANDBOX",
    liveEntitlementChanged: false,
  });
  expect(await w.service.webhook(e.raw, e.signature)).toMatchObject({
    replay: true,
  });
  expect(
    (
      await d.store.pool.query(
        "SELECT count(*)::int n FROM tastepolicy.workspace_billing_events WHERE workspace_id=$1",
        [w.workspaceId],
      )
    ).rows[0].n,
  ).toBe(1);
  expect(
    (
      await d.store.pool.query(
        "SELECT plan FROM tastepolicy.workspace_subscriptions WHERE workspace_id=$1 AND mode='LIVE'",
        [w.workspaceId],
      )
    ).rows[0].plan,
  ).toBe("FREE");
});
it("uses canonical current subscription state for out-of-order events and cancellation", async () => {
  const w = await world();
  await w.service.checkout(w.a.principal, {
    workspaceId: w.workspaceId,
    idempotencyKey: randomUUID(),
  });
  const first = w.completion();
  await w.service.webhook(first.raw, first.signature);
  await expect(
    w.service.checkout(w.a.principal, {
      workspaceId: w.workspaceId,
      idempotencyKey: randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  expect(
    await w.service.cancel(w.a.principal, { workspaceId: w.workspaceId }),
  ).toMatchObject({ confirmation: "WAIT_FOR_SIGNED_WEBHOOK" });
  const old = w.signed("customer.subscription.updated", {
    id: w.subscriptionId,
    customer: w.customerId,
    status: "active",
  });
  expect(await w.service.webhook(old.raw, old.signature)).toMatchObject({
    plan: "FREE",
    state: "CANCELED",
  });
  const again = w.signed("invoice.paid", {
    id: "in_old",
    customer: w.customerId,
    parent: { subscription_details: { subscription: w.subscriptionId } },
  });
  expect(await w.service.webhook(again.raw, again.signature)).toMatchObject({
    plan: "FREE",
    state: "CANCELED",
  });
});
it("refuses a mismatched customer or unconfigured paid price, and lets early subscription events retry", async () => {
  const w = await world();
  await w.service.checkout(w.a.principal, {
    workspaceId: w.workspaceId,
    idempotencyKey: randomUUID(),
  });
  const early = w.signed("customer.subscription.updated", {
    id: w.subscriptionId,
    customer: w.customerId,
  });
  await expect(
    w.service.webhook(early.raw, early.signature),
  ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  w.setSubscription({ customerId: "cus_other" });
  const e = w.completion();
  await expect(w.service.webhook(e.raw, e.signature)).rejects.toMatchObject({
    code: "INTEGRITY_ERROR",
  });
  w.setSubscription({ customerId: w.customerId, correctPrice: false });
  expect(await w.service.webhook(e.raw, e.signature)).toMatchObject({
    plan: "FREE",
    state: "UNCONFIGURED",
  });
});
it("does not accept live keys and requires the complete deliberate test configuration", () => {
  expect(stripeTestConfigured({})).toBe(false);
  expect(stripeTestConfigured(config)).toBe(true);
  expect(
    stripeTestConfigured({
      ...config,
      STRIPE_TEST_SECRET_KEY: "sk_live_" + randomBytes(16).toString("hex"),
    }),
  ).toBe(false);
  expect(() =>
    createStripeTestProvider("https://tastepolicy.test", {
      ...config,
      BILLING_TEST_ENABLED: "false",
    }),
  ).toThrow("NOT_CONFIGURED");
});
it("bounds raw webhook bytes and time without rewriting the signed payload", async () => {
  const bytes = Buffer.from('{"event":"SYNTHETIC"}');
  expect(
    await billingWebhookBody(
      new Request("https://tastepolicy.test", { method: "POST", body: bytes }),
    ),
  ).toEqual(bytes);
  await expect(
    billingWebhookBody(
      new Request("https://tastepolicy.test", {
        method: "POST",
        body: "x".repeat(30),
      }),
      100,
      20,
    ),
  ).rejects.toMatchObject({ code: "BODY_TOO_LARGE" });
  const stalled = new Request("https://tastepolicy.test", {
    method: "POST",
    body: new ReadableStream({ start() {} }),
    duplex: "half",
  } as RequestInit);
  await expect(billingWebhookBody(stalled, 10)).rejects.toMatchObject({
    code: "BODY_READ_TIMEOUT",
  });
});
it("account deletion cascades all application-owned provider billing records", async () => {
  const w = await world();
  await w.service.checkout(w.a.principal, {
    workspaceId: w.workspaceId,
    idempotencyKey: randomUUID(),
  });
  const e = w.completion();
  await w.service.webhook(e.raw, e.signature);
  await d.service.delete(
    w.a.principal,
    { confirmation: "DELETE ACCOUNT", idempotencyKey: randomUUID() },
    true,
  );
  for (const table of [
    "billing_test_customers",
    "billing_test_checkouts",
    "billing_test_events",
    "workspace_subscriptions",
    "workspace_billing_events",
  ])
    expect(
      (
        await d.store.pool.query(
          `SELECT 1 FROM tastepolicy.${table} WHERE workspace_id=$1`,
          [w.workspaceId],
        )
      ).rows,
    ).toHaveLength(0);
});
