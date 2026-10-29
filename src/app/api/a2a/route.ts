import { measuredHttp } from "@/server/operations/metrics";
import { getStateStore } from "@/server/state/postgres";
import { getQlooProvider } from "@/server/qloo/provider";
import { handleA2a } from "@/server/platform/a2a";
import { acquireDemoBudget } from "@/server/taste/budget";
export const maxDuration = 60;
// Admission is applied by the handler after authentication so anonymous
// traffic cannot exhaust the shared budget.
const handle = (request: Request) =>
  measuredHttp("A2A", () =>
    handleA2a(
      request,
      { store: getStateStore(), factory: getQlooProvider },
      acquireDemoBudget,
    ),
  );
export const POST = handle;
export const GET = handle;
