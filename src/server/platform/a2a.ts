import "server-only";
import {
  gatewayAuthenticate,
  gatewayInvoke,
  type GatewayDeps,
} from "./gateway";
import { toolByName, AUTHORITY_BOUNDARY } from "@/lib/platform/contracts";
import { errorSpec } from "@/lib/platform/errors";
import {
  PlatformFailure,
  platformFail,
  type Principal,
} from "@/lib/platform/types";
import { AttestationService } from "./attest-service";
import { StateFailure } from "@/lib/state/types";
import { SubjectFailure } from "@/lib/subjects/types";
import { BodyReadFailure, readJsonBody } from "@/server/taste/read-body";

// A2A 1.0 (JSON-RPC binding). Hand-rolled over the shared gateway: one
// synchronous skill, no streaming, no push, no stored task beyond the recorded
// evaluation. See ADR 0013.
export const A2A_VERSION = "1.0";
// Opt-in extension: portable preference authority over A2A. Without it a
// SendMessage data part is an evaluation exactly as before. See ADR 0024.
export const AUTHORITY_EXTENSION =
  "https://tastepolicy.dev/a2a/ext/authority-lifecycle/v1";
export const HANDOFF_MEDIA_TYPE =
  "application/vnd.tastepolicy.attestation+sd-jwt";
