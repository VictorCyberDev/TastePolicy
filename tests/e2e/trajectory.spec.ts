import { test, expect, type Page } from "@playwright/test";
import { entities } from "../qloo-fixtures";
import { syntheticReceipt } from "../receipt-presentation-fixture";
import type { QlooEntity } from "@/types/domain";
import { labelSynthetic } from "./synthetic-label";
const target = { ...entities[5], name: "SYNTHETIC TEST DATA target" },
  candidate = {
    ...target,
    id: "10000000-0000-4000-8000-000000000006",
    name: "SYNTHETIC TEST DATA bridge " + "long-name-".repeat(12),
  };
const tid = "20000000-0000-4000-8000-000000000001",
  gid = "20000000-0000-4000-8000-000000000002",
  eid = "20000000-0000-4000-8000-000000000003";
async function browserFixture(page: Page, outcome = "ALLOW") {
  let version = 1,
    breadth = "STRICT",
    status = "ACTIVE",
    generation: Record<string, unknown> | null = null,
    evaluation: {
      action: { kind: string; candidate: QlooEntity };
      [key: string]: unknown;
    } | null = null; // Test-only intercepted transport, never production fallback.
  const calls: { op: string; body: Record<string, unknown> }[] = [],
    events: Record<string, unknown>[] = [];
  const state = () => ({
    profileId: entities[0].id,
    stateVersion: version,
    stateHash: "a".repeat(64),
    entries: entities.slice(0, 5).map((entity) => ({
      signalId: entity.id,
      kind: "EXPLICIT_LIKE",
      entity,
      source: "USER",
      sourceEventId: tid,
      scope: "GLOBAL_PREFERENCE",
      persistence: "DURABLE",
    })),
  });
  const intent = {
    trajectoryId: tid,
    profileId: entities[0].id,
    intentStateVersion: 2,
    intentStateHash: "a".repeat(64),
    signalId: tid,
    target,
    tolerance: "BALANCED",
    context: { key: "trip", domain: "destination" },
    createdAt: "2026-10-17T12:00:00Z",
  };
  const view = () => ({
    intent,
    generation,
    events,
    stateVersion: version,
    stateHash: "a".repeat(64),
    anchors: entities.slice(0, 5),
    breadth,
    status,
    evaluations: evaluation ? [evaluation] : [],
    evidenceSource: "CAPTURED",
  });
  await page.route("**/api/state/**", async (r) => {
    const path = new URL(r.request().url()).pathname,
      op = path.split("/").at(-1)!,
      body = r.request().postDataJSON();
    if (path.includes("/trajectory/")) {
      calls.push({ op, body });
      let data: unknown;
      if (op === "resolve")
        data = {
          status: "available",
          data: {
            query: { query: body.query, expectedType: "destination" },
            matches: [
              target,
              {
                ...target,
                id: tid,
                name: "SYNTHETIC TEST DATA ambiguous alternative",
              },
            ],
            state: "ambiguous",
          },
        };
      else if (op === "create") {
        version = 2;
        data = intent;
      } else if (op === "read") data = view();
      else if (op === "plan") {
        if (status === "STALE" && !body.refresh)
          return r.fulfill({
            status: 409,
            json: { status: "error", code: "STALE" },
          });
        if (body.breadth === "BROAD")
          return r.fulfill({
            status: 409,
            json: { status: "error", code: "TOLERANCE_EXCEEDED" },
          });
        breadth = body.breadth as string;
        status = "ACTIVE";
        generation = {
          generationId: gid,
          trajectoryId: tid,
          stateVersion: version,
          breadth,
          status:
            outcome === "PROVIDER_UNAVAILABLE"
              ? "TRAJECTORY_UNAVAILABLE"
              : "BRIDGES_AVAILABLE",
          ...(outcome === "PROVIDER_UNAVAILABLE" ? { reason: "timeout" } : {}),
          queries: [],
          queryDefinitions: [],
          candidates:
            outcome === "PROVIDER_UNAVAILABLE"
              ? []
              : [
                  {
                    entity: candidate,
                    supportCount: 4,
                    bestRank: 1,
                    memberships: [1, 2, 3, 4].map((i) => ({
                      queryId: "Q" + i,
                      rank: 1,
                    })),
                    authorizationStatus: "UNVERIFIED",
                  },
                ],
        };
        data = generation;
      } else if (op === "evaluate") {
        const selected = body.candidateId === target.id ? target : candidate;
        evaluation = {
          schemaVersion: "taste-state-evaluation-v1",
          evaluationId: eid,
          profileId: entities[0].id,
          stateVersion: version,
          stateHash: "a".repeat(64),
          agentId: "TasteTrajectory",
          action: { kind: "SELECT_ENTITY", candidate: selected },
          context: intent.context,
          decision: {
            outcome,
            basis: "CULTURAL_POLICY",
            rules: ["SYNTHETIC TEST DATA"],
          },
          cultural:
            outcome === "UNAVAILABLE"
              ? { status: "unavailable", reason: "timeout" }
              : {
                  status: "available",
                  data: syntheticReceipt(
                    outcome === "ALLOW" ? 0.9 : outcome === "ASK" ? 0.65 : 0.2,
                  ),
                },
          source: "live",
        };
        data = evaluation;
      } else if (op === "event") {
        if (body.feedback === "TOO_SAFE") breadth = "MODERATE";
        if (body.feedback === "TOO_ADVENTUROUS") breadth = "STRICT";
        if (body.feedback === "STOP_EXPLORING") status = "STOPPED";
        if (body.evaluationId && evaluation!.action.candidate.id === target.id)
          status = "COMPLETE";
        const e = {
          eventId: crypto.randomUUID(),
          trajectoryId: tid,
          stateVersion: version,
          kind:
            body.feedback === "STOP_EXPLORING"
              ? "TRAJECTORY_STOPPED"
              : body.feedback
                ? "TRAJECTORY_FEEDBACK"
                : evaluation!.action.candidate.id === target.id
                  ? "TARGET_SELECTED"
                  : "STEP_AUTHORIZED",
          feedback: body.feedback,
          breadth,
          generationId: gid,
          candidateId: body.evaluationId ? candidate.id : null,
        };
        events.push(e);
        data = e;
      } else data = generation;
      return r.fulfill({ json: { status: "available", data } });
    }
    if (path.includes("/interactive/")) {
      const data =
        op === "plan"
          ? {
              status: "ACTIONABLE",
              planId: "b".repeat(64),
              factor: {
                kind: "CULTURAL_BORDERLINE",
                answerSchema: "DISPOSITION",
                question:
                  "SYNTHETIC TEST DATA — acceptable for this interaction?",
              },
            }
          : {
              interactionId: tid,
              originalEvaluation: evaluation,
              finalDecision: { outcome: "ALLOW" },
              evidenceSource: "captured",
            };
      return r.fulfill({ json: { status: "available", data } });
    }
    if (op === "session") return r.fulfill({ json: { status: "available" } });
    return r.fulfill({
      json: {
        status: "available",
        data: {
          state: state(),
          previous: null,
          feedback: [],
          evaluations: [],
          graph: { nodes: [], edges: [], semanticHash: "synthetic-only" },
          diff: {
            added: [],
            removed: [],
            changedConstraints: [],
            feedbackEventIds: [],
          },
        },
      },
    });
  });
  await page.goto("/demo");
  await labelSynthetic(page);
  await page
    .getByRole("button", { name: "Start / resume demo profile" })
    .click();
  return {
    calls,
    advance() {
      version++;
      status = "STALE";
    },
  };
}
async function create(page: Page) {
  const panel = page.getByRole("region", {
    name: "TasteTrajectory · intentional exploration",
  });
  await panel.getByLabel("Target name").fill("SYNTHETIC TEST DATA target");
  await panel
    .getByRole("button", { name: "Resolve target identities" })
    .click();
  await expect(
    panel.getByRole("button", { name: "Save exploration intent" }),
  ).toBeDisabled();
  await panel.getByRole("radio").first().check();
  await panel
    .getByRole("checkbox", { name: "I reviewed this exact target identity." })
    .check();
  await panel.getByRole("button", { name: "Save exploration intent" }).click();
  await expect(
    panel.getByText("Target is EXPLORATION_INTENT, not EXPLICIT_LIKE."),
  ).toBeVisible();
  return panel;
}
for (const outcome of ["ALLOW", "ASK", "REJECT", "UNAVAILABLE"])
  test(`synthetic trajectory ${outcome} requires explicit review and separate policy evaluation`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const { calls } = await browserFixture(page, outcome);
    expect(calls).toEqual([]);
    const panel = await create(page);
    await panel.getByRole("button", { name: "Generate bridge plan" }).click();
    await expect(
      panel.getByText("UNVERIFIED — discovery is not authorization", {
        exact: false,
      }),
    ).toBeVisible();
    expect(calls.filter((c) => c.op === "evaluate")).toHaveLength(0);
    await panel.getByRole("button", { name: /^Evaluate bridge:/ }).click();
    await expect(
      panel.getByRole("heading", {
        name: `Cultural policy: ${outcome}`,
        exact: true,
      }),
    ).toBeVisible();
    if (outcome === "ASK") {
      await panel
        .getByRole("button", { name: "Clarify trajectory proposal" })
        .click();
      await panel
        .getByRole("button", { name: "ACCEPTABLE", exact: true })
        .click();
      await expect(
        panel.getByRole("heading", {
          name: "Cultural policy: ALLOW",
          exact: true,
        }),
      ).toBeVisible();
    }
    if (outcome === "ALLOW" || outcome === "ASK") {
      await panel
        .getByRole("button", {
          name: "Select policy-authorized exploration step",
        })
        .click();
      await expect(
        panel.getByText(/POLICY-AUTHORIZED EXPLORATION STEP/),
      ).toBeVisible();
    } else
      await expect(
        panel.getByRole("button", {
          name: "Select policy-authorized exploration step",
        }),
      ).toHaveCount(0);
    await panel
      .getByText("Trajectory Cultural Receipt and authorization provenance")
      .click();
    await expect(panel.locator("pre").last()).toContainText(
      "SYNTHETIC TEST DATA",
    );
    expect(errors).toEqual([]);
  });
