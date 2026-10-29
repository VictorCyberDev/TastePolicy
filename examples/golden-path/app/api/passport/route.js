import { timingSafeEqual } from "node:crypto";
import {
  TastePolicyClient,
  TastePolicyError,
} from "@victorcyberdev/tastepolicy-sdk";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Server-to-server example: an application gateway token is distinct from the
// TastePolicy credential and is never rendered in this app's page.
export async function GET(request) {
  const configured = process.env.APP_GATEWAY_TOKEN;
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (!configured || configured.length < 32)
    return Response.json({ code: "NOT_CONFIGURED" }, { status: 503 });
  const a = Buffer.from(configured),
    b = Buffer.from(supplied);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    return Response.json({ code: "ACCESS_DENIED" }, { status: 401 });
  try {
    const client = new TastePolicyClient(
      "https://tastepolicy.vercel.app",
      process.env.TASTEPOLICY_API_KEY,
    );
    const summary = await client.passport({
      passportRef: process.env.TASTEPOLICY_PASSPORT_REF,
    });
    return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json(
      { code: e instanceof TastePolicyError ? e.code : "UPSTREAM_FAILURE" },
      {
        status: e instanceof TastePolicyError ? e.status : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