const OPERATIONS: Record<string, string> = {
  evaluate: "tastepolicy_evaluate_choice",
  "lease.request": "tastepolicy_request_lease",
  "lease.verify": "tastepolicy_verify_lease",
  "lease.checkpoint": "tastepolicy_checkpoint_lease",
  "lease.resume": "tastepolicy_resume_lease",
  "lease.release": "tastepolicy_release_lease",
  "attestation.issue": "tastepolicy_issue_attestation",
  "attestation.verify": "tastepolicy_verify_attestation",
};
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
      extensions: [
        {
          uri: AUTHORITY_EXTENSION,
          description:
            "Portable preference authority. Send a data part {operation, ...} with this URI in message.extensions (or the A2A-Extensions header) to request a lease, check it, resume it, issue a verifiable proof for another agent, or verify a proof you received. Preference authority only: never payment, booking or any execution authority.",
          required: false,
          params: {
            operations: Object.keys(OPERATIONS),
            handoffMediaType: HANDOFF_MEDIA_TYPE,
            publicVerifier: `${origin}/api/attest/verify`,
            issuerMetadata: `${origin}/.well-known/tastepolicy-issuer`,
            commitments: "taste-commitments-v1",
            authorityBoundary: AUTHORITY_BOUNDARY,
          },
        },
      ],
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
          "Use this before you select, rank, recommend, shortlist, add to a draft, present as selected, or otherwise continue a subjective preference-sensitive choice for a person (not for objective operations). Evaluate a proposed choice against a Preference Passport. Send one data part: {passportRef, grantId?, idempotencyKey?, requestedAction?, proposal}. The task artifact carries the taste-authorization-response. UNAVAILABLE means no judgement was possible and is not a rejection.",
        tags: ["authorization", "preferences", "taste"],
        examples: [
          'data part {"passportRef":"tp_…","proposal":{"agentId":"my-agent","expectedStateVersion":1,"candidate":{…},"context":{…}}}',
        ],
        inputModes: ["application/json"],
        outputModes: ["application/json", "text/plain"],
      },
      {
        id: "authority_lease",
        name: "Preference authority lease",
        description: `Extension ${AUTHORITY_EXTENSION}. After an ALLOW or an authority-confirmation ASK, hold a short-lived lease for that exact choice. Data part {operation: "lease.request"|"lease.verify"|"lease.checkpoint"|"lease.resume"|"lease.release", ...}. Verify and checkpoint accept the candidate and context as they are now; a mismatch suspends the lease. A pending owner question is TASK_STATE_INPUT_REQUIRED.`,
        tags: ["authorization", "lease", "runtime"],
        examples: [
          'data part {"operation":"lease.request","evaluationRef":"tp_…","idempotencyKey":"…"}',
          'data part {"operation":"lease.verify","leaseRef":"tl_…","context":{"key":"trip","domain":"destination","price":{"amount":100,"currency":"USD"}}}',
        ],
        inputModes: ["application/json"],
        outputModes: ["application/json", "text/plain"],
      },
      {
        id: "authority_attestation",
        name: "Portable authority proof and handoff",
        description: `Extension ${AUTHORITY_EXTENSION}. For an ACTIVE lease, issue a short-lived SD-JWT proof bound to a receiving agent's public key, then hand it over in an A2A message (media type ${HANDOFF_MEDIA_TYPE}). The receiver verifies with operation "attestation.verify" or the public verifier, passing the choice and situation it is acting on. The proof ends when the authority ends and never comes back.`,
        tags: ["attestation", "handoff", "verification"],
        examples: [
          'data part {"operation":"attestation.issue","leaseRef":"tl_…","audience":"https://receiver.example","holderKey":{…},"delegateAgentId":"agent-b"}',
          'data part {"operation":"attestation.verify","presentation":"…","audience":"https://receiver.example","nonce":"…","expect":{"context":{…}}}',
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
    readonly missing?: string[],
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
                metadata: {
                  requestId,
                  ...(body.error.missing
                    ? { missing: body.error.missing.join(",") }
                    : {}),
                },
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
function mapFailure(
  code: string,
  getTask: boolean,
  missing?: string[],
): RpcError {
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
  return new RpcError(-32020, code, http, missing);
}
function leaseTask(r: Record<string, unknown>, extensions: boolean) {
  const id = String(r.leaseRef);
  return {
    id,
    contextId: String(r.passportRef),
    status: {
      // A pending owner question is the A2A "input required" state.
      state:
        r.status === "ASK_PENDING"
          ? "TASK_STATE_INPUT_REQUIRED"
          : "TASK_STATE_COMPLETED",
      timestamp: String(r.issuedAt),
    },
    artifacts: [
      {
        artifactId: `${id}:lease`,
        name: "taste-lease",
        ...(extensions ? { extensions: [AUTHORITY_EXTENSION] } : {}),
        parts: [
          { data: r, mediaType: "application/json" },
          {
            text: `Lease ${r.status}${r.valid ? "" : " (not valid)"}. ${AUTHORITY_BOUNDARY}`,
          },
        ],
      },
    ],
  };
}
function attestationTask(r: Record<string, unknown>, leaseRef: string) {
  const id = String(r.jti);
  return {
    id,
    contextId: leaseRef,
    status: {
      state: "TASK_STATE_COMPLETED",
      timestamp: new Date().toISOString(),
    },
    artifacts: [
      {
        artifactId: `${id}:attestation`,
        name: "taste-attestation",
        extensions: [AUTHORITY_EXTENSION],
        parts: [
          { data: r, mediaType: HANDOFF_MEDIA_TYPE },
          {
            text: `Attestation for ${r.audience}. ${AUTHORITY_BOUNDARY}`,
          },
        ],
      },
    ],
  };
}
function verificationTask(r: Record<string, unknown>, requestId: string) {
  return {
    id: `av_${requestId}`,
    contextId: "verification",
    status: {
      state: "TASK_STATE_COMPLETED",
      timestamp: new Date().toISOString(),
    },
    artifacts: [
      {
        artifactId: `av_${requestId}:verification`,
        name: "taste-verification",
        extensions: [AUTHORITY_EXTENSION],
        parts: [
          { data: r, mediaType: "application/json" },
          {
            text: `Proof ${r.valid ? "valid" : "not valid"}${r.valid && !r.trustedAuthority ? ", issuer not trusted" : ""}. ${AUTHORITY_BOUNDARY}`,
          },
        ],
      },
    ],
  };
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
function skillInput(message: unknown, wantsIdempotency = true) {
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
  if (wantsIdempotency && input.idempotencyKey === undefined)
    input.idempotencyKey = m.messageId;
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
    p = await gatewayAuthenticate(
      deps,
      request.headers.get("authorization"),
      "a2a",
    );
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
      const message = params.message as { extensions?: unknown } | null;
      const headerExt = (request.headers.get("a2a-extensions") ?? "")
        .split(",")
        .map((x) => x.trim());
      const active =
        headerExt.includes(AUTHORITY_EXTENSION) ||
        (Array.isArray(message?.extensions) &&
          message.extensions.includes(AUTHORITY_EXTENSION));
      if (!active) {
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
      // Extension active: the data part names the operation.
      const raw = skillInput(params.message, false),
        op = raw.operation;
      delete raw.operation;
      if (typeof op !== "string" || !Object.hasOwn(OPERATIONS, op))
        throw new RpcError(-32602, "INVALID_INPUT");
      const tool = toolByName(OPERATIONS[op])!;
      // The message id is the idempotency key for operations that take one.
      if (
        raw.idempotencyKey === undefined &&
        (op === "evaluate" || op === "lease.request" || op === "lease.resume")
      )
        raw.idempotencyKey = (
          params.message as { messageId: string }
        ).messageId;
      const out = (await gatewayInvoke(
        deps,
        p,
        tool,
        raw,
        requestId,
      )) as Record<string, unknown>;
      const shaped =
        op === "evaluate"
          ? task(out)
          : op.startsWith("lease.")
            ? leaseTask(out, true)
            : op === "attestation.issue"
              ? attestationTask(out, String(raw.leaseRef))
              : verificationTask(out, requestId);
      return rpcResponse(id, { result: { task: shaped } }, requestId, 200, {
        "A2A-Extensions": AUTHORITY_EXTENSION,
      });
    }
    if (method === "GetTask") {
      if (typeof params.id !== "string")
        throw new RpcError(-32602, "INVALID_INPUT");
      // A lease task is read through the same authoritative verify as every
      // other door; an evaluation task through the recorded status.
      if (/^tl_[a-f0-9]{48}$/.test(params.id)) {
        if (!p.scopes?.includes("RECEIPT_READ")) platformFail("ACCESS_DENIED");
        if (!deps.store) platformFail("NOT_CONFIGURED");
        const out = (await new AttestationService(deps.store).leaseStatus(p, {
          leaseRef: params.id,
        })) as Record<string, unknown>;
        return rpcResponse(id, { result: leaseTask(out, true) }, requestId);
      }
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
      // Cancelling a lease task releases the lease (the agent finishes with it).
      if (/^tl_[a-f0-9]{48}$/.test(params.id)) {
        const out = (await gatewayInvoke(
          deps,
          p,
          toolByName("tastepolicy_release_lease")!,
          { leaseRef: params.id },
          requestId,
        )) as Record<string, unknown>;
        return rpcResponse(id, { result: leaseTask(out, true) }, requestId);
      }
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
      e instanceof PlatformFailure ? e.missing : undefined,
    );
    return rpcResponse(id, { error: err }, requestId, err.http);
  }
}
