import "server-only";
import {
  createMcpHandler,
  McpServer,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  gatewayAuthenticate,
  gatewayInvoke,
  type GatewayDeps,
} from "./gateway";
import { PLATFORM_TOOLS } from "@/lib/platform/contracts";
import { errorSpec } from "@/lib/platform/errors";
import { PlatformFailure, type Principal } from "@/lib/platform/types";
import { StateFailure } from "@/lib/state/types";
import { SubjectFailure } from "@/lib/subjects/types";
import { publicOrigin } from "./origin";
import { BodyReadFailure, readJsonBody } from "@/server/taste/read-body";

const OUTPUT = z.looseObject({});
const NO_STORE = { "Cache-Control": "no-store" };

export function mcpResourceMetadataUrl(request: Request) {
  return `${publicOrigin(request)}/.well-known/oauth-protected-resource/api/mcp`;
}
export function allowedOriginHostnames(request: Request) {
  const own = new URL(request.url).hostname;
  const extra = (process.env.TASTEPOLICY_MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  return [own, "localhost", "127.0.0.1", ...extra];
}
function codeOf(e: unknown) {
  const typed =
    e instanceof PlatformFailure ||
    e instanceof StateFailure ||
    e instanceof SubjectFailure ||
    e instanceof BodyReadFailure;
  return typed ? e.code : "INTERNAL_ERROR";
}
function server(deps: GatewayDeps, p: Principal, requestId: string) {
  const s = new McpServer(
    { name: "tastepolicy", version: "1.0.0" },
    {
      cacheHints: {
        "tools/list": { ttlMs: 60_000, cacheScope: "private" },
        "server/discover": { ttlMs: 60_000, cacheScope: "private" },
      },
    },
  );
  for (const tool of PLATFORM_TOOLS)
    s.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input as z.ZodObject,
        outputSchema: OUTPUT,
        annotations: {
          title: tool.title,
          readOnlyHint: tool.readOnly,
          destructiveHint: false,
          idempotentHint: tool.idempotent,
          openWorldHint: false,
        },
      },
      async (args: unknown) => {
        try {
          const data = await gatewayInvoke(deps, p, tool, args, requestId);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(data) }],
            structuredContent: data as Record<string, unknown>,
          };
        } catch (e) {
          const code = codeOf(e),
            spec = errorSpec(code),
            body = {
              code,
              retryable: spec.retryable,
              message: spec.message,
              ...(e instanceof PlatformFailure && e.missing
                ? { missing: e.missing }
                : {}),
              requestId,
            };
          return {
            isError: true,
            content: [{ type: "text" as const, text: JSON.stringify(body) }],
            structuredContent: body,
          };
        }
      },
    );
  return s;
}
export async function handleMcp(
  request: Request,
  deps: GatewayDeps,
  admit: () => (() => void) | null = () => () => {},
) {
  const requestId = crypto.randomUUID();
  if (request.method !== "POST")
    return new Response(null, {
      status: 405,
      headers: { ...NO_STORE, Allow: "POST" },
    });
  const rejected = originValidationResponse(
    request,
    allowedOriginHostnames(request),
  );
  if (rejected) return rejected;
  let p: Principal;
  try {
    p = await gatewayAuthenticate(deps, request.headers.get("authorization"));
  } catch (e) {
    const code = codeOf(e);
    // An expired or revoked token is a 401 with a challenge too, so clients
    // that follow the specification refresh or re-authorize instead of giving up.
    if (
      code === "AUTH_REQUIRED" ||
      code === "CREDENTIAL_EXPIRED" ||
      code === "CREDENTIAL_REVOKED"
    )
      return new Response(JSON.stringify({ code, requestId }), {
        status: 401,
        headers: {
          ...NO_STORE,
          "Content-Type": "application/json",
          "WWW-Authenticate":
            `Bearer ${code === "AUTH_REQUIRED" ? "" : 'error="invalid_token", '}` +
            `resource_metadata="${mcpResourceMetadataUrl(request)}"`,
        },
      });
    return Response.json(
      { code, requestId },
      { status: errorSpec(code).http, headers: NO_STORE },
    );
  }
  // Admission (shared budget) is spent only after authentication.
  const release = admit();
  if (!release)
    return Response.json(
      { code: "RATE_LIMITED", retryable: true, requestId },
      { status: 429, headers: NO_STORE },
    );
  try {
    // Read with the platform deadline and size cap; one JSON-RPC message per
    // request so a batch cannot multiply work under one rate token.
    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch (e) {
      const code = e instanceof BodyReadFailure ? e.code : "INVALID_INPUT";
      return Response.json(
        { code, requestId },
        { status: errorSpec(code).http, headers: NO_STORE },
      );
    }
    if (Array.isArray(body))
      return Response.json(
        { code: "INVALID_INPUT", requestId },
        { status: 400, headers: NO_STORE },
      );
    const handler = createMcpHandler(() => server(deps, p, requestId), {
      responseMode: "json",
      legacy: "stateless",
      maxRequestBodySize: 16 * 1024,
    });
    try {
      const res = await handler.fetch(request, { parsedBody: body });
      const headers = new Headers(res.headers);
      headers.set("Cache-Control", "no-store");
      headers.set("X-Request-ID", requestId);
      return new Response(res.body, { status: res.status, headers });
    } finally {
      await handler.close();
    }
  } finally {
    release();
  }
}
