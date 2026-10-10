import { createRequestId } from "@/lib/logging/request-id";
export function GET() {
  return Response.json(
    { status: "ok", service: "tastepolicy" },
    {
      headers: {
        "X-Request-ID": createRequestId(),
        "Cache-Control": "no-store",
      },
    },
  );
}
