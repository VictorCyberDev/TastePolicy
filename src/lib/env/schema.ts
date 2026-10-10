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
  return Object.freeze({
    nodeEnv,
    appUrl: optionalUrl("NEXT_PUBLIC_APP_URL"),
    supabaseUrl: optionalUrl("SUPABASE_URL"),
    qlooApiKey: input.QLOO_API_KEY?.trim() || undefined,
    openaiApiKey: input.OPENAI_API_KEY?.trim() || undefined,
    supabaseServiceRoleKey:
      input.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined,
  });
}
