import { createRequestId } from "@/lib/logging/request-id";
import { getStateStore } from "@/server/state/postgres";
import { getAuthentication } from "@/server/platform/auth";
import { attestationConfig } from "@/server/platform/attest-config";
export const maxDuration = 10;
type State = "up" | "unconfigured" | "down";
// Readiness, as opposed to /api/health liveness. Reports what is configured and
// reachable, never a value. Not ready means a dependency the platform needs is
// missing; optional components are listed but do not fail readiness.
export async function GET() {
  const checks: Record<
    string,
    State | "configured" | "current" | "behind" | "unknown"
  > = {};
  let database: State = "unconfigured";
  let migrations: "current" | "behind" | "unknown" = "unknown";
  try {
    const store = getStateStore();
    if (store) {
      database = "down";
      const version = await Promise.race([
        // Newest migration (attestations) and the OAuth tables both exist.
        store.transaction(async (r) => {
          await r.oauth.client("readiness-probe");
          return r.attest.listVersion(1);
        }),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("timeout")), 4000),
        ),
      ]);
      database = "up";
      migrations = version === null ? "behind" : "current";
    }
  } catch {
    // "down" or "behind" are reported without detail.
    if (database === "up") migrations = "behind";
  }
  checks.database = database;
  checks.migrations = migrations;
  checks.authentication = getAuthentication() ? "up" : "unconfigured";
  checks.attestation = (await attestationConfig()) ? "up" : "unconfigured";
  // Configured is not reachable: this is a presence check only, never a call.
  checks.cultural_provider = process.env.QLOO_API_KEY
    ? "configured"
    : "unconfigured";
  const origin = process.env.TASTEPOLICY_PUBLIC_ORIGIN;
  checks.public_origin = /^(https:\/\/|http:\/\/localhost(:|\/|$))/.test(
    origin ?? "",
  )
    ? "configured"
    : "unconfigured";
  checks.oauth =
    checks.public_origin === "configured" && database === "up"
      ? "up"
      : "unconfigured";
  const ready =
    checks.database === "up" &&
    checks.migrations === "current" &&
    checks.authentication === "up";
  return Response.json(
    {
      status: ready ? "ready" : "not_ready",
      service: "tastepolicy",
      checks,
      required: ["database", "migrations", "authentication"],
      optional: ["attestation", "cultural_provider", "public_origin", "oauth"],
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "X-Request-ID": createRequestId(),
        "Cache-Control": "no-store",
      },
    },
  );
}
