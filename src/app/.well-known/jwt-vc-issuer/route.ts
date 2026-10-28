import { attestationConfig } from "@/server/platform/attest-config";
// Public issuer keys (jwt-vc-issuer). Only public parameters are ever returned.
export async function GET() {
  const cfg = await attestationConfig();
  if (!cfg)
    return Response.json(
      { code: "NOT_CONFIGURED" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  return Response.json(
    { issuer: cfg.issuer, jwks: cfg.jwks },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
