import { getStateStore } from "@/server/state/postgres";
import { publicOrigin } from "@/server/platform/origin";
import { safePlatformError } from "@/server/platform/http";
import { platformFail as fail } from "@/lib/platform/types";
import { createStripeTestProvider } from "@/server/billing/stripe-test";
import { TestBillingService } from "@/server/billing/service";
import { billingWebhookBody } from "@/server/billing/body";
export const runtime = "nodejs";
export const maxDuration = 30;
let inFlight = 0;
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let admitted = false;
  try {
    const signature = request.headers.get("stripe-signature");
    if (
      !signature ||
      signature.length > 1024 ||
      request.headers.get("content-type")?.split(";")[0].trim() !==
        "application/json"
    )
      fail("INVALID_INPUT");
    if (inFlight >= 4) fail("RATE_LIMITED");
    inFlight++;
    admitted = true;
    const store = getStateStore();
    if (!store) fail("NOT_CONFIGURED");
    const provider = createStripeTestProvider(publicOrigin(request));
    const raw = await billingWebhookBody(request);
    const result = await new TestBillingService(store.pool, provider).webhook(
      raw,
      signature,
    );
    return Response.json(result, {
      headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
    });
  } catch (e) {
    return safePlatformError(e, requestId);
  } finally {
    if (admitted) inFlight--;
  }
}
