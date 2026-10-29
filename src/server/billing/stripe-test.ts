import "server-only";
import Stripe from "stripe";
import { z } from "zod";
import { platformFail as fail } from "@/lib/platform/types";
export type TestBillingEvent = {
  id: string;
  type: string;
  created: number;
  object: Record<string, unknown>;
};
export type TestSubscription = {
  id: string;
  customerId: string;
  status: string;
  correctPrice: boolean;
  invoice: null | {
    id: string;
    paid: boolean;
    amount: number;
    currency: string;
  };
};
export interface TestBillingProvider {
  customer(workspaceId: string): Promise<string>;
  checkout(
    workspaceId: string,
    customerId: string,
    key: string,
  ): Promise<{ id: string; url: string; expiresAt: string }>;
  subscription(subscriptionId: string): Promise<TestSubscription>;
  cancel(subscriptionId: string): Promise<void>;
  verify(raw: Buffer, signature: string): TestBillingEvent;
}
const id = z.string().regex(/^[A-Za-z0-9_]{4,190}$/);
const eventShape = z.object({
  id: id.regex(/^evt_/),
  type: z.string().max(100),
  created: z.number().int().nonnegative(),
  livemode: z.literal(false),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
});
export function stripeTestConfigured(
  env: Record<string, string | undefined> = process.env,
) {
  return (
    env.BILLING_TEST_ENABLED === "true" &&
    !!env.STRIPE_TEST_SECRET_KEY?.startsWith("sk_test_") &&
    !!env.STRIPE_TEST_WEBHOOK_SECRET?.startsWith("whsec_") &&
    !!env.STRIPE_TEST_PRO_PRICE_ID?.match(/^price_[A-Za-z0-9_]{1,160}$/)
  );
}
export function createStripeTestProvider(
  origin: string,
  env: Record<string, string | undefined> = process.env,
): TestBillingProvider {
  if (!stripeTestConfigured(env)) fail("NOT_CONFIGURED");
  const key = env.STRIPE_TEST_SECRET_KEY!,
    secret = env.STRIPE_TEST_WEBHOOK_SECRET!,
    priceId = env.STRIPE_TEST_PRO_PRICE_ID!;
  const base = new URL(origin);
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash
  )
    fail("NOT_CONFIGURED");
  const stripe = new Stripe(key, {
    maxNetworkRetries: 0,
    timeout: 5000,
    telemetry: false,
  });
  async function request<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError)
        fail("PROVIDER_UNAVAILABLE");
      throw error;
    }
  }
  async function price() {
    const p = await request(() => stripe.prices.retrieve(priceId));
    if (
      p.livemode ||
      !p.active ||
      p.currency !== "usd" ||
      p.unit_amount !== 4900 ||
      p.recurring?.interval !== "month" ||
      p.recurring.interval_count !== 1
    )
      fail("NOT_CONFIGURED");
  }
  return {
    async customer(workspaceId) {
      const c = await request(() =>
        stripe.customers.create(
          {
            metadata: {
              tastepolicy_workspace: workspaceId,
              tastepolicy_mode: "SANDBOX",
            },
          },
          { idempotencyKey: "tastepolicy-test-customer-" + workspaceId },
        ),
      );
      if (c.livemode) fail("INTEGRITY_ERROR");
      return c.id;
    },
    async checkout(workspaceId, customerId, key) {
      await price();
      const s = await request(() =>
        stripe.checkout.sessions.create(
          {
            mode: "subscription",
            customer: customerId,
            line_items: [{ price: priceId, quantity: 1 }],
            client_reference_id: workspaceId,
            subscription_data: {
              metadata: {
                tastepolicy_workspace: workspaceId,
                tastepolicy_mode: "SANDBOX",
              },
            },
            success_url: origin + "/developers/workspace?billing=test-return",
            cancel_url: origin + "/developers/workspace?billing=test-canceled",
          },
          { idempotencyKey: "tastepolicy-test-checkout-" + key },
        ),
      );
      if (s.livemode || !s.id.startsWith("cs_test_") || !s.url)
        fail("INTEGRITY_ERROR");
      const url = new URL(s.url);
      if (
        url.protocol !== "https:" ||
        url.hostname !== "checkout.stripe.com" ||
        url.port ||
        url.username ||
        url.password
      )
        fail("INTEGRITY_ERROR");
      return {
        id: s.id,
        url: s.url,
        expiresAt: new Date(s.expires_at * 1000).toISOString(),
      };
    },
    async subscription(subscriptionId) {
      if (!/^sub_[A-Za-z0-9_]{1,160}$/.test(subscriptionId))
        fail("INVALID_INPUT");
      const s = await request(() =>
        stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["latest_invoice"],
        }),
      );
      if (s.livemode || typeof s.customer !== "string") fail("INTEGRITY_ERROR");
      const invoice =
        typeof s.latest_invoice === "object" && s.latest_invoice !== null
          ? s.latest_invoice
          : null;
      return {
        id: s.id,
        customerId: s.customer,
        status: s.status,
        correctPrice:
          s.items.data.length === 1 &&
          s.items.data[0].price.id === priceId &&
          s.items.data[0].quantity === 1,
        invoice: invoice
          ? {
              id: invoice.id,
              paid: invoice.status === "paid",
              amount: invoice.amount_paid,
              currency: invoice.currency,
            }
          : null,
      };
    },
    async cancel(subscriptionId) {
      if (!/^sub_[A-Za-z0-9_]{1,160}$/.test(subscriptionId))
        fail("INVALID_INPUT");
      const s = await request(() =>
        stripe.subscriptions.cancel(subscriptionId),
      );
      if (s.livemode) fail("INTEGRITY_ERROR");
    },
    verify(raw, signature) {
      let event;
      try {
        event = eventShape.parse(
          stripe.webhooks.constructEvent(raw, signature, secret, 300),
        );
      } catch {
        fail("INVALID_INPUT");
      }
      return {
        id: event.id,
        type: event.type,
        created: event.created,
        object: event.data.object,
      };
    },
  };
}
