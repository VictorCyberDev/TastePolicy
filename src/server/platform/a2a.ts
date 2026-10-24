import "server-only";
import {
  gatewayAuthenticate,
  gatewayInvoke,
  type GatewayDeps,
} from "./gateway";
import { toolByName, AUTHORITY_BOUNDARY } from "@/lib/platform/contracts";
import { errorSpec } from "@/lib/platform/errors";
import { PlatformFailure, type Principal } from "@/lib/platform/types";
import { StateFailure } from "@/lib/state/types";
import { SubjectFailure } from "@/lib/subjects/types";
import { BodyReadFailure, readJsonBody } from "@/server/taste/read-body";

// A2A 1.0 (JSON-RPC binding). Hand-rolled over the shared gateway: one
// synchronous skill, no streaming, no push, no stored task beyond the recorded
// evaluation. See ADR 0013.
export const A2A_VERSION = "1.0";
const HEADERS = { "Cache-Control": "no-store" };
const DOMAIN = "a2a-protocol.org";

export function agentCard(origin: string) {
  return {
    name: "TastePolicy",
    description:
      "Preference authority for autonomous agents. Answers whether a proposed brand, place or destination fits a user's reviewed cultural preferences: ALLOW, ASK, REJECT or UNAVAILABLE. " +
      AUTHORITY_BOUNDARY,
    version: "1.0.0",
    supportedInterfaces: [
      {
        url: `${origin}/api/a2a`,
        protocolBinding: "JSONRPC",
        protocolVersion: A2A_VERSION,
      },
    ],
    provider: { organization: "TastePolicy", url: origin },
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
    },
    securitySchemes: {
      bearer: {
        httpAuthSecurityScheme: {
          scheme: "Bearer",
          bearerFormat: "TastePolicy developer credential",
          description:
            "Scoped developer credential issued in the account console. TASTE_EVALUATE for SendMessage, RECEIPT_READ for GetTask.",
        },
      },
    },
    securityRequirements: [{ schemes: { bearer: { list: [] } } }],
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json", "text/plain"],
    skills: [
      {
        id: "preference_authorization",
        name: "Preference authorization",
        description:
          "Evaluate a proposed choice against a Preference Passport. Send one data part: {passportRef, grantId?, idempotencyKey?, proposal}. The task artifact carries the taste-authorization-response. UNAVAILABLE means no judgement was possible and is not a rejection.",
        tags: ["authorization", "preferences", "taste"],
        examples: [
          'data part {"passportRef":"tp_…","proposal":{"agentId":"my-agent","expectedStateVersion":1,"candidate":{…},"context":{…}}}',
        ],
        inputModes: ["application/json"],
        outputModes: ["application/json", "text/plain"],
      },
    ],
  };
}
class RpcError extends Error {
  constructor(
    readonly rpc: number,
    readonly reason: string,
    readonly http = 200,
  ) {
    super(reason);
  }
}
function rpcResponse(
  id: unknown,
  body: { result: unknown } | { error: RpcError },
  requestId: string,
  status = 200,
  extra: Record<string, string> = {},
) {
  const payload =
    "result" in body
      ? { jsonrpc: "2.0", id, result: body.result }
      : {
          jsonrpc: "2.0",
          id,
          error: {
            code: body.error.rpc,
            message: body.error.reason,
            data: [
              {
                "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                reason: body.error.reason,
                domain: DOMAIN,
                metadata: { requestId },
              },
            ],
          },
        };
  return Response.json(payload, {
    status,
    headers: { ...HEADERS, "X-Request-ID": requestId, ...extra },
  });
}
function codeOf(e: unknown) {
  const typed =
    e instanceof PlatformFailure ||
    e instanceof StateFailure ||
    e instanceof SubjectFailure ||
    e instanceof BodyReadFailure;
  return typed ? e.code : "INTERNAL_ERROR";
}
function mapFailure(code: string, getTask: boolean): RpcError {
  const http = errorSpec(code).http;
  if (code === "INVALID_INPUT") return new RpcError(-32602, code);
  // A2A §13.1: never reveal the existence of another caller's task.
  if (
    getTask &&
    [
      "PASSPORT_NOT_FOUND",
      "ACCESS_DENIED",
      "GRANT_REQUIRED",
      "GRANT_EXPIRED",
      "GRANT_REVOKED",
    ].includes(code)
  )
    return new RpcError(-32001, "TASK_NOT_FOUND");
  if (code === "INTERNAL_ERROR") return new RpcError(-32603, code, http);
  return new RpcError(-32020, code, http);
}
function task(response: Record<string, unknown>) {
  const id = String(response.evaluationRef);
  return {
    id,
    contextId: String(response.passportRef),
    status: {
      state: "TASK_STATE_COMPLETED",
      timestamp: String(response.createdAt),
    },
    artifacts: [
      {
        artifactId: `${id}:authorization`,
        name: "taste-authorization-response",
        parts: [
          { data: response, mediaType: "application/json" },
          {
            text: `Decision ${response.decision}. ${AUTHORITY_BOUNDARY}`,
          },
        ],
      },
    ],
  };
}
function skillInput(message: unknown) {
  const m = message as {
    messageId?: unknown;
    role?: unknown;
    parts?: unknown;
  } | null;
  if (
    !m ||
    typeof m.messageId !== "string" ||
    m.messageId.length < 8 ||
    m.messageId.length > 128 ||
    m.role !== "ROLE_USER" ||
    !Array.isArray(m.parts)
  )
    throw new RpcError(-32602, "INVALID_INPUT");
  const data = m.parts.filter(
    (p) => p && typeof p === "object" && "data" in p,
  ) as { data: unknown }[];
  if (data.length !== 1 || !data[0].data || typeof data[0].data !== "object")
    throw new RpcError(-32602, "INVALID_INPUT");
  const input = { ...(data[0].data as Record<string, unknown>) };
  // messageId is the protocol-level idempotency key (A2A §3.3.1).
  if (input.idempotencyKey === undefined) input.idempotencyKey = m.messageId;
  return input;
}
export async function handleA2a(
  request: Request,
  deps: GatewayDeps,
  admit: () => (() => void) | null = () => () => {},
) {
  const requestId = crypto.randomUUID();
  if (request.method !== "POST")
    return new Response(null, {
      status: 405,
      headers: { ...HEADERS, Allow: "POST" },
    });
  let p: Principal;
  try {
    p = await gatewayAuthenticate(deps, request.headers.get("authorization"));
  } catch (e) {
    const code = codeOf(e);
    return rpcResponse(
      null,
      { error: new RpcError(-32020, code) },
      requestId,
      errorSpec(code).http,
      code === "AUTH_REQUIRED"
        ? { "WWW-Authenticate": 'Bearer realm="tastepolicy-a2a"' }
        : {},
    );
  }
  const release = admit();
  if (!release)
    return rpcResponse(
      null,
      { error: new RpcError(-32020, "RATE_LIMITED") },
      requestId,
      429,
    );
  try {
    return await a2aDispatch(request, deps, p, requestId);
  } finally {
    release();
  }
}
async function a2aDispatch(
  request: Request,
  deps: GatewayDeps,
  p: Principal,
  requestId: string,
) {
  const version =
    request.headers.get("a2a-version") ??
    new URL(request.url).searchParams.get("A2A-Version");
  let id: unknown = null,
    method = "";
  try {
    if (version?.trim() !== A2A_VERSION)
      throw new RpcError(-32009, "VERSION_NOT_SUPPORTED");
    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch (e) {
      if (e instanceof BodyReadFailure) throw e;
      throw new RpcError(-32700, "PARSE_ERROR");
    }
    const req = body as {
      jsonrpc?: unknown;
      id?: unknown;
      method?: unknown;
      params?: unknown;
    } | null;
    if (
      !req ||
      req.jsonrpc !== "2.0" ||
      typeof req.method !== "string" ||
      Array.isArray(body)
    )
      throw new RpcError(-32600, "INVALID_REQUEST");
    id = req.id ?? null;
    method = req.method;
    const params = (req.params ?? {}) as Record<string, unknown>;
    if (method === "SendMessage") {
      const tool = toolByName("tastepolicy_evaluate_choice")!;
      const out = (await gatewayInvoke(
        deps,
        p,
        tool,
        skillInput(params.message),
        requestId,
      )) as Record<string, unknown>;
      return rpcResponse(id, { result: { task: task(out) } }, requestId);
    }
    if (method === "GetTask") {
      if (typeof params.id !== "string")
        throw new RpcError(-32602, "INVALID_INPUT");
      const tool = toolByName("tastepolicy_get_status")!;
      const out = (await gatewayInvoke(
        deps,
        p,
        tool,
        { evaluationRef: params.id },
        requestId,
      )) as Record<string, unknown>;
      return rpcResponse(id, { result: task(out) }, requestId);
    }
    if (method === "CancelTask") {
      if (typeof params.id !== "string")
        throw new RpcError(-32602, "INVALID_INPUT");
      await gatewayInvoke(
        deps,
        p,
        toolByName("tastepolicy_get_status")!,
        { evaluationRef: params.id },
        requestId,
      );
      throw new RpcError(-32002, "TASK_NOT_CANCELABLE");
    }
    if (
      ["SendStreamingMessage", "SubscribeToTask", "ListTasks"].includes(method)
    )
      throw new RpcError(-32004, "UNSUPPORTED_OPERATION");
    if (/PushNotificationConfig/.test(method))
      throw new RpcError(-32003, "PUSH_NOTIFICATION_NOT_SUPPORTED");
    if (method === "GetExtendedAgentCard")
      throw new RpcError(-32007, "EXTENDED_AGENT_CARD_NOT_CONFIGURED");
    throw new RpcError(-32601, "METHOD_NOT_FOUND");
  } catch (e) {
    if (e instanceof RpcError)
      return rpcResponse(id, { error: e }, requestId, e.http);
    const code = codeOf(e);
    const err = mapFailure(
      code,
      method === "GetTask" || method === "CancelTask",
    );
    return rpcResponse(id, { error: err }, requestId, err.http);
  }
}
