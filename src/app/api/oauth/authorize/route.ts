import { getStateStore } from "@/server/state/postgres";
import { handleAuthorize } from "@/server/platform/oauth-http";
export const GET = (request: Request) =>
  handleAuthorize(request, getStateStore());
