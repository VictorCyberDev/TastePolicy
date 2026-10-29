import { z } from "zod";
import { getStateStore } from "@/server/state/postgres";
import { publicOrigin } from "@/server/platform/origin";
import {
  trustedOrigin,
  sessionPrincipal,
  safePlatformError,
} from "@/server/platform/http";
import { platformFail as fail } from "@/lib/platform/types";
import { readJsonBody } from "@/server/taste/read-body";
import {
  createStripeTestProvider,
  stripeTestConfigured,
} from "@/server/billing/stripe-test";
import { TestBillingService } from "@/server/billing/service";
import { WorkspaceService } from "@/server/platform/workspace-service";
import { acquireDemoBudget } from "@/server/taste/budget";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(
  request: Request,
  context: { params: Promise<{ operation: string }> },
) {
  const requestId = crypto.randomUUID();
  let release: (() => void) | null = null;
  try {
    if (!trustedOrigin(request) || request.headers.has("authorization"))
      fail("ACCESS_DENIED");
    if (
      request.headers.get("content-type")?.split(";")[0].trim() !==
      "application/json"
    )
      fail("INVALID_INPUT");
    const store = getStateStore();
    if (!store) fail("NOT_CONFIGURED");
    const p = await sessionPrincipal(request);
    release = acquireDemoBudget();
    if (!release) fail("RATE_LIMITED");
    const raw = await readJsonBody(request),
      { operation } = await context.params;
    if (operation === "status") {
      const v = z.strictObject({ workspaceId: z.uuid() }).safeParse(raw);
      if (!v.success) fail("INVALID_INPUT");
      await new WorkspaceService(store.pool).billingWorkspace(
        p,
        v.data.workspaceId,
        false,
      );
      const rows = await store.pool.query(
        "SELECT mode,plan,state,provider,updated_at FROM tastepolicy.workspace_subscriptions WHERE workspace_id=$1 ORDER BY mode",
        [v.data.workspaceId],
      );
      return Response.json(
        {
          status: "available",
          data: {
            mode: "SANDBOX",
            configured: stripeTestConfigured(),
            plans: rows.rows,
            price: { currency: "usd", amountMinor: 4900, interval: "month" },
            liveEntitlementChanged: false,
          },
          requestId,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!["checkout", "cancel"].includes(operation)) fail("INVALID_INPUT");
    const service = new TestBillingService(
      store.pool,
      createStripeTestProvider(publicOrigin(request)),
    );
    const data =
      operation === "checkout"
        ? await service.checkout(p, raw)
        : await service.cancel(p, raw);
    return Response.json(
      { status: "available", data, requestId },
      { headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
    );
  } catch (e) {
    return safePlatformError(e, requestId);
  } finally {
    release?.();
  }
}
