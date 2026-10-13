import { describe, it, expect, vi } from "vitest";
import { evaluateAction, discover } from "@/server/taste/service";
import { createReceipt } from "@/server/receipts/createReceipt";
import { normalizeExplainability } from "@/server/qloo/explainability";
import {
  createQlooTransport,
  MAX_PROVIDER_CALLS_PER_REQUEST,
} from "@/server/qloo/client";
import { createQlooAdapter } from "@/server/qloo/adapter";
import { handleDemo } from "@/server/taste/http";
import { readJsonBody } from "@/server/taste/read-body";
import type { QlooProvider } from "@/server/qloo/contracts";
import type {
  CulturalEvidence,
  InferenceResult,
  CulturalReceipt,
} from "@/types/domain";
import { signalIds, entities, ids, jsonResponse } from "./qloo-fixtures";
// Pure verifier assertions; synthetic test data never executes the live runner.
import {
  validateReceipt,
  acceptanceState,
  failureState,
  compareRepeat,
} from "../scripts/qloo-proof-contract.mjs";
const host = "https://hackathon.api.qloo.com" as const;
const provenance: InferenceResult["provenance"] = {
  provider: "qloo",
  endpoint: "/v2/insights",
  host,
  fetchedAt: "2026-10-10T00:00:00Z",
  signalIds,
  targetType: "destination",
  specificCandidateId: ids[5],
};
const evidence: CulturalEvidence = {
  entity: entities[5],
  rawAffinity: 0.9,
  alignmentScore: 0.9,
  scale: "unit",
  rank: 1,
  explainability: { status: "unavailable", reason: "not_returned" },
};
function receiptInput() {
  return structuredClone({
    action: { kind: "SELECT_ENTITY" as const, targetEntity: entities[5] },
    signals: entities.slice(0, 5),
    evidence,
    provenance,
    decision: {
      outcome: "ALLOW" as const,
      reasonCode: "STRONG_ALIGNMENT" as const,
    },
    requestId: ids[0],
  });
}
function provider(): QlooProvider {
  return {
    resolve: vi.fn(),
    entities: vi.fn(async (requested) => ({
      status: "available" as const,
      data: entities.filter((e) => requested.includes(e.id)),
    })),
    infer: vi.fn(async () => ({
      status: "available" as const,
      data: {
        candidates: [structuredClone(evidence)],
        provenance: structuredClone(provenance),
      },
    })),
  };
}
function receipt(): CulturalReceipt {
  return createReceipt(
    receiptInput(),
    () => "2026-10-10T00:00:00Z",
    () => ids[1],
  );
}
function streamRequest(stream: ReadableStream<Uint8Array>) {
  return new Request("http://localhost/api/demo/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit);
}
describe("service-owned invariants", () => {
  it.each(
    [
      [],
      signalIds.slice(0, 4),
      [...signalIds, ids[5]],
      [...signalIds.slice(0, 4), ids[0]],
      [
        "00000000-0000-4000-8000-00000000000a",
        ...signalIds.slice(1, 4),
        "00000000-0000-4000-8000-00000000000A",
      ],
      [...signalIds.slice(0, 4), "not-an-id"],
    ].map((signals) => ({ signals })),
  )(
    "blocks invalid direct-call signal set %# before provider calls",
    async ({ signals }) => {
      const p = provider();
      expect((await evaluateAction(p, signals, ids[5], "request")).status).toBe(
        "unavailable",
      );
      expect((await discover(p, signals, "destination")).status).toBe(
        "unavailable",
      );
      expect(p.entities).not.toHaveBeenCalled();
      expect(p.infer).not.toHaveBeenCalled();
    },
  );
  it("blocks a candidate already present among signals", async () => {
    const p = provider();
    expect((await evaluateAction(p, signalIds, ids[0], "request")).status).toBe(
      "unavailable",
    );
    expect(p.entities).not.toHaveBeenCalled();
  });
  it.each([
    "single-domain",
    "malformed-entity",
    "null-id",
    "duplicate-response",
    "missing-signal",
  ])("rejects %s resolved profiles", async (scenario) => {
    const p = provider();
    const data = structuredClone(entities);
    if (scenario === "single-domain")
      data.slice(0, 5).forEach((e) => {
        e.type = "artist";
      });
    if (scenario === "malformed-entity") data[0].name = "";
    if (scenario === "null-id") data[0].id = null as unknown as string;
    if (scenario === "duplicate-response") data.push(data[0]);
    if (scenario === "missing-signal") data.splice(0, 1);
    p.entities = vi.fn(async () => ({ status: "available" as const, data }));
    expect((await evaluateAction(p, signalIds, ids[5], "request")).status).toBe(
      "unavailable",
    );
    expect(p.infer).not.toHaveBeenCalled();
  });
  it("rejects unsupported action target types before inference", async () => {
    const p = provider();
    p.entities = async () => ({
      status: "available",
      data: [...entities.slice(0, 5), { ...entities[5], type: "artist" }],
    });
    expect((await evaluateAction(p, signalIds, ids[5], "request")).status).toBe(
      "unavailable",
    );
    expect(p.infer).not.toHaveBeenCalled();
  });
  it.each(["wrong-id", "wrong-type", "wrong-provenance"])(
    "rejects %s candidate evidence",
    async (scenario) => {
      const p = provider();
      const e = structuredClone(evidence),
        prov = structuredClone(provenance);
      if (scenario === "wrong-id") e.entity.id = ids[0];
      if (scenario === "wrong-type") e.entity.type = "brand";
      if (scenario === "wrong-provenance") prov.signalIds = signalIds.slice(1);
      p.infer = async () => ({
        status: "available",
        data: { candidates: [e], provenance: prov },
      });
      expect(
        (await evaluateAction(p, signalIds, ids[5], "request")).status,
      ).toBe("unavailable");
    },
  );
  it("rejects invalid discovery target and candidates", async () => {
    const p = provider();
    expect((await discover(p, signalIds, "artist" as "brand")).status).toBe(
      "unavailable",
    );
    expect(p.entities).not.toHaveBeenCalled();
    p.infer = async () => ({
      status: "available",
      data: { candidates: [{ ...evidence, entity: entities[0] }], provenance },
    });
    expect((await discover(p, signalIds, "destination")).status).toBe(
      "unavailable",
    );
  });
});
describe("receipt snapshots and consistency", () => {
  it("snapshots all nested inputs and exposes explicit versions", () => {
    const input = receiptInput(),
      r = createReceipt(input);
    const before = JSON.stringify(r);
    input.signals[0].name = "changed";
    input.action.targetEntity.name = "changed";
    input.evidence.entity.name = "changed";
    input.provenance.signalIds.reverse();
    input.decision.outcome = "REJECT" as "ALLOW";
    expect(JSON.stringify(r)).toBe(before);
    expect(r).toMatchObject({
      schemaVersion: "cultural-receipt-v1",
      normalizationVersion: "affinity-explicit-scale-v1",
      policyVersion: "tastepolicy-v1-experimental",
      policy: { allowAbove: 0.8, rejectBelow: 0.5 },
    });
  });
  it.each([
    "decision",
    "reason",
    "score",
    "candidate-id",
    "candidate-type",
    "provenance",
    "profile",
  ])("refuses inconsistent %s", (scenario) => {
    const input = receiptInput();
    if (scenario === "decision") input.decision.outcome = "REJECT" as "ALLOW";
    if (scenario === "reason")
      input.decision.reasonCode = "WEAK_ALIGNMENT" as "STRONG_ALIGNMENT";
    if (scenario === "score") input.evidence.alignmentScore = 0.1;
    if (scenario === "candidate-id") input.action.targetEntity.id = ids[0];
    if (scenario === "candidate-type") input.action.targetEntity.type = "brand";
    if (scenario === "provenance")
      input.provenance.specificCandidateId = ids[0];
    if (scenario === "profile") input.signals[0] = input.signals[1];
    expect(() => createReceipt(input)).toThrow("Invalid receipt evidence");
  });
  it("drops arbitrary metadata and does not invent a provider request ID", () => {
    const input = receiptInput();
    Object.assign(input.evidence.entity, { private_field: "must-not-leak" });
    Object.assign(input.provenance, { headers: { secret: "must-not-leak" } });
    const r = createReceipt(input);
    expect(JSON.stringify(r)).not.toContain("must-not-leak");
    expect(r.qlooEvidence.provenance).not.toHaveProperty("providerRequestId");
  });
  it("snapshots explanation contributions and omission arrays", () => {
    const input = receiptInput();
    input.evidence.explainability = normalizeExplainability(
      {
        "signal.interests.entities": signalIds.map((entity_id) => ({
          entity_id,
          score: 0.2,
        })),
      },
      signalIds,
    );
    const r = createReceipt(input);
    if (input.evidence.explainability.status !== "unavailable")
      input.evidence.explainability.contributions[0].score = 0.9;
    expect(r.explainability).toMatchObject({
      status: "complete",
      contributions: signalIds.map((signalId) => ({ signalId, score: 0.2 })),
    });
  });
});
describe("conservative explainability", () => {
  it("reports partial parsing for valid plus malformed contribution", () => {
    expect(
      normalizeExplainability(
        {
          "signal.interests.entities": [
            { entity_id: ids[0], score: 0.3 },
            { entity_id: ids[1], score: 20 },
          ],
        },
        signalIds,
      ),
    ).toMatchObject({
      status: "partial",
      contributions: [{ signalId: ids[0], score: 0.3 }],
      issues: ["malformed_contribution", "missing_signals"],
      omission: "unknown",
    });
  });
  it("does not interpret affinity as a contribution", () => {
    expect(
      normalizeExplainability(
        { "signal.interests.entities": [{ entity_id: ids[0], affinity: 0.9 }] },
        signalIds,
      ),
    ).toEqual({ status: "unavailable", reason: "malformed_contribution" });
  });
  it("rejects unknown maps rather than guessing their semantics", () => {
    expect(normalizeExplainability({ [ids[0]]: 0.3 }, signalIds)).toEqual({
      status: "unavailable",
      reason: "unsupported_shape",
    });
  });
  it("distinguishes explicit omission supplied by an adapter from unexplained gaps", () => {
    const raw = {
      "signal.interests.entities": [{ entity_id: ids[0], score: 0.3 }],
    };
    expect(normalizeExplainability(raw, signalIds)).toMatchObject({
      status: "partial",
      omission: "unknown",
    });
    expect(
      normalizeExplainability(raw, signalIds, {
        omittedSignalIds: signalIds.slice(1),
      }),
    ).toMatchObject({
      status: "complete",
      omission: "explicit_provider_omission",
      omittedSignalIds: signalIds.slice(1),
      issues: [],
    });
  });
  it("records top-level warning without returning its raw text", () => {
    const r = normalizeExplainability(
      {
        "signal.interests.entities": signalIds.map((entity_id) => ({
          entity_id,
          score: 0.2,
        })),
      },
      signalIds,
      { warning: "private provider detail" },
    );
    expect(r).toMatchObject({
      status: "partial",
      issues: ["provider_warning"],
    });
    expect(JSON.stringify(r)).not.toContain("private provider detail");
    expect(
      normalizeExplainability(undefined, signalIds, { warning: true }),
    ).toEqual({ status: "unavailable", reason: "provider_warning" });
  });
  it("integrates the documented top-level warning location", async () => {
    const { wireInsights } = await import("./qloo-fixtures");
    const data = {
      ...wireInsights(),
      query: { explainability: { warning: "private detail" } },
    };
    const r = await createQlooAdapter(
      async () => ({ status: "available", data }),
      { host, scale: "unit" },
    ).infer({ signalIds, targetType: "destination" });
    expect(r).toMatchObject({
      status: "available",
      data: {
        candidates: [
          {
            explainability: {
              status: "partial",
              issues: ["missing_signals", "provider_warning"],
            },
          },
        ],
      },
    });
  });
  it("keeps missing explanation explicit", () =>
    expect(normalizeExplainability(undefined, signalIds)).toEqual({
      status: "unavailable",
      reason: "not_returned",
    }));
});
describe("transport and HTTP budgets", () => {
  it.each(["/search", "/entities", "/v2/insights"] as const)(
    "classifies 404 by endpoint %s",
    async (path) => {
      const t = createQlooTransport(
        { host, apiKey: "synthetic-test-only" },
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(jsonResponse({ private: "secret" }, 404)),
      );
      expect(await t(path, new URLSearchParams())).toEqual({
        status: "unavailable",
        reason: path === "/search" ? "no_evidence" : "provider_error",
      });
    },
  );
  it("caps actual provider calls per request", async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => jsonResponse({ results: [] }));
    const t = createQlooTransport({ host, apiKey: "synthetic-test-only" }, f);
    const all = await Promise.all(
      Array.from({ length: MAX_PROVIDER_CALLS_PER_REQUEST + 1 }, () =>
        t("/search", new URLSearchParams()),
      ),
    );
    expect(f).toHaveBeenCalledTimes(MAX_PROVIDER_CALLS_PER_REQUEST);
    expect(all.at(-1)).toEqual({
      status: "unavailable",
      reason: "request_budget_exhausted",
    });
  });
  it("rejects malformed JSON before provider work", async () => {
    const p = provider();
    const r = await handleDemo(
      new Request("http://localhost/api/demo/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      "evaluate",
      p,
    );
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ code: "INVALID_INPUT" });
    expect(p.entities).not.toHaveBeenCalled();
  });
  it("bounds stalled body reads and cancels without waiting for cancel hooks", async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const p = provider();
    const request = streamRequest(new ReadableStream({ cancel }));
    const r = await handleDemo(request, "evaluate", p, 5);
    expect(r.status).toBe(408);
    expect(await r.json()).toMatchObject({ code: "BODY_READ_TIMEOUT" });
    expect(cancel).toHaveBeenCalled();
    expect(p.entities).not.toHaveBeenCalled();
  });
  it("uses a total body deadline rather than resetting it per chunk", async () => {
    const { readJsonBody: read } = await import("@/server/taste/read-body");
    vi.useFakeTimers();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const request = streamRequest(
      new ReadableStream({
        start(c) {
          controller = c;
        },
      }),
    );
    const task = read(request, 20);
    const assertion = expect(task).rejects.toThrow("BODY_READ_TIMEOUT");
    await vi.advanceTimersByTimeAsync(10);
    controller.enqueue(new TextEncoder().encode("{"));
    await vi.advanceTimersByTimeAsync(11);
    await assertion;
    vi.useRealTimers();
  });
  it("rejects invalid UTF-8 rather than silently replacing bytes", async () => {
    const request = streamRequest(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array([0xff]));
          c.close();
        },
      }),
    );
    await expect(readJsonBody(request)).rejects.toThrow("INVALID_INPUT");
  });
  it("enforces concurrency and per-window limits with idempotent releases", async () => {
    vi.resetModules();
    const { acquireDemoBudget: acquire } =
      await import("@/server/taste/budget");
    const now = Date.now() + 60000;
    const releases = Array.from({ length: 4 }, () => acquire(now));
    expect(releases.every(Boolean)).toBe(true);
    expect(acquire(now)).toBeNull();
    for (const release of releases) {
      release!();
      release!();
    }
    for (let i = 4; i < 30; i++) acquire(now)!();
    expect(acquire(now)).toBeNull();
    const next = acquire(now + 60000);
    expect(next).not.toBeNull();
    next!();
  });
});
describe("live verifier acceptance contract (synthetic tests only)", () => {
  it("validates full receipts and rejects wrong identity or inconsistent decisions", () => {
    const r = receipt();
    expect(validateReceipt(r, entities.slice(0, 5), entities[5])).toBe(r);
    expect(() =>
      validateReceipt(
        { ...r, decision: { outcome: "REJECT", reasonCode: "WEAK_ALIGNMENT" } },
        entities.slice(0, 5),
        entities[5],
      ),
    ).toThrow("CONTRACT_MISMATCH");
    expect(() => validateReceipt(r, entities.slice(0, 5), entities[0])).toThrow(
      "CONTRACT_MISMATCH",
    );
  });
  it("does not mistake a failure containing a decision for valid evidence", () => {
    expect(
      failureState({ status: "unavailable", reason: "not_configured" }),
    ).toBe("NOT_CONFIGURED");
    expect(failureState({ status: "unavailable", reason: "auth_failed" })).toBe(
      "AUTH_FAILED",
    );
    expect(() =>
      failureState({
        status: "unavailable",
        reason: "timeout",
        decision: { outcome: "REJECT" },
      }),
    ).toThrow("CONTRACT_MISMATCH");
  });
  it("requires reviewed wire/UI/calibration evidence in addition to three evaluations", () => {
    const summary = {
      domainsProbed: 3,
      evaluations: 3,
      stableRepeat: true,
      contractsValid: true,
      liveEvidence: true,
      scale: "unit",
      host,
      policyVersion: "tastepolicy-v1-experimental",
      signalIds,
    };
    expect(acceptanceState(summary)).toBe("PARTIAL_LIVE_PROOF");
    const review = {
      wireContractVerified: true,
      canonicalIdentitiesReviewed: true,
      fullLiveUiVerified: true,
      thresholdsReviewed: true,
      scaleVerified: "unit",
      host,
      policyVersion: summary.policyVersion,
      signalIds,
      reviewedAt: "2026-10-10T00:00:00Z",
    };
    expect(acceptanceState(summary, review)).toBe("LIVE_ACCEPTANCE_PASSED");
    expect(acceptanceState({ ...summary, evaluations: 1 }, review)).toBe(
      "PARTIAL_LIVE_PROOF",
    );
    expect(
      acceptanceState(summary, { ...review, scaleVerified: "percent" }),
    ).toBe("PARTIAL_LIVE_PROOF");
  });
  it("compares repeated scores, decisions and explanations explicitly", () => {
    const a = receipt(),
      b = receipt();
    expect(Object.values(compareRepeat(a, b)).every(Boolean)).toBe(true);
    b.alignmentScore = 0.89;
    expect(compareRepeat(a, b).sameScore).toBe(false);
  });
});
