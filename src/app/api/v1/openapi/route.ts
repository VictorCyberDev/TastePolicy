import { publicOrigin } from "@/server/platform/origin";
import { openApiDocument } from "@/lib/platform/openapi";
export function GET(request: Request) {
  return Response.json(openApiDocument(publicOrigin(request)), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
