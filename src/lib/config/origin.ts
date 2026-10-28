/** One configured HTTPS identity for metadata, auth and protocol issuers. */
export function configuredOrigin(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const values = [
    env.TASTEPOLICY_PUBLIC_ORIGIN,
    env.BETTER_AUTH_URL,
    env.NEXT_PUBLIC_APP_URL,
  ].filter((v): v is string => !!v);
  if (!values.length) return null;
  try {
    const origins = values.map((value) => {
      const u = new URL(value);
      if (
        u.username ||
        u.password ||
        u.search ||
        u.hash ||
        u.pathname !== "/" ||
        (u.protocol !== "https:" &&
          !(
            u.protocol === "http:" &&
            ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
          ))
      )
        throw Error("Invalid public origin");
      return u.origin;
    });
    return origins.every((v) => v === origins[0]) ? origins[0] : null;
  } catch {
    return null;
  }
}