test("synthetic trajectory feedback, stale refresh, stop, mobile keyboard and provenance", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const f = await browserFixture(page);
  const panel = await create(page);
  await panel.getByRole("button", { name: "Generate bridge plan" }).focus();
  await page.keyboard.press("Enter");
  await expect(panel.getByText(/Bridge support: 4\/5/)).toBeVisible();
  await panel.getByText("Query membership and provider ranks").click();
  await expect(panel.getByText("Q1 · provider rank 1")).toBeVisible();
  await panel.getByRole("button", { name: "TOO SAFE" }).click();
  await expect(
    panel.getByText("Trajectory status: ACTIVE · Current breadth: MODERATE"),
  ).toBeVisible();
  await expect(
    panel
      .getByLabel("Requested bridge breadth")
      .getByRole("option", { name: "BROAD", exact: true }),
  ).toHaveAttribute("disabled", "");
  await panel.getByRole("button", { name: "Generate bridge plan" }).click();
  await expect
    .poll(() => f.calls.filter((c) => c.op === "plan").at(-1)?.body.breadth)
    .toBe("MODERATE");
  f.advance();
  await panel.getByRole("button", { name: "Refresh trajectory" }).click();
  await expect(
    panel.getByText(/CAPTURED QLOO DISCOVERY · state 3/),
  ).toBeVisible();
  expect(f.calls.filter((c) => c.op === "plan").at(-1)!.body.refresh).toBe(
    true,
  );
  await panel
    .getByRole("button", { name: "Replay captured trajectory" })
    .click();
  await panel.getByRole("button", { name: "STOP EXPLORING" }).click();
  await expect(
    panel.getByRole("button", { name: "Generate bridge plan" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await panel.screenshot({ path: "/tmp/m4-mobile-review.png" });
  expect(errors).toEqual([]);
});
test("synthetic direct target ALLOW completes only on explicit selection in light mode", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  const { calls } = await browserFixture(page);
  const panel = await create(page);
  await panel.getByRole("button", { name: "Evaluate target" }).click();
  await expect(panel.getByText(/DIRECT_TARGET_AVAILABLE/)).toBeVisible();
  expect(calls.filter((c) => c.op === "plan")).toHaveLength(0);
  await panel
    .getByRole("button", {
      name: "Select authorized target — complete trajectory",
    })
    .click();
  await expect(
    panel.getByText("Trajectory status: COMPLETE · Current breadth: STRICT"),
  ).toBeVisible();
});
test("synthetic target REJECT and required provider failure remain intentional states", async ({
  page,
}) => {
  await browserFixture(page, "REJECT");
  const panel = await create(page);
  await panel.getByRole("button", { name: "Evaluate target" }).click();
  await expect(panel.getByText(/TARGET_CURRENTLY_REJECTED/)).toBeVisible();
  await expect(
    panel.getByRole("button", {
      name: "Select authorized target — complete trajectory",
    }),
  ).toHaveCount(0);
});
test("synthetic five-view provider failure cannot produce a partial bridge", async ({
  page,
}) => {
  await browserFixture(page, "PROVIDER_UNAVAILABLE");
  const panel = await create(page);
  await panel.getByRole("button", { name: "Generate bridge plan" }).click();
  await expect(
    panel.getByRole("heading", { name: "TRAJECTORY_UNAVAILABLE" }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: /^Evaluate bridge:/ }),
  ).toHaveCount(0);
  await expect(
    panel.getByText(/No partial support is presented/),
  ).toBeVisible();
});
