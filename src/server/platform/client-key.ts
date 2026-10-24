// Caller identity for admission control. Only headers the platform sets are
// trusted: Vercel overwrites these, so a client cannot choose its own bucket.
// Without them everyone shares "unknown".
export function clientKey(request: Request) {
  const h = request.headers;
  const v =
    h.get("x-vercel-forwarded-for") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",").at(-1);
  return (v ?? "unknown").trim().slice(0, 64) || "unknown";
}
