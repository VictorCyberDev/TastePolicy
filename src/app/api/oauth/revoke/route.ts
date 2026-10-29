import { measuredHttp } from "@/server/operations/metrics";
import { getStateStore } from "@/server/state/postgres";
import { handleRevoke } from "@/server/platform/oauth-http";
export const POST = (request: Request) =>
  measuredHttp("OAUTH", () => handleRevoke(request, getStateStore()));
