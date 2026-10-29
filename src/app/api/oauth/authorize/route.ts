import { measuredHttp } from "@/server/operations/metrics";
import { getStateStore } from "@/server/state/postgres";
import { handleAuthorize } from "@/server/platform/oauth-http";
export const GET = (request: Request) =>
  measuredHttp("OAUTH", () => handleAuthorize(request, getStateStore()));
