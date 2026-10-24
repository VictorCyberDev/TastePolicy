import "server-only";
import { getAuthentication } from "./auth";
import { LeaseService } from "./lease-service";
import { capabilities } from "./gateway";
import {
  PlatformFailure,
  platformFail,
  type Principal,
} from "@/lib/platform/types";
import { errorSpec } from "@/lib/platform/errors";
import { StateFailure } from "@/lib/state/types";
import { SubjectFailure } from "@/lib/subjects/types";
import { BodyReadFailure, readJsonBody } from "@/server/taste/read-body";
import type { StateStore } from "@/server/state/repositories";
import type { QlooProvider } from "@/server/qloo/contracts";
export function trustedOrigin(request: Request) {
  const url = new URL(request.url);
  return (
    request.headers.get("origin") ===
      `${url.protocol}//${request.headers.get("host") ?? url.host}` &&
    request.headers.get("sec-fetch-site") !== "cross-site"
  );
}
export async function sessionPrincipal(request: Request): Promise<Principal> {
  const auth = getAuthentication();
  if (!auth) platformFail("NOT_CONFIGURED");
  const s = await auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
  });
  if (!s) platformFail("AUTH_REQUIRED");
  return {
    userId: s.user.id,
    kind: "SESSION",
    sessionId: s.session.id,
    authenticatedAt: s.session.createdAt.toISOString(),
  };
}
export function safePlatformError(e: unknown, requestId: string) {
  const typed =
      e instanceof PlatformFailure ||
      e instanceof StateFailure ||
      e instanceof SubjectFailure ||
      e instanceof BodyReadFailure,
    code = typed ? e.code : "INTERNAL_ERROR";
  return Response.json(
    { status: "error", code, requestId },
    {
      status: errorSpec(code).http,
      headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
    },
  );
}
export async function handlePlatform(
  request: Request,
  op: string,
  mode: "account" | "v1",
  store: StateStore | null,
  factory: () => QlooProvider,
  authenticate = sessionPrincipal,
) {
  const requestId = crypto.randomUUID();
  try {
    const bearer = request.headers.get("authorization");
    if (mode === "account" && (!trustedOrigin(request) || bearer))
      platformFail("ACCESS_DENIED");
    if (mode === "v1" && !bearer?.startsWith("Bearer "))
      platformFail("AUTH_REQUIRED");
    if (
      request.method !== "GET" &&
      request.headers.get("content-type")?.split(";")[0].trim() !==
        "application/json"
    )
      platformFail("INVALID_INPUT");
    if (!store) platformFail("NOT_CONFIGURED");
    const service = new LeaseService(store);
    const p =
      mode === "v1"
        ? await service.credentialPrincipal(bearer!.replace(/^Bearer /, ""))
        : await authenticate(request);
    if (
      request.method === "GET" &&
      ![
        "inspect",
        "passport",
        "receipt",
        "status",
        "capabilities",
        "policy",
      ].includes(op)
    )
      platformFail("INVALID_INPUT");
    const body =
      request.method === "GET"
        ? Object.fromEntries(new URL(request.url).searchParams)
        : await readJsonBody(request);
    if (
      request.method === "GET" &&
      body &&
      typeof body === "object" &&
      "stateSummary" in body
    ) {
      const v = body as Record<string, unknown>;
      if (!["true", "false"].includes(v.stateSummary as string))
        platformFail("INVALID_INPUT");
      v.stateSummary = v.stateSummary === "true";
    }
    let data: unknown;
    if (mode === "account") {
      if (op === "inspect") data = await service.inspect(p);
      else if (op === "create")
        data = await service.initialize(p, body, factory);
      else if (op === "update") data = await service.update(p, body);
      else if (op === "grant") data = await service.grant(p, body);
      else if (op === "revoke-grant") data = await service.revokeGrant(p, body);
      else if (op === "create-key" || op === "rotate-key")
        data = await service.issueKey(p, body, op === "rotate-key");
      else if (op === "revoke-key") data = await service.revokeKey(p, body);
      else if (op === "export") data = await service.export(p, body);
      else if (op === "delete-passport" || op === "delete-account")
        data = await service.delete(p, body, op === "delete-account");
      else if (op === "evaluate")
        data = await service.evaluate(p, body, factory, requestId);
      else if (op === "policy") data = await service.policySummary(p, body);
      else if (op === "lease-list") data = await service.leaseList(p, body);
      else if (op === "lease-approve")
        data = await service.leaseApprove(p, body);
      else if (op === "lease-decline")
        data = await service.leaseDecline(p, body);
      else if (op === "lease-revoke") data = await service.leaseRevoke(p, body);
      else if (op === "policy-get") data = await service.policyGet(p, body);
      else if (op === "policy-publish")
        data = await service.policyPublish(p, body);
      else if (op === "override-create")
        data = await service.overrideCreate(p, body);
      else if (op === "override-revoke")
        data = await service.overrideRevoke(p, body);
      else if (op === "policy-simulate")
        data = await service.policySimulate(p, body);
      else if (op === "policy-impact")
        data = await service.policyImpact(p, body);
      else if (op === "policy-explain")
        data = await service.policyExplain(p, body);
      else if (op === "passport") data = await service.read(p, body);
      else if (op === "receipt" || op === "status")
        data = await service.receipt(p, body, op === "status");
      else platformFail("INVALID_INPUT");
    } else {
      if (op === "capabilities") data = capabilities(p);
      else if (op === "policy") data = await service.policySummary(p, body);
      else if (op === "lease") data = await service.leaseRequest(p, body);
      else if (op === "lease-verify") data = await service.leaseVerify(p, body);
      else if (op === "lease-checkpoint")
        data = await service.leaseCheckpoint(p, body);
      else if (op === "lease-resume") data = await service.leaseResume(p, body);
      else if (op === "lease-release")
        data = await service.leaseRelease(p, body);
      else if (op === "passport") data = await service.read(p, body);
      else if (op === "evaluate")
        data = await service.evaluate(p, body, factory, requestId);
      else if (op === "receipt" || op === "status")
        data = await service.receipt(p, body, op === "status");
      else platformFail("INVALID_INPUT");
    }
    return Response.json(
      { status: "available", data, requestId },
      { headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
    );
  } catch (e) {
    return safePlatformError(e, requestId);
  }
}
