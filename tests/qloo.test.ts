import { describe, it, expect, vi } from "vitest";
import { createQlooTransport, MAX_PROVIDER_BYTES } from "@/server/qloo/client";
import { createQlooAdapter } from "@/server/qloo/adapter";
import { normalizeEntity } from "@/server/qloo/types";
import { normalizeExplainability } from "@/server/qloo/explainability";
import {
  ids,
  signalIds,
  wireEntities,
  wireInsights,
  jsonResponse,
} from "./qloo-fixtures";
import type { QlooTransport } from "@/server/qloo/client";
const host = "https://hackathon.api.qloo.com" as const;
const transportFor =
  (data: unknown): QlooTransport =>
  async () => ({ status: "available", data });
describe("entity resolution normalization", () => {
  it("normalizes real wire fields and discards arbitrary metadata", () => {
    expect(normalizeEntity(wireEntities[0])).toEqual({
      id: ids[0],
      name: "Test artist 0",
      type: "artist",
      releaseYear: 2021,
    });
  });
  it("retains ambiguous matches rather than choosing first", async () => {
    const adapter = createQlooAdapter(
      transportFor({
        results: [wireEntities[0], { ...wireEntities[0], entity_id: ids[1] }],
      }),
      { host, scale: "unit" },
    );
    const r = await adapter.resolve({ query: "Test", expectedType: "artist" });
    expect(r).toMatchObject({
      status: "available",
      data: { state: "ambiguous" },
    });
    if (r.status === "available") expect(r.data.matches).toHaveLength(2);
  });
  it("represents no match without a fake entity", async () => {
    expect(
      await createQlooAdapter(transportFor({ results: [] }), { host }).resolve({
        query: "unknown",
        expectedType: "brand",
      }),
    ).toMatchObject({
      status: "available",
      data: { state: "no_match", matches: [] },
    });
  });
  it.each([
    {},
    { results: [{ name: "broken" }] },
    { success: false, results: [] },
    { results: [{ ...wireEntities[0], entity_id: "not-uuid" }] },
  ])("rejects malformed search payload %#", async (payload) => {
    expect(
      await createQlooAdapter(transportFor(payload), { host }).resolve({
        query: "Test",
        expectedType: "artist",
      }),
    ).toMatchObject({ status: "unavailable", reason: "invalid_response" });
  });
  it("rejects a mismatched entity type", async () => {
    expect(
      await createQlooAdapter(transportFor({ results: [wireEntities[0]] }), {
        host,
      }).resolve({ query: "Test", expectedType: "brand" }),
    ).toMatchObject({ status: "unavailable" });
  });
});
describe("Qloo transport and adapter", () => {
  it("constructs typed search with header-only authentication", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ results: [wireEntities[0]] }));
    const p = createQlooAdapter(
      createQlooTransport({ host, apiKey: "test-only-secret" }, fetcher),
      { host },
    );
    await p.resolve({ query: "Test artist", expectedType: "artist" });
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain(
      "/search?query=Test+artist&types=urn%3Aentity%3Aartist&take=12",
    );
    expect(String(url)).not.toContain("test-only-secret");
    expect(init).toMatchObject({
      headers: { "X-Api-Key": "test-only-secret" },
      redirect: "error",
      cache: "no-store",
    });
  });
  it("constructs cross-domain and separate candidate evidence queries", async () => {
    const t = vi
      .fn<QlooTransport>()
      .mockResolvedValue({ status: "available", data: wireInsights() });
    const p = createQlooAdapter(t, { host, scale: "unit" });
    await p.infer({ signalIds, targetType: "destination" });
    const first = t.mock.calls[0][1];
    expect(first.get("signal.interests.entities")).toBe(signalIds.join(","));
    expect(first.get("filter.type")).toBe("urn:entity:destination");
    expect(first.get("filter.exclude.entities")).toBe(signalIds.join(","));
    expect(first.get("feature.explainability")).toBe("true");
    await p.infer({
      signalIds,
      targetType: "destination",
      candidateId: ids[5],
    });
    const second = t.mock.calls[1][1];
    expect(second.get("filter.results.entities")).toBe(ids[5]);
    expect(second.has("filter.exclude.entities")).toBe(false);
    expect(second.get("take")).toBe("1");
  });
  it("verifies IDs through the server-side entities endpoint", async () => {
    const t = vi.fn<QlooTransport>().mockResolvedValue({
      status: "available",
      data: { results: [wireEntities[0]] },
    });
    const p = createQlooAdapter(t, { host });
    expect((await p.entities([ids[0]])).status).toBe("available");
    expect(t.mock.calls[0][0]).toBe("/entities");
    expect(t.mock.calls[0][1].get("entity_ids")).toBe(ids[0]);
  });
  it("needs explicit scale; never guesses from magnitude", async () => {
    expect(
      await createQlooAdapter(transportFor(wireInsights()), { host }).infer({
        signalIds,
        targetType: "destination",
      }),
    ).toEqual({ status: "unavailable", reason: "affinity_scale_unverified" });
  });
  it("preserves raw affinity, normalized score, rank and provenance", async () => {
    const r = await createQlooAdapter(
      transportFor(wireInsights(90)),
      { host, scale: "percent" },
      () => "test-time",
    ).infer({ signalIds, targetType: "destination", candidateId: ids[5] });
    expect(r).toMatchObject({
      status: "available",
      data: {
        candidates: [{ rawAffinity: 90, alignmentScore: 0.9, rank: 1 }],
        provenance: {
          provider: "qloo",
          endpoint: "/v2/insights",
          host,
          fetchedAt: "test-time",
          specificCandidateId: ids[5],
        },
      },
    });
    expect(JSON.stringify(r)).not.toContain("MUST_NOT_LEAK");
  });
  it.each(["bad", null, 101, -1])(
    "rejects malformed affinity %s",
    async (score) => {
      expect(
        await createQlooAdapter(transportFor(wireInsights(score)), {
          host,
          scale: "percent",
        }).infer({ signalIds, targetType: "destination" }),
      ).toMatchObject({ status: "unavailable", reason: "invalid_response" });
    },
  );
  it("no result does not become negative evidence", async () => {
    expect(
      await createQlooAdapter(
        transportFor({ success: true, results: { entities: [] } }),
        { host, scale: "unit" },
      ).infer({ signalIds, targetType: "destination" }),
    ).toEqual({ status: "unavailable", reason: "no_evidence" });
  });
  it("rejects an unrelated specific candidate", async () => {
    expect(
      await createQlooAdapter(transportFor(wireInsights()), {
        host,
        scale: "unit",
      }).infer({ signalIds, targetType: "destination", candidateId: ids[4] }),
    ).toMatchObject({ status: "unavailable", reason: "invalid_response" });
  });
  it.each([
    [401, "auth_failed"],
    [403, "auth_failed"],
    [429, "rate_limited"],
    [500, "provider_error"],
  ])(
    "normalizes HTTP %i without credentials/raw errors",
    async (status, reason) => {
      const f = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse(
            { error: { reason: "test-only-secret", stack: "private" } },
            status as number,
          ),
        );
      const r = await createQlooTransport(
        { host, apiKey: "test-only-secret" },
        f,
      )("/search", new URLSearchParams());
      expect(r).toEqual({ status: "unavailable", reason });
      expect(JSON.stringify(r)).not.toContain("test-only-secret");
    },
  );
  it("fails safely with missing key or unapproved host", async () => {
    const f = vi.fn<typeof fetch>();
    expect(
      await createQlooTransport({ host }, f)("/search", new URLSearchParams()),
    ).toMatchObject({ reason: "not_configured" });
    expect(
      await createQlooTransport(
        { apiKey: "test", host: "http://127.0.0.1" as typeof host },
        f,
      )("/search", new URLSearchParams()),
    ).toMatchObject({ reason: "host_not_configured" });
    expect(f).not.toHaveBeenCalled();
  });
  it("times out without retrying or leaking thrown messages", async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) =>
            init?.signal?.addEventListener("abort", () =>
              reject(new Error("private-secret")),
            ),
          ),
      );
    expect(
      await createQlooTransport(
        { host, apiKey: "test" },
        f,
        5,
      )("/search", new URLSearchParams()),
    ).toEqual({ status: "unavailable", reason: "timeout" });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("rejects non-JSON and oversized upstream payloads", async () => {
    for (const response of [
      new Response("<html>private</html>"),
      new Response("x".repeat(MAX_PROVIDER_BYTES + 1), {
        headers: { "content-type": "application/json" },
      }),
    ]) {
      const f = vi.fn<typeof fetch>().mockResolvedValue(response);
      expect(
        await createQlooTransport({ host, apiKey: "test" }, f)(
          "/search",
          new URLSearchParams(),
        ),
      ).toEqual({ status: "unavailable", reason: "invalid_response" });
    }
  });
});
describe("explainability", () => {
  it("preserves only real per-input unit scores without renormalizing", () => {
    expect(
      normalizeExplainability(
        {
          entities: [
            { entity_id: ids[0], score: 0.31 },
            { entity_id: ids[1], score: 0.26 },
            { entity_id: ids[5], score: 0.9 },
          ],
        },
        signalIds,
      ),
    ).toEqual({
      status: "available",
      contributions: [
        { signalId: ids[0], score: 0.31 },
        { signalId: ids[1], score: 0.26 },
      ],
      omittedSignalsMayHaveLowImpact: true,
    });
  });
  it.each([
    [undefined, "not_returned"],
    [{ warning: "provider detail" }, "provider_warning"],
    [{ entities: [{ entity_id: ids[0], score: 20 }] }, "unsupported_shape"],
  ])("explicitly marks unavailable explanation %#", (raw, reason) => {
    expect(normalizeExplainability(raw, signalIds)).toEqual({
      status: "unavailable",
      reason,
    });
  });
});
