import { isQlooHost } from "@/lib/config/qloo";
export type EnvironmentInput = Record<string, string | undefined>;
export function validateEnvironment(input: EnvironmentInput) {
  const nodeEnv = input.NODE_ENV ?? "development";
  if (!["development", "test", "production"].includes(nodeEnv))
    throw new Error("Invalid NODE_ENV");
  function optionalUrl(name: string) {
    const value = input[name]?.trim() || undefined;
    if (value) {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new Error(`Invalid ${name}`);
      }
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error(`Invalid ${name}`);
    }
    return value;
  }
  const qlooHost = input.QLOO_API_BASE_URL?.trim() || undefined;
  if (qlooHost && !isQlooHost(qlooHost))
    throw new Error("Invalid QLOO_API_BASE_URL");
  const affinityScale = input.QLOO_AFFINITY_SCALE?.trim() || undefined;
  if (affinityScale && affinityScale !== "unit" && affinityScale !== "percent")
    throw new Error("Invalid QLOO_AFFINITY_SCALE");
  return Object.freeze({
    qlooHost: qlooHost as
      "https://api.qloo.com" | "https://hackathon.api.qloo.com" | undefined,
    affinityScale: affinityScale as "unit" | "percent" | undefined,
    nodeEnv,
    appUrl: optionalUrl("NEXT_PUBLIC_APP_URL"),
    supabaseUrl: optionalUrl("SUPABASE_URL"),
    qlooApiKey: input.QLOO_API_KEY?.trim() || undefined,
    openaiApiKey: input.OPENAI_API_KEY?.trim() || undefined,
    supabaseServiceRoleKey:
      input.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined,
  });
}
