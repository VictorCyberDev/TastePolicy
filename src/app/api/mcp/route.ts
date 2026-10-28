import { getStateStore } from "@/server/state/postgres";
import { getQlooProvider } from "@/server/qloo/provider";
import { handleMcp } from "@/server/platform/mcp";
import { acquireDemoBudget } from "@/server/taste/budget";
export const maxDuration = 60;
// Admission is applied by the handler after authentication so anonymous
// traffic cannot exhaust the shared budget.
const handle = (request: Request) =>
  handleMcp(
    request,
    { store: getStateStore(), factory: getQlooProvider },
    acquireDemoBudget,
  );
export const POST = handle;
export const GET = handle;
export const DELETE = handle;
