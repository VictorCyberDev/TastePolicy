import "server-only";
import { searchAreas } from "@/server/open/nominatim";
import { acquireDemoBudget } from "@/server/taste/budget";

export const maxDuration = 20;
const headers = { "Cache-Control": "private, no-store" };

// Turns a typed neighbourhood or city into a few choices. Same-origin only.
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
  let query = "";
  try {
    const body = JSON.parse(text.length <= 1024 ? text : "{}");
    if (
      body &&
      typeof body === "object" &&
      Object.keys(body).join() === "query" &&
      typeof body.query === "string"
    )
      query = body.query.trim();
  } catch {
    /* invalid */
  }
  if (query.length < 2 || query.length > 120)
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
    const found = await searchAreas(query);
    if (found.status !== "available")
      return Response.json(
        { status: "unavailable", reason: found.reason },
        { status: 502, headers },
      );
    return Response.json(
      { status: "available", data: found.data },
      { headers },
    );
  } finally {
    release();
  }
}
