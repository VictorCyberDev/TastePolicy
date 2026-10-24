import { errorSpec } from "../lib/platform/errors";

// Deterministic, offline stand-in for the platform wire contract. It makes no
// network call, uses no provider and holds only synthetic data. Responses are
// shaped like production ones and the envelope carries `sandbox: true`.
export const SANDBOX_ORIGIN = "https://sandbox.tastepolicy.invalid";
export const SANDBOX_CREDENTIAL = `tp_live_00000000-0000-4000-8000-000000000000.${"S".repeat(43)}`;
const h = (c: string) => c.repeat(48);
export const SANDBOX_PASSPORTS = {
  own: `tp_${h("a")}`,
  expiredGrant: `tp_${h("b")}`,
  revokedGrant: `tp_${h("c")}`,
} as const;
const STATE_VERSION = 1;
const STATE_HASH = "5".repeat(64);
const CONTINUATION: Record<string, string[]> = {
  ALLOW: ["recommend", "add_to_draft"],
  ASK: ["request_clarification"],
  REJECT: ["do_not_proceed", "offer_repair"],
  UNAVAILABLE: ["do_not_assume_negative_preference"],
};
export type SandboxScenario = "ALLOW" | "ASK" | "REJECT" | "UNAVAILABLE";
function scenarioOf(name: unknown): SandboxScenario {
  const n = String(name ?? "").toUpperCase();
  for (const s of ["REJECT", "ASK", "UNAVAILABLE"] as const)
    if (n.includes(s)) return s;
  return "ALLOW";
}
const hex = (s: string) => {
  let x = 0;
  for (const c of s) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return x.toString(16).padStart(8, "0").repeat(6);
};
export function createSandbox() {
  const evaluations = new Map<string, Record<string, unknown>>();
  const operations = new Map<string, { payload: string; response: unknown }>();
  type SandboxLease = {
    leaseRef: string;
    status: string;
    rev: number;
    decision: string;
    evaluationRef: string;
  };
  const leases = new Map<string, SandboxLease>();
  const leaseView = (l: SandboxLease) => {
    const valid = l.status === "ACTIVE";
    return {
      schemaVersion: "taste-lease-v1",
      leaseRef: l.leaseRef,
      status: l.status,
      valid,
      permitted: valid ? ["recommend", "add_to_draft"] : [],
      reasons: [],
      expiresAt: "2026-01-01T00:15:00.000Z",
      checkpointDueAt: "2026-01-01T00:05:00.000Z",
      rev: l.rev,
      cacheable: false,
      ttlMs: 0,
    };
  };
  const ok = (data: unknown) =>
    Response.json({
      status: "available",
      data,
      requestId: "sandbox",
      sandbox: true,
    });
  const fail = (code: string) =>
    Response.json(
      { status: "error", code, requestId: "sandbox", sandbox: true },
      { status: errorSpec(code).http },
    );
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const request = new Request(input as URL, init);
    if (request.headers.get("authorization") !== `Bearer ${SANDBOX_CREDENTIAL}`)
      return fail("AUTH_REQUIRED");
    const op = new URL(request.url).pathname.split("/").at(-1);
    const body = (await request.json().catch(() => ({}))) as {
      passportRef?: string;
      idempotencyKey?: string;
      evaluationRef?: string;
      proposal?: {
        expectedStateVersion?: number;
        candidate?: { name?: string };
      };
    };
    if (op === "capabilities")
      return ok({
        schemaVersion: "tastepolicy-capabilities-v1",
        sandbox: true,
      });
    if (op === "passport" || op === "evaluate" || op === "policy") {
      const ref = String(body.passportRef ?? "");
      if (!Object.values(SANDBOX_PASSPORTS).includes(ref as never))
        return fail("PASSPORT_NOT_FOUND");
      if (ref === SANDBOX_PASSPORTS.expiredGrant) return fail("GRANT_EXPIRED");
      if (ref === SANDBOX_PASSPORTS.revokedGrant) return fail("GRANT_REVOKED");
    }
    if (op?.startsWith("lease")) {
      const b = body as { evaluationRef?: string; leaseRef?: string };
      if (op === "lease") {
        const e = evaluations.get(String(b.evaluationRef));
        if (!e) return fail("LEASE_NOT_FOUND");
        const decision = String(e.decision);
        if (decision !== "ALLOW" && decision !== "ASK")
          return fail("LEASE_NOT_PERMITTED");
        for (const l of leases.values())
          if (
            l.evaluationRef === e.evaluationRef &&
            ["ACTIVE", "ASK_PENDING", "SUSPENDED"].includes(l.status)
          )
            return fail("LEASE_STATE_CONFLICT");
        const l: SandboxLease = {
          leaseRef: `tl_${hex("lease" + leases.size + String(e.evaluationRef))}`,
          status: decision === "ALLOW" ? "ACTIVE" : "ASK_PENDING",
          rev: 1,
          decision,
          evaluationRef: String(e.evaluationRef),
        };
        leases.set(l.leaseRef, l);
        return ok(leaseView(l));
      }
      const l = leases.get(String(b.leaseRef));
      if (!l) return fail("LEASE_NOT_FOUND");
      if (op === "lease-checkpoint" && l.status === "ACTIVE") l.rev++;
      if (
        op === "lease-release" &&
        ["ACTIVE", "SUSPENDED"].includes(l.status)
      ) {
        l.status = "RELEASED";
        l.rev++;
      }
      return ok(leaseView(l));
    }
    if (op === "policy")
      return ok({
        schemaVersion: "taste-policy-summary-v1",
        passportRef: body.passportRef,
        policyVersion: null,
        autonomy: {
          brand: "AUTONOMOUS",
          place: "AUTONOMOUS",
          destination: "AUTONOMOUS",
        },
        limit: null,
        freshnessDays: {},
      });
    if (op === "passport")
      return ok({
        schemaVersion: "taste-passport-v1",
        passportRef: body.passportRef,
        stateVersion: STATE_VERSION,
        stateHash: STATE_HASH,
      });
    if (op === "evaluate") {
      const p = body.proposal ?? {};
      if (typeof body.idempotencyKey !== "string" || !p.candidate)
        return fail("INVALID_INPUT");
      if (p.expectedStateVersion !== STATE_VERSION)
        return fail("STATE_VERSION_CONFLICT");
      const payload = JSON.stringify(body),
        prior = operations.get(body.idempotencyKey);
      if (prior)
        return prior.payload === payload
          ? ok(prior.response)
          : fail("IDEMPOTENCY_KEY_CONFLICT");
      const decision = scenarioOf(p.candidate.name),
        ref = `tp_${hex(body.idempotencyKey + payload)}`,
        response = {
          schemaVersion: "taste-authorization-response-v1",
          subjectRef: `tps_${h("d")}`,
          evaluationRef: ref,
          passportRef: body.passportRef,
          stateVersion: STATE_VERSION,
          stateHash: STATE_HASH,
          decision,
          decisionBasis:
            decision === "UNAVAILABLE"
              ? "PROVIDER_UNAVAILABLE"
              : "SANDBOX_SCENARIO",
          unresolvedFactors:
            decision === "ASK" ? ["sandbox-unresolved-factor"] : [],
          receiptRef: ref,
          status: "COMPLETED",
          continuation: {
            schemaVersion: "taste-continuation-v1",
            permitted: CONTINUATION[decision],
            automaticRetry: false,
          },
          createdAt: "2026-01-01T00:00:00.000Z",
        };
      operations.set(body.idempotencyKey, { payload, response });
      evaluations.set(ref, response);
      return ok(response);
    }
    if (op === "receipt" || op === "status") {
      const e = evaluations.get(String(body.evaluationRef));
      if (!e) return fail("PASSPORT_NOT_FOUND");
      return ok(
        op === "status"
          ? e
          : {
              ...e,
              source: "recorded",
              receiptSchemaVersion: "taste-platform-receipt-v1",
            },
      );
    }
    return fail("INVALID_INPUT");
  }) as typeof fetch;
  // Owner actions are simulated here because the sandbox has no person.
  const owner = {
    approve(leaseRef: string) {
      const l = leases.get(leaseRef);
      if (l?.status === "ASK_PENDING") {
        l.status = "ACTIVE";
        l.rev++;
      }
    },
    revoke(leaseRef: string) {
      const l = leases.get(leaseRef);
      if (
        l &&
        !["REVOKED", "RELEASED", "DECLINED", "EXPIRED"].includes(l.status)
      ) {
        l.status = "REVOKED";
        l.rev++;
      }
    },
  };
  return {
    owner,
    fetch: fetchImpl,
    origin: SANDBOX_ORIGIN,
    credential: SANDBOX_CREDENTIAL,
  };
}
