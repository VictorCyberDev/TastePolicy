import "server-only";
import { betterAuth } from "better-auth";
import { Pool } from "pg";
export function createAuthentication(
  database: Pool,
  secret: string,
  baseURL: string,
) {
  const url = new URL(baseURL);
  if (
    secret.length < 32 ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  )
    throw Error("Invalid authentication configuration");
  return betterAuth({
    logger: { disabled: true },
    telemetry: { enabled: false },
    database,
    secret,
    baseURL,
    trustedOrigins: [url.origin],
    user: { modelName: "platform_auth_user" },
    account: {
      modelName: "platform_auth_account",
      accountLinking: { enabled: false },
    },
    verification: { modelName: "platform_auth_verification" },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    session: {
      modelName: "platform_auth_session",
      expiresIn: 86400,
      updateAge: 3600,
      freshAge: 300,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 20 },
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: url.protocol === "https:",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "strict",
        secure: url.protocol === "https:",
      },
    },
  });
}

// Better Auth uses unqualified model names. Hosted PostgreSQL must set the
// schema as a database-role default (TastePolicy production does this on Neon)
// so a managed pooler can hand a connection to Better Auth without racing an
// asynchronous `SET search_path` query. Direct local/test PostgreSQL can safely
// use the startup option; Neon poolers reject that option, so never send it to
// a non-local host.
export function createAuthenticationPool(connectionString: string) {
  const host = new URL(connectionString).hostname.toLowerCase();
  const directLocal =
    process.env.NODE_ENV === "test" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1";
  return new Pool({
    connectionString,
    max: 3,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
    ...(directLocal ? { options: "-c search_path=tastepolicy,public" } : {}),
  });
}

let authentication: ReturnType<typeof createAuthentication> | undefined;
export function getAuthentication() {
  if (
    !process.env.DATABASE_URL ||
    !process.env.BETTER_AUTH_SECRET ||
    !process.env.BETTER_AUTH_URL
  )
    return null;
  authentication ??= createAuthentication(
    createAuthenticationPool(process.env.DATABASE_URL),
    process.env.BETTER_AUTH_SECRET,
    process.env.BETTER_AUTH_URL,
  );
  return authentication;
}
