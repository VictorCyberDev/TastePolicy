import { describe, it, expect, vi } from "vitest";
import { normalizeAffinity } from "@/server/policy/normalization";
import { evaluateEvidence } from "@/server/policy/evaluate";
import { POLICY_V1 } from "@/server/policy/thresholds";
import { createReceipt } from "@/server/receipts/createReceipt";
import { evaluateAction, discover } from "@/server/taste/service";
import { handleDemo } from "@/server/taste/http";
import { createQlooAdapter } from "@/server/qloo/adapter";
import { createQlooTransport } from "@/server/qloo/client";
import { validateEnvironment } from "@/lib/env/schema";
import type { QlooProvider } from "@/server/qloo/contracts";
import type {
  CulturalEvidence,
  InferenceResult,
  UnavailableReason,
} from "@/types/domain";
import { ids, signalIds, entities } from "./qloo-fixtures";
const evidence = (score: number): CulturalEvidence => ({
  entity: entities[5],
  rawAffinity: score,
  alignmentScore: score,
  scale: "unit",
  rank: 1,
  explainability: { status: "unavailable", reason: "not_returned" },
});
const provenance: InferenceResult["provenance"] = {
  provider: "qloo",
  endpoint: "/v2/insights",
  host: "https://hackathon.api.qloo.com",
  fetchedAt: "2026-10-10T00:00:00.000Z",
  signalIds,
  targetType: "destination",
  specificCandidateId: ids[5],
};
function provider(score = 0.9): QlooProvider {
  return {
    resolve: vi.fn(),
    entities: vi.fn(async () => ({
      status: "available" as const,
      data: entities,
    })),
    infer: vi.fn(async () => ({
      status: "available" as const,
      data: { candidates: [evidence(score)], provenance },
    })),
  };
}
function request(body: unknown) {
  return new Request("http://localhost/api/demo/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
describe("affinity and policy boundaries", () => {
  it.each([
    [0, 0],
    [50, 0.5],
    [80, 0.8],
    [100, 1],
  ])("normalizes percent %i", (raw, score) =>
    expect(normalizeAffinity(raw, "percent")).toBe(score),
  );
  it.each([0, 0.5, 0.8, 1])("preserves unit %s", (score) =>
    expect(normalizeAffinity(score, "unit")).toBe(score),
  );
  it.each([NaN, Infinity, -1, 101, "90", null, undefined])(
    "rejects malformed value %#",
    (raw) => expect(normalizeAffinity(raw, "percent")).toBeNull(),
  );
  it("rejects out-of-range unit scores and unsupported scales", () => {
    expect(normalizeAffinity(1.01, "unit")).toBeNull();
    expect(normalizeAffinity(0.9, "unknown" as "unit")).toBeNull();
  });
  it.each([
    [0, "REJECT"],
    [0.49999, "REJECT"],
    [0.5, "ASK"],
    [0.8, "ASK"],
    [0.80001, "ALLOW"],
    [1, "ALLOW"],
  ])("maps exact boundary %s to %s", (score, outcome) =>
    expect(evaluateEvidence(evidence(score as number))).toMatchObject({
      status: "available" as const,
      data: { outcome },
    }),
  );
  it("missing or inconsistent evidence is never a decision", () => {
    expect(evaluateEvidence(null)).toEqual({
      status: "unavailable",
      reason: "no_evidence",
    });
    expect(
      evaluateEvidence({ ...evidence(0.9), rawAffinity: 20 }),
    ).toMatchObject({ status: "unavailable" });
  });
  it("rejects SSRF origins and unknown scales in environment validation", () => {
    for (const host of [
      "http://localhost",
      "https://hackathon.api.qloo.com/evil",
      "https://hackathon.api.qloo.com.evil.com",
    ]) {
      expect(() => validateEnvironment({ QLOO_API_BASE_URL: host })).toThrow(
        "Invalid QLOO_API_BASE_URL",
      );
    }
    expect(() =>
      validateEnvironment({ QLOO_AFFINITY_SCALE: "guess" }),
    ).toThrow();
  });
});
describe("service failure semantics and receipt", () => {
  it.each([
    "not_configured",
    "auth_failed",
    "provider_error",
    "timeout",
    "no_evidence",
    "invalid_response",
  ] as UnavailableReason[])(
    "provider %s never becomes REJECT",
    async (reason) => {
      const p = provider();
      p.infer = async () => ({ status: "unavailable", reason });
      expect(await evaluateAction(p, signalIds, ids[5], "request")).toEqual({
        status: "unavailable",
        reason,
      });
    },
  );
  it("creates inspectable required fields and provenance deterministically", () => {
    const e = evidence(0.9);
    const decision = evaluateEvidence(e);
    if (decision.status !== "available") throw Error("test setup");
    const r = createReceipt(
      {
        action: { kind: "SELECT_ENTITY", targetEntity: entities[5] },
        signals: entities.slice(0, 5),
        evidence: e,
        provenance,
        decision: decision.data,
        requestId: "request",
      },
      () => "test-time",
      () => "receipt-id",
    );
    expect(r).toMatchObject({
      receiptId: "receipt-id",
      policyVersion: POLICY_V1.version,
      requestId: "request",
      evaluatedAt: "test-time",
      alignmentScore: 0.9,
      decision: { outcome: "ALLOW" },
      qlooEvidence: { rawAffinity: 0.9, scale: "unit", provenance },
      policy: { allowAbove: 0.8, rejectBelow: 0.5 },
    });
    expect(r.inputSignals).toHaveLength(5);
  });
  it("discovery verifies the profile before using cross-domain signals", async () => {
    const p = provider();
    p.entities = async () => ({
      status: "available" as const,
      data: entities.slice(0, 5),
    });
    expect((await discover(p, signalIds, "destination")).status).toBe(
      "available",
    );
    expect(p.infer).toHaveBeenCalledWith({
      signalIds,
      targetType: "destination",
    });
  });
  it("does not evaluate unresolved or single-domain profiles", async () => {
    const p = provider();
    p.entities = async () => ({
      status: "available" as const,
      data: entities.slice(0, 4),
    });
    expect(await evaluateAction(p, signalIds, ids[5], "id")).toMatchObject({
      status: "unavailable",
    });
    expect(p.infer).not.toHaveBeenCalled();
  });
});
describe("HTTP boundary", () => {
  it.each([
    {},
    { signalIds },
    { signalIds: [...signalIds.slice(0, 4), ids[0]], candidateId: ids[5] },
    { signalIds, candidateId: ids[5], alignmentScore: 0.99 },
    { signalIds, candidateId: "http://localhost" },
  ])("rejects invalid/untrusted input %#", async (body) => {
    const r = await handleDemo(request(body), "evaluate", provider());
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ code: "INVALID_INPUT" });
  });
  it("returns a successful evaluation receipt, never caller-supplied scores", async () => {
    const r = await handleDemo(
      request({ signalIds, candidateId: ids[5] }),
      "evaluate",
      provider(),
    );
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toMatchObject({
      status: "available" as const,
      data: {
        alignmentScore: 0.9,
        decision: { outcome: "ALLOW" },
        action: { kind: "SELECT_ENTITY" },
      },
    });
    expect(body.data.requestId).toBe(r.headers.get("x-request-id"));
  });
  it("real unconfigured adapter returns 503 without credentials", async () => {
    const p = createQlooAdapter(createQlooTransport({}), {});
    const r = await handleDemo(
      request({ signalIds, candidateId: ids[5] }),
      "evaluate",
      p,
    );
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({
      status: "unavailable",
      reason: "not_configured",
    });
  });
  it("missing candidate evidence returns 422 with no decision", async () => {
    const p = provider();
    p.infer = async () => ({
      status: "available" as const,
      data: { candidates: [], provenance },
    });
    const r = await handleDemo(
      request({ signalIds, candidateId: ids[5] }),
      "evaluate",
      p,
    );
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({
      status: "unavailable",
      reason: "no_evidence",
    });
  });
  it("accepts the public Host when Next uses an internal request hostname", async () => {
    const r = request({ signalIds, candidateId: ids[5] });
    r.headers.set("Host", "127.0.0.1:3000");
    r.headers.set("Origin", "http://127.0.0.1:3000");
    expect((await handleDemo(r, "evaluate", provider())).status).toBe(200);
  });
  it("rejects oversized bodies and cross-origin requests", async () => {
    expect(
      (
        await handleDemo(
          request({ padding: "x".repeat(17000) }),
          "evaluate",
          provider(),
        )
      ).status,
    ).toBe(413);
    const r = request({ signalIds, candidateId: ids[5] });
    r.headers.set("Origin", "https://evil.example");
    expect((await handleDemo(r, "evaluate", provider())).status).toBe(403);
  });
  it("normalizes unexpected exceptions without stack traces", async () => {
    const p = provider();
    p.entities = async () => {
      throw Error("secret-token");
    };
    const r = await handleDemo(
      request({ signalIds, candidateId: ids[5] }),
      "evaluate",
      p,
    );
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("secret-token");
  });
});
