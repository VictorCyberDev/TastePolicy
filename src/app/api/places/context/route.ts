import "server-only";
import { resolvePlaceContext } from "@/server/places/context";
import {
  googlePlaceProvider,
  googleRouteProvider,
} from "@/server/places/google";
import { acquireDemoBudget } from "@/server/taste/budget";
import { parsePlaceContextBody } from "@/server/places/validation";
import { serverEnvironment } from "@/lib/env/server";

export const maxDuration = 30;
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (
    request.headers.get("origin") !==
      `${url.protocol}//${request.headers.get("host") ?? url.host}` ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return Response.json(
      { status: "error", code: "ORIGIN_NOT_ALLOWED" },
      { status: 403, headers },
    );
  const text = await request.text().catch(() => "");
  const input = text.length <= 4096 ? parsePlaceContextBody(text) : null;
  if (!input)
    return Response.json(
      { status: "error", code: "INVALID_INPUT" },
      { status: 400, headers },
    );
  const release = acquireDemoBudget();
  if (!release)
    return Response.json(
      { status: "unavailable", reason: "rate_limited" },
      { status: 429, headers: { ...headers, "Retry-After": "60" } },
    );
  try {
    const key = serverEnvironment.googleMapsApiKey;
    const context = await resolvePlaceContext(
      input,
      googlePlaceProvider(key),
      googleRouteProvider(key),
      new Date().toISOString(),
    );
    return Response.json({ status: "available", data: context }, { headers });
  } finally {
    release();
  }
}
