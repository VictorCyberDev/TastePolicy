import "server-only";
import { resolveOpenPlace } from "@/server/open/context";
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
    // Open providers first and always; Google only enriches when configured.
    const resolved = resolveOpenPlace(
      { entity: input.entity, origin: input.origin },
      {
        heigitKey: serverEnvironment.heigitApiKey,
        mapillaryToken: serverEnvironment.mapillaryAccessToken,
        google: {
          configured: Boolean(key),
          places: googlePlaceProvider(key),
          routes: googleRouteProvider(key),
        },
        now: new Date().toISOString(),
      },
    );
    // A hard ceiling so a slow public service can never hang the experience.
    const context = await Promise.race([
      resolved,
      new Promise<null>((r) => setTimeout(() => r(null), 24_000)),
    ]);
    if (!context)
      return Response.json(
        { status: "unavailable", reason: "timeout" },
        { status: 504, headers },
      );
    return Response.json({ status: "available", data: context }, { headers });
  } finally {
    release();
  }
}
