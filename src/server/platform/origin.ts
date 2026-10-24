// Public origin for discovery documents. Prefer the pinned deployment origin so
// a forged Host header can never put an attacker URL into cached metadata.
export function publicOrigin(request: Request) {
  const pinned = process.env.TASTEPOLICY_PUBLIC_ORIGIN;
  if (pinned) {
    try {
      const u = new URL(pinned);
      if (u.protocol === "https:" || u.hostname === "localhost")
        return u.origin;
    } catch {}
  }
  return new URL(request.url).origin;
}
