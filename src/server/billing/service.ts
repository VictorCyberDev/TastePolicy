import "server-only";
import type { Pool, PoolClient } from "pg";
import { createHash } from "node:crypto";
import { z } from "zod";
import { WorkspaceService } from "@/server/platform/workspace-service";
import { platformFail as fail, type Principal } from "@/lib/platform/types";
import type { TestBillingProvider } from "./stripe-test";
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
const checkoutInput = z.strictObject({
  workspaceId: z.uuid(),
  idempotencyKey: z.string().min(8).max(128),
});
const valueId = (v: unknown, prefix: string) =>
  typeof v === "string" &&
  new RegExp("^" + prefix + "[A-Za-z0-9_]{1,180}$").test(v)
    ? v
    : fail("INVALID_INPUT");
export class TestBillingService {
  constructor(
    readonly pool: Pool,
    readonly provider: TestBillingProvider,
    readonly clock = () => new Date().toISOString(),
  ) {}
  private async transaction<T>(fn: (c: PoolClient) => Promise<T>) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const result = await fn(c);
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  private async owner(c: PoolClient, p: Principal, workspaceId: string) {
    if (p.kind !== "SESSION" || !p.sessionId) fail("ACCESS_DENIED");
    const user = await c.query(
      "SELECT id FROM tastepolicy.platform_auth_user WHERE id=$1 FOR UPDATE",
      [p.userId],
    );
    if (!user.rows.length) fail("AUTH_REQUIRED");
    const workspace = await c.query(
      "SELECT workspace_id FROM tastepolicy.developer_workspaces WHERE workspace_id=$1 AND user_id=$2 FOR UPDATE",
      [workspaceId, p.userId],
    );
    if (!workspace.rows.length) fail("ACCESS_DENIED");
    await this.session(c, p);
  }
  private async session(c: PoolClient, p: Principal) {
    const session = await c.query(
      'SELECT id FROM tastepolicy.platform_auth_session WHERE id=$1 AND "userId"=$2 AND "expiresAt">$3',
      [p.sessionId, p.userId, this.clock()],
    );
    if (!session.rows.length) fail("AUTH_REQUIRED");
    if (
      !Number.isFinite(Date.parse(p.authenticatedAt)) ||
      Date.parse(p.authenticatedAt) < Date.parse(this.clock()) - 300000
    )
      fail("RECENT_AUTH_REQUIRED");
  }
  async checkout(p: Principal, raw: unknown) {
    const parsed = checkoutInput.safeParse(raw);
    if (!parsed.success) fail("INVALID_INPUT");
    const v = parsed.data;
    await new WorkspaceService(this.pool, this.clock).billingWorkspace(
      p,
      v.workspaceId,
    );
    const existing = await this.pool.query(
      "SELECT provider_customer_id FROM tastepolicy.billing_test_customers WHERE workspace_id=$1",
      [v.workspaceId],
    );
    const customerId =
      existing.rows[0]?.provider_customer_id ??
      (await this.provider.customer(v.workspaceId));
    valueId(customerId, "cus_");
    await this.pool.query(
      "INSERT INTO tastepolicy.billing_test_customers(workspace_id,provider_customer_id,created_at) VALUES($1,$2,$3) ON CONFLICT(workspace_id) DO NOTHING",
      [v.workspaceId, customerId, this.clock()],
    );
    return this.transaction(async (c) => {
      await this.owner(c, p, v.workspaceId);
      const customer = (
        await c.query(
          "SELECT provider_customer_id FROM tastepolicy.billing_test_customers WHERE workspace_id=$1",
          [v.workspaceId],
        )
      ).rows[0];
      if (customer?.provider_customer_id !== customerId)
        fail("INTEGRITY_ERROR");
      const h = digest(JSON.stringify(v)),
        prior = (
          await c.query(
            "SELECT payload_hash,checkout_id,checkout_url FROM tastepolicy.billing_test_checkouts WHERE workspace_id=$1 AND idempotency_key=$2",
            [v.workspaceId, v.idempotencyKey],
          )
        ).rows[0];
      const response = (r: { checkout_id: string; checkout_url: string }) => ({
        mode: "SANDBOX",
        provider: "STRIPE",
        checkoutId: r.checkout_id,
        url: r.checkout_url,
        charged: false,
      });
      if (prior) {
        if (prior.payload_hash !== h) fail("IDEMPOTENCY_KEY_CONFLICT");
        return response(prior);
      }
      const active = (
        await c.query(
          "SELECT state FROM tastepolicy.workspace_subscriptions WHERE workspace_id=$1 AND mode='SANDBOX' AND provider='STRIPE'",
          [v.workspaceId],
        )
      ).rows[0];
      if (active?.state === "ACTIVE") fail("ACCESS_DENIED");
      // One open checkout per workspace, even across distinct request keys.
      const pending = (
        await c.query(
          "SELECT checkout_id,checkout_url FROM tastepolicy.billing_test_checkouts WHERE workspace_id=$1 AND subscription_id IS NULL AND expires_at>$2 ORDER BY created_at DESC LIMIT 1",
          [v.workspaceId, this.clock()],
        )
      ).rows[0];
      if (pending) return response(pending);
      const session = await this.provider.checkout(
        v.workspaceId,
        customerId,
        digest(v.workspaceId + ":" + v.idempotencyKey),
      );
      valueId(session.id, "cs_test_");
      const url = new URL(session.url);
      if (
        url.protocol !== "https:" ||
        url.hostname !== "checkout.stripe.com" ||
        url.port ||
        url.username ||
        url.password ||
        !Number.isFinite(Date.parse(session.expiresAt)) ||
        Date.parse(session.expiresAt) <= Date.parse(this.clock())
      )
        fail("INTEGRITY_ERROR");
      await this.session(c, p);
      await c.query(
        "INSERT INTO tastepolicy.billing_test_checkouts(checkout_id,workspace_id,idempotency_key,payload_hash,checkout_url,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          session.id,
          v.workspaceId,
          v.idempotencyKey,
          h,
          session.url,
          this.clock(),
          session.expiresAt,
        ],
      );
      return response({ checkout_id: session.id, checkout_url: session.url });
    });
  }
  async cancel(p: Principal, raw: unknown) {
    const v = z.strictObject({ workspaceId: z.uuid() }).safeParse(raw);
    if (!v.success) fail("INVALID_INPUT");
    return this.transaction(async (c) => {
      await this.owner(c, p, v.data.workspaceId);
      const row = (
        await c.query(
          "SELECT provider_customer_id,provider_subscription_id FROM tastepolicy.workspace_subscriptions WHERE workspace_id=$1 AND mode='SANDBOX' AND provider='STRIPE'",
          [v.data.workspaceId],
        )
      ).rows[0];
      if (!row?.provider_subscription_id) fail("INVALID_INPUT");
      const sub = await this.provider.subscription(
        row.provider_subscription_id,
      );
      if (sub.customerId !== row.provider_customer_id) fail("INTEGRITY_ERROR");
      await this.provider.cancel(sub.id);
      return {
        mode: "SANDBOX",
        cancellationRequested: true,
        confirmation: "WAIT_FOR_SIGNED_WEBHOOK",
        liveEntitlementChanged: false,
      };
    });
  }
  async webhook(raw: Buffer, signature: string) {
    const e = this.provider.verify(raw, signature),
      h = digest(raw.toString("utf8"));
    const supported = [
      "checkout.session.completed",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.paid",
      "invoice.payment_failed",
    ];
    if (!supported.includes(e.type))
      return { accepted: true, ignored: true, mode: "SANDBOX" };
    const customerId = valueId(e.object.customer, "cus_");
    return this.transaction(async (c) => {
      // Serialize each customer's canonical provider refresh. The SDK has a 5s
      // deadline/no retry. This bounded billing lock is independent of Qloo evaluation.
      const owner = (
        await c.query(
          "SELECT workspace_id FROM tastepolicy.billing_test_customers WHERE provider_customer_id=$1 FOR UPDATE",
          [customerId],
        )
      ).rows[0];
      if (!owner) return { accepted: true, ignored: true, mode: "SANDBOX" };
      const old = (
        await c.query(
          "SELECT payload_hash FROM tastepolicy.billing_test_events WHERE event_id=$1",
          [e.id],
        )
      ).rows[0];
      if (old) {
        if (old.payload_hash !== h) fail("INTEGRITY_ERROR");
        return { accepted: true, replay: true, mode: "SANDBOX" };
      }
      let subscriptionId: string;
      if (e.type === "checkout.session.completed") {
        const checkoutId = valueId(e.object.id, "cs_test_");
        subscriptionId = valueId(e.object.subscription, "sub_");
        if (e.object.mode !== "subscription") fail("INVALID_INPUT");
        const row = (
          await c.query(
            "SELECT subscription_id FROM tastepolicy.billing_test_checkouts WHERE checkout_id=$1 AND workspace_id=$2",
            [checkoutId, owner.workspace_id],
          )
        ).rows[0];
        if (!row) fail("ACCESS_DENIED");
        if (row.subscription_id && row.subscription_id !== subscriptionId)
          fail("INTEGRITY_ERROR");
        await c.query(
          "UPDATE tastepolicy.billing_test_checkouts SET subscription_id=$1 WHERE checkout_id=$2",
          [subscriptionId, checkoutId],
        );
      } else {
        const parent = e.object.parent as
          { subscription_details?: { subscription?: unknown } } | undefined;
        subscriptionId = valueId(
          e.type.startsWith("customer.subscription.")
            ? e.object.id
            : (parent?.subscription_details?.subscription ??
                e.object.subscription),
          "sub_",
        );
        const linked = await c.query(
          "SELECT checkout_id FROM tastepolicy.billing_test_checkouts WHERE workspace_id=$1 AND subscription_id=$2",
          [owner.workspace_id, subscriptionId],
        );
        // A subscription event may precede checkout completion. Let Stripe retry.
        if (!linked.rows.length) fail("PROVIDER_UNAVAILABLE");
      }
      const subscription = await this.provider.subscription(subscriptionId);
      if (
        subscription.customerId !== customerId ||
        subscription.id !== subscriptionId
      )
        fail("INTEGRITY_ERROR");
      const current = (
        await c.query(
          "SELECT provider_subscription_id,state FROM tastepolicy.workspace_subscriptions WHERE workspace_id=$1 AND mode='SANDBOX' AND provider='STRIPE'",
          [owner.workspace_id],
        )
      ).rows[0];
      if (
        current?.provider_subscription_id &&
        current.provider_subscription_id !== subscriptionId &&
        (e.type !== "checkout.session.completed" ||
          current.state !== "CANCELED")
      ) {
        await c.query(
          "INSERT INTO tastepolicy.billing_test_events(event_id,workspace_id,event_type,payload_hash,provider_created,processed_at) VALUES($1,$2,$3,$4,$5,$6)",
          [e.id, owner.workspace_id, e.type, h, e.created, this.clock()],
        );
        return { accepted: true, ignored: true, mode: "SANDBOX" };
      }
      const invoice = subscription.invoice;
      const paid =
        subscription.status === "active" &&
        subscription.correctPrice &&
        invoice?.paid &&
        invoice.amount === 4900 &&
        invoice.currency === "usd";
      const state = paid
        ? "ACTIVE"
        : subscription.status === "canceled"
          ? "CANCELED"
          : subscription.status === "past_due"
            ? "PAST_DUE"
            : "UNCONFIGURED";
      await c.query(
        "INSERT INTO tastepolicy.workspace_subscriptions(workspace_id,mode,plan,state,provider,provider_customer_id,provider_subscription_id,updated_at) VALUES($1,'SANDBOX',$2,$3,'STRIPE',$4,$5,$6) ON CONFLICT(workspace_id,mode) DO UPDATE SET plan=excluded.plan,state=excluded.state,provider=excluded.provider,provider_customer_id=excluded.provider_customer_id,provider_subscription_id=excluded.provider_subscription_id,updated_at=excluded.updated_at",
        [
          owner.workspace_id,
          paid ? "PRO" : "FREE",
          state,
          customerId,
          subscriptionId,
          this.clock(),
        ],
      );
      if (paid && invoice) {
        valueId(invoice.id, "in_");
        await c.query(
          "INSERT INTO tastepolicy.workspace_billing_events(event_id,workspace_id,mode,kind,amount_minor,currency,at) VALUES($1,$2,'SANDBOX','STRIPE_TEST_INVOICE_PAID',$3,'usd',$4) ON CONFLICT(event_id) DO NOTHING",
          [
            "stripe_invoice:" + invoice.id,
            owner.workspace_id,
            invoice.amount,
            this.clock(),
          ],
        );
      }
      await c.query(
        "INSERT INTO tastepolicy.billing_test_events(event_id,workspace_id,event_type,payload_hash,provider_created,processed_at) VALUES($1,$2,$3,$4,$5,$6)",
        [e.id, owner.workspace_id, e.type, h, e.created, this.clock()],
      );
      return {
        accepted: true,
        replay: false,
        mode: "SANDBOX",
        plan: paid ? "PRO" : "FREE",
        state,
        liveEntitlementChanged: false,
      };
    });
  }
}
