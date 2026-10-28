import { getStateStore } from "@/server/state/postgres";
import { handleToken } from "@/server/platform/oauth-http";
export const POST = (request: Request) => handleToken(request, getStateStore());
