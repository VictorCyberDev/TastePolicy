import { describe, it, expect } from "vitest";
import observed from "./fixtures/qloo-event-observed.json";
import { normalizeEntity } from "@/server/qloo/types";
import { createQlooAdapter } from "@/server/qloo/adapter";
import { evaluateEvidence } from "@/server/policy/evaluate";
import { createReceipt } from "@/server/receipts/createReceipt";
const host = "https://hackathon.api.qloo.com";
const signals = observed.lookup.results.map((e) => normalizeEntity(e)!);
const signalIds = signals.map((s) => s.id);
describe("observed event-host contract regressions", () => {
  it("reads lookup types arrays without inventing scalar aliases", () => {
    expect(signals).toHaveLength(5);
    expect(new Set(signals.map((e) => e.type)).size).toBe(5);
    expect(signals[0]).toMatchObject({ name: "Nils Frahm", type: "artist" });
    expect(
      normalizeEntity({
        ...observed.lookup.results[0],
        types: ["urn:entity:artist", "urn:entity:brand"],
      }),
    ).toBeNull();
    expect(
      normalizeEntity({
        entity_id: signalIds[0],
        name: "Nils Frahm",
        type: "artist",
      }),
    ).toBeNull();
  });
  it("requires the separate observed Insights shape", () => {
    const e = observed.place.results.entities[0];
    expect(normalizeEntity(e, "insights")).toMatchObject({ type: "place" });
    expect(normalizeEntity(e, "lookup")).toBeNull();
    expect(normalizeEntity(observed.lookup.results[0], "insights")).toBeNull();
  });
  for (const targetType of ["place", "brand", "destination"] as const) {
    it(`preserves real ${targetType} candidate affinity and receipt provenance`, async () => {
      const p = createQlooAdapter(
        async () => ({ status: "available", data: observed[targetType] }),
        { host, scale: "unit" },
        () => "2026-10-13T13:00:00Z",
      );
      const wire = observed[targetType].results.entities[0];
      const r = await p.infer({
        signalIds,
        targetType,
        candidateId: wire.entity_id.toLowerCase(),
      });
      expect(r.status).toBe("available");
      if (r.status !== "available") throw Error("Observed evidence rejected");
      const e = r.data.candidates[0];
      expect(e.rawAffinity).toBe(wire.query.affinity);
      expect(e.alignmentScore).toBe(wire.query.affinity);
      expect(e.explainability.status).toBe(
        targetType === "destination" ? "partial" : "complete",
      );
      const d = evaluateEvidence(e);
      expect(d).toMatchObject({
        status: "available",
        data: { outcome: "ALLOW" },
      });
      if (d.status !== "available") throw Error("No decision");
      const receipt = createReceipt(
        {
          signals,
          action: { kind: "SELECT_ENTITY", targetEntity: e.entity },
          evidence: e,
          provenance: r.data.provenance,
          decision: d.data,
          requestId: signalIds[0],
        },
        () => "2026-10-13T13:00:00Z",
        () => signalIds[1],
      );
      expect(receipt.qlooEvidence.rawAffinity).toBe(wire.query.affinity);
      expect(receipt.candidate.id).toBe(wire.entity_id.toLowerCase());
      expect(evaluateEvidence(e)).toEqual(d);
    });
  }
  it("preserves destination not-found warning without pretending every signal contributed", async () => {
    const p = createQlooAdapter(
      async () => ({ status: "available", data: observed.destination }),
      { host, scale: "unit" },
    );
    const r = await p.infer({ signalIds, targetType: "destination" });
    expect(r).toMatchObject({
      status: "available",
      data: {
        candidates: [
          {
            explainability: {
              status: "partial",
              issues: ["missing_signals", "provider_warning"],
              missingSignalIds: [signalIds[3]],
            },
          },
        ],
      },
    });
  });
  it("rejects the former guessed explanation key", async () => {
    const p = structuredClone(observed.place);
    const q = p.results.entities[0].query as Record<string, unknown>;
    q.explainability = { entities: [{ entity_id: signalIds[0], score: 0.5 }] };
    const r = await createQlooAdapter(
      async () => ({ status: "available", data: p }),
      { host, scale: "unit" },
    ).infer({ signalIds, targetType: "place" });
    expect(r).toMatchObject({
      status: "available",
      data: {
        candidates: [
          {
            explainability: {
              status: "unavailable",
              reason: "unsupported_shape",
            },
          },
        ],
      },
    });
  });
});
