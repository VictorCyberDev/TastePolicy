import { getStateStore } from "@/server/state/postgres";
import { handleRevoke } from "@/server/platform/oauth-http";
export const POST = (request: Request) =>
  handleRevoke(request, getStateStore());
