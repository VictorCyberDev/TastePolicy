import { openApiDocument } from "@/lib/platform/openapi";
export function GET(request: Request) {
  return Response.json(openApiDocument(new URL(request.url).origin), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
