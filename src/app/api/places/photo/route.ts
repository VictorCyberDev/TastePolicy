import "server-only";
import { serverEnvironment } from "@/lib/env/server";
import { acquireDemoBudget } from "@/server/taste/budget";

// Streams a provider photo without exposing the API key. Provider imagery is
// never stored or cached by TastePolicy; the browser may not keep it either.
const REF = /^places\/[A-Za-z0-9_-]{1,200}\/photos\/[A-Za-z0-9_-]{1,400}$/;
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const ref = new URL(request.url).searchParams.get("ref") ?? "";
  const key = serverEnvironment.googleMapsApiKey;
  if (!REF.test(ref) || !key)
    return new Response(null, { status: key ? 400 : 404, headers });
  const release = acquireDemoBudget();
  if (!release) return new Response(null, { status: 429, headers });
  try {
    const upstream = await fetch(
      `https://places.googleapis.com/v1/${ref}/media?maxWidthPx=1200`,
      {
        headers: { "X-Goog-Api-Key": key },
        signal: AbortSignal.timeout(6000),
        redirect: "follow",
      },
    );
    const type = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !/^image\/(jpeg|png|webp)$/.test(type))
      return new Response(null, { status: 502, headers });
    return new Response(upstream.body, {
      headers: {
        ...headers,
        "Content-Type": type,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 502, headers });
  } finally {
    release();
  }
}
