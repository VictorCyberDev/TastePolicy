// SYNTHETIC TEST DATA. Real Better Auth email/password and actual PostgreSQL SQL in PGlite.
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { subjectsDatabase, subjectProvider } from "./subjects-fixtures";
import { createAuthentication } from "@/server/platform/auth";
import { PlatformService } from "@/server/platform/service";
import { entities } from "./qloo-fixtures";
import type { Principal } from "@/lib/platform/types";
export async function platformDatabase(
  dir?: string,
  migrate = true,
  authSecret = randomBytes(48).toString("base64url"),
) {
  const d = await subjectsDatabase(dir, migrate);
  if (migrate)
    await d.db.exec(
      await readFile(
        new URL("../migrations/0005_platformization.sql", import.meta.url),
        "utf8",
      ),
    );
  if (migrate)
    await d.db.exec(
      await readFile(
        new URL("../migrations/0006_policy_control_plane.sql", import.meta.url),
        "utf8",
      ),
    );
  await d.db.exec("SET search_path=tastepolicy");
  const auth = createAuthentication(
    d.store.pool,
    authSecret,
    "https://tastepolicy.test",
  );
  return { ...d, auth, authSecret, service: new PlatformService(d.store) };
}
let counter = 0;
export async function account(d: Awaited<ReturnType<typeof platformDatabase>>) {
  const password = randomBytes(20).toString("base64url"),
    email = `synthetic-${++counter}@example.test`;
  const response = await d.auth.api.signUpEmail({
    body: { name: "SYNTHETIC TEST DATA", email, password },
    asResponse: true,
  });
  if (!response.ok) throw Error("Synthetic signup failed");
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const session = await d.auth.api.getSession({
    headers: new Headers({ cookie }),
  });
  if (!session) throw Error("Synthetic auth session unavailable");
  const principal: Principal = {
    userId: session.user.id,
    sessionId: session.session.id,
    authenticatedAt: session.session.createdAt.toISOString(),
    kind: "SESSION",
  };
  return { principal, cookie, email, password };
}
export const init = (idempotencyKey = "initialize") => ({
  idempotencyKey,
  displayLabel: "SYNTHETIC TEST DATA Passport",
  signalIds: entities.slice(0, 5).map((e) => e.id),
  identitiesReviewed: true,
});
export const future = (ms = 3600000) => new Date(Date.now() + ms).toISOString();
export { subjectProvider, entities };
