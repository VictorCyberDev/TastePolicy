import { configuredOrigin } from "@/lib/config/origin";
// Unconfigured local/demo surfaces may use their request URL. A configured but
// inconsistent identity fails closed instead of reflecting an attacker Host.
export function publicOrigin(request: Request) {
  const origin = configuredOrigin();
  if (origin) return origin;
  if (
    process.env.TASTEPOLICY_PUBLIC_ORIGIN ||
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL
  )
    throw Error("Invalid canonical origin configuration");
  return new URL(request.url).origin;
}
