import { metadataResponse } from "@/server/platform/oauth-http";
export const GET = (request: Request) => metadataResponse(request);
