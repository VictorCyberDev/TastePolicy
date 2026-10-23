// RFC 9728 Protected Resource Metadata for the remote MCP endpoint. No
// authorization server is advertised until one is accepted (ADR 0014).
export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return Response.json(
    {
      resource: `${origin}/api/mcp`,
      bearer_methods_supported: ["header"],
      scopes_supported: ["PASSPORT_READ", "TASTE_EVALUATE", "RECEIPT_READ"],
      resource_name: "TastePolicy Preference Authority",
      resource_documentation: `${origin}/developers`,
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
