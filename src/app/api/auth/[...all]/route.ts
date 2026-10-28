import { handleAuthentication } from "@/server/platform/auth-http";
export const maxDuration = 30;
export const POST = (request: Request) => handleAuthentication(request);
export const GET = POST;
