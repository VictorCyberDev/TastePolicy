import { measuredHttp } from "@/server/operations/metrics";
import { getStateStore } from "@/server/state/postgres";
import { handleDecision } from "@/server/platform/oauth-http";
export const POST = (request: Request) =>
  measuredHttp("OAUTH", () => handleDecision(request, getStateStore()));
