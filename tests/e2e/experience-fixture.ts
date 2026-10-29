// SYNTHETIC TEST DATA — browser contract fixture, never a live acceptance claim.
// Qloo, the place provider and persistence are mocked at the network edge; the
// decision logic under test is the REAL evaluator, requirement engine and
// session-authority engine.
import type { Page } from "@playwright/test";
import type { CulturalReceipt, QlooEntity } from "../../src/types/domain";
import type {
  StateEvaluation,
  StateVersion,
  MutationRequest,
} from "../../src/lib/state/types";
import type { CandidateFact } from "../../src/lib/requirements/types";
import {
  contextRequirementReport,
  stateDecision,
} from "../../src/server/state/policy";
import { sessionAuthority } from "../../src/server/state/session-authority";
import { entities } from "../qloo-fixtures";
import { syntheticReceipt } from "../receipt-presentation-fixture";

export const receipt: CulturalReceipt = syntheticReceipt(0.9);
export const place: QlooEntity = {
  ...receipt.candidate,
  type: "place",
  name: "SYNTHETIC TEST DATA Jazz Cellar",
  address: "SYNTHETIC 1 Test Street",
};
export const second: QlooEntity = {
  ...place,
  id: "10000000-0000-4000-8000-000000000006",
  name: "SYNTHETIC TEST DATA Second Room",
};

export async function mockExperience(
  page: Page,
  options: {
    facts?: CandidateFact[];
    culturalUnavailable?: boolean;
    placeUnavailable?: boolean;
  } = {},
) {
  const evaluations: StateEvaluation[] = [];
  const bodies: Record<string, unknown>[] = [];
  const state: StateVersion = {
    profileId: crypto.randomUUID(),
    stateVersion: 0,
    parentVersion: null,
    createdAt: receipt.evaluatedAt,
    mutationId: null,
    stateHash: "synthetic-state-0",
    entries: [],
  };
  await page.route("**/api/demo/**", (route) =>
    route.fulfill({
      json: {
        status: "available",
        data: route.request().url().endsWith("/resolve")
          ? entities.slice(0, 5).map((e) => ({
              status: "available",
              data: { state: "single", matches: [e] },
            }))
          : {
              candidates: [place, second].map((entity, i) => ({
                entity,
                rank: i + 1,
                rawAffinity: 0.9,
                alignmentScore: 0.9,
                scale: "unit",
                explainability: {
                  status: "partial",
                  contributions: [{ signalId: entities[0].id, score: 0.6 }],
                  missingSignalIds: [],
                  omittedSignalIds: [],
                  omission: "unknown",
                  issues: [],
                },
              })),
              provenance: receipt.qlooEvidence.provenance,
            },
      },
    }),
  );
  await page.route("**/api/media/place?**", (route) =>
    route.fulfill({ json: { status: "unavailable" } }),
  );
  await page.route("**/api/places/context", (route) =>
    route.fulfill({
      json: {
        status: "available",
        data: options.placeUnavailable
          ? {
              status: "unavailable",
              reason: "not_configured",
              identity: {
                status: "not_attempted",
                confidence: 0,
                margin: 0,
                reasons: [],
              },
              facts: [],
              silentKeys: [],
              provenance: { requestedAt: receipt.evaluatedAt, sources: [] },
            }
          : {
              status: "available",
              identity: {
                status: "matched",
                confidence: 0.95,
                margin: 0.5,
                reasons: [],
              },
              place: {
                provider: "google-places",
                providerId: "synthetic",
                name: place.name,
                address: place.address,
                types: [],
              },
              facts: options.facts ?? [],
              silentKeys: [],
              provenance: { requestedAt: receipt.evaluatedAt, sources: [] },
            },
      },
    }),
  );
  await page.route("**/api/state/**", async (route) => {
    const operation = new URL(route.request().url()).pathname.replace(
      "/api/state/",
      "",
    );
    const body = route.request().postDataJSON() ?? {};
    bodies.push({ operation, ...body });
    let data: unknown = {};
    if (operation === "read") data = { state: structuredClone(state) };
    if (operation === "mutate") {
      const payload = body.payload as MutationRequest["payload"];
      state.parentVersion = state.stateVersion;
      state.stateVersion++;
      state.stateHash = `synthetic-state-${state.stateVersion}`;
      if (payload.kind === "INITIALIZE")
        state.entries = payload.signals.map((entity) => ({
          signalId: crypto.randomUUID(),
          kind: "EXPLICIT_LIKE" as const,
          entity,
          scope: "GLOBAL_PREFERENCE" as const,
          persistence: "DURABLE" as const,
          source: "USER" as const,
          sourceEventId: crypto.randomUUID(),
          createdAt: receipt.evaluatedAt,
        }));
      data = { state: structuredClone(state) };
    }
    if (operation === "evaluate") {
      const candidate = body.candidate as QlooEntity;
      const context = body.context as StateEvaluation["context"];
      const cultural: StateEvaluation["cultural"] = options.culturalUnavailable
        ? { status: "unavailable", reason: "timeout" }
        : {
            status: "available",
            data: {
              ...receipt,
              candidate,
              action: { ...receipt.action, targetEntity: candidate },
            },
          };
      const report = contextRequirementReport(context, receipt.evaluatedAt);
      const e: StateEvaluation = {
        schemaVersion: "taste-state-evaluation-v1",
        evaluationId: crypto.randomUUID(),
        profileId: state.profileId,
        stateVersion: state.stateVersion,
        stateHash: state.stateHash,
        agentId: "Concierge",
        action: { kind: "SELECT_ENTITY", candidate },
        context,
        decision: stateDecision(
          state,
          candidate,
          context,
          cultural,
          receipt.evaluatedAt,
        ),
        cultural,
        culturalRequest: "REQUESTED",
        ...(report ? { requirements: report } : {}),
        requestId: crypto.randomUUID(),
        evaluatedAt: receipt.evaluatedAt,
        source: "live",
      };
      const sa = body.sessionAuthority as
        Parameters<typeof sessionAuthority>[2] | undefined;
      if (sa) e.authority = sessionAuthority(state, e, sa, receipt.evaluatedAt);
      evaluations.push(e);
      data = e;
    }
    await route.fulfill({ json: { status: "available", data } });
  });
  return { evaluations, bodies, state };
}
