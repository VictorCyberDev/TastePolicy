import { getStateStore } from "@/server/state/postgres";
import { handleDecision } from "@/server/platform/oauth-http";
export const POST = (request: Request) =>
  handleDecision(request, getStateStore());
