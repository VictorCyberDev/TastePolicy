import { publicOrigin } from "@/server/platform/origin";
import { agentCard } from "@/server/platform/a2a";
// Public Agent Card (A2A 1.0). Contains no secrets and no per-user data.
export function GET(request: Request) {
  return Response.json(agentCard(publicOrigin(request)), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
