import { publicOrigin } from "@/server/platform/origin";
import { oauthOrigin } from "@/server/platform/oauth-http";
// RFC 9728 Protected Resource Metadata for the remote MCP endpoint. The
// authorization server is advertised only where one is configured (a pinned
// HTTPS origin); developer credentials keep working either way (ADR 0014, 0022).
export function GET(request: Request) {
  const origin = publicOrigin(request),
    as = oauthOrigin(request);
  return Response.json(
    {
      resource: `${origin}/api/mcp`,
      ...(as ? { authorization_servers: [as] } : {}),
      bearer_methods_supported: ["header"],
      scopes_supported: ["PASSPORT_READ", "TASTE_EVALUATE", "RECEIPT_READ"],
      resource_name: "TastePolicy Preference Authority",
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
