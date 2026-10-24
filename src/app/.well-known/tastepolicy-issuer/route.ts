import { attestationConfig } from "@/server/platform/attest-config";
import { buildIssuerMetadata } from "@/lib/attest/issuer-metadata";
// Public issuer metadata. Public parameters only; reading it grants no trust.
export async function GET() {
  const cfg = await attestationConfig();
  if (!cfg)
    return Response.json(
      { code: "NOT_CONFIGURED" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  return Response.json(buildIssuerMetadata(cfg.issuer, cfg.keys), {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
