import { isIPv6 } from "node:net";

// Caller identity for admission control. A forwarding header is only believed
// when the platform that sets it is known to overwrite it: on Vercel the
// x-vercel-forwarded-for / x-real-ip headers are set by the edge and cannot be
// chosen by the client. Anywhere else a client could rotate those headers to
// get a fresh bucket per request, so they are ignored unless the operator names
// the one header their own trusted proxy sets (TASTEPOLICY_TRUSTED_IP_HEADER).
// Without either, all callers share one bucket ("unknown"): stricter, never
// looser, and logged once so the operator notices.
// IPv6 callers are keyed by their /64: one subscriber normally holds a whole
// /64, so rotating addresses inside it must not buy fresh budgets.
let warned = false;
function prefix64(v: string) {
  if (!isIPv6(v)) return v;
  // Expand "::" and keep the first four groups.
  const [head, tail = ""] = v.split("::");
  const h = head ? head.split(":") : [],
    t = tail ? tail.split(":") : [];
  const groups = [
    ...h,
    ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"),
    ...t,
  ];
  return (
    groups
      .slice(0, 4)
      .map((g) => g.toLowerCase().replace(/^0+(?=.)/, ""))
      .join(":") + "::/64"
  );
}
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
  else if (!warned && process.env.NODE_ENV === "production") {
    warned = true;
    console.warn(
      "tastepolicy: no trusted client-address source (not on Vercel and TASTEPOLICY_TRUSTED_IP_HEADER unset): all callers share one rate-limit bucket",
    );
  }
  const raw = (v ?? "unknown").trim().slice(0, 64) || "unknown";
  return prefix64(raw);
}
