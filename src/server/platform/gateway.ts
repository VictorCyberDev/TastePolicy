import "server-only";
import { PolicyService } from "./policy-service";
import {
  PLATFORM_CONTRACT_VERSION,
  AUTHORITY_BOUNDARY,
  PLATFORM_TOOLS,
  type PlatformTool,
} from "@/lib/platform/contracts";
import { platformFail, type Principal } from "@/lib/platform/types";
import type { StateStore } from "@/server/state/repositories";
import type { QlooProvider } from "@/server/qloo/contracts";

export interface GatewayDeps {
  store: StateStore | null;
  factory: () => QlooProvider;
}
// Transport-neutral entry used by remote MCP and A2A. REST keeps its own
// handler but calls the same PlatformService methods.
export async function gatewayAuthenticate(
  deps: GatewayDeps,
  authorization: string | null,
  surface: "mcp" | "a2a" = "mcp",
): Promise<Principal> {
  if (!authorization?.startsWith("Bearer ")) platformFail("AUTH_REQUIRED");
  if (!deps.store) platformFail("NOT_CONFIGURED");
  return new PolicyService(deps.store).credentialPrincipal(
    authorization.slice(7),
    surface,
  );
}
export function capabilities(p: Principal) {
  return {
    schemaVersion: "tastepolicy-capabilities-v1",
    contract: PLATFORM_CONTRACT_VERSION,
    authorityBoundary: AUTHORITY_BOUNDARY,
    decisions: ["ALLOW", "ASK", "REJECT", "UNAVAILABLE"],
    unavailableIsNotReject: true,
    credentialScopes: p.scopes ?? [],
    tools: PLATFORM_TOOLS.map((t) => ({
      name: t.name,
      requiredScope: t.scope,
      readOnly: t.readOnly,
    })),
    surfaces: ["REST /api/v1", "MCP /api/mcp", "A2A /api/a2a"],
  };
}
export async function gatewayInvoke(
  deps: GatewayDeps,
  p: Principal,
  tool: PlatformTool,
  input: unknown,
  requestId: string,
): Promise<unknown> {
  if (tool.scope && !p.scopes?.includes(tool.scope))
    platformFail("ACCESS_DENIED");
  if (tool.op === "capabilities") return capabilities(p);
  if (!deps.store) platformFail("NOT_CONFIGURED");
  const s = new PolicyService(deps.store);
  if (tool.op === "passport") return s.read(p, input);
  if (tool.op === "policy") return s.policySummary(p, input);
  if (tool.op === "evaluate")
    return s.evaluate(p, input, deps.factory, requestId);
  return s.receipt(p, input, tool.op === "status");
}
