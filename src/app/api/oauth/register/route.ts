import { getStateStore } from "@/server/state/postgres";
import { handleRegister } from "@/server/platform/oauth-http";
export const POST = (request: Request) =>
  handleRegister(request, getStateStore());
