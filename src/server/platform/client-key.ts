// Caller identity for admission control. A forwarding header is only believed
// when the platform that sets it is known to overwrite it: on Vercel the
// x-vercel-forwarded-for / x-real-ip headers are set by the edge and cannot be
// chosen by the client. Anywhere else a client could rotate those headers to
// get a fresh bucket per request, so they are ignored unless the operator names
// the one header their own trusted proxy sets (TASTEPOLICY_TRUSTED_IP_HEADER).
// Without either, all callers share one bucket ("unknown"): stricter, never
// looser.
export function clientKey(request: Request) {
  const h = request.headers,
    custom = process.env.TASTEPOLICY_TRUSTED_IP_HEADER?.toLowerCase();
  let v: string | null | undefined;
  if (process.env.VERCEL)
    v =
      h.get("x-vercel-forwarded-for") ??
      h.get("x-real-ip") ??
      h.get("x-forwarded-for")?.split(",").at(-1);
  else if (custom && /^[a-z0-9-]{1,64}$/.test(custom))
    v = h.get(custom)?.split(",").at(-1);
  return (v ?? "unknown").trim().slice(0, 64) || "unknown";
}
