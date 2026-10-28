import { test, expect, type Page } from "@playwright/test";
import { labelSynthetic } from "./synthetic-label";
import { syntheticReceipt } from "../receipt-presentation-fixture";
import { entities } from "../qloo-fixtures";
// All responses below are SYNTHETIC TEST DATA, never production fallback.
async function flow(
  page: Page,
  outcome: "ASK" | "REJECT",
  factor = "CULTURAL_BORDERLINE",
  repairStatus = "REPAIR_AVAILABLE",
) {
  const receipt = syntheticReceipt(0.65),
    operations: string[] = [];
  const evaluation = {
    schemaVersion: "taste-state-evaluation-v1",
    evaluationId: "synthetic-evaluation",
    profileId: "synthetic-profile",
    stateVersion: 1,
    stateHash: "synthetic-hash",
    agentId: "Agent-A",
    action: { kind: "SELECT_ENTITY", candidate: receipt.candidate },
    context: { key: "demo", domain: receipt.candidate.type },
    decision: {
      outcome,
      basis: "CULTURAL_POLICY",
      rules: ["SYNTHETIC TEST DATA"],
    },
    cultural: { status: "available", data: receipt },
    source: "live",
    requestId: "synthetic-request",
    evaluatedAt: "2026-10-16T00:00:00.000Z",
  };
  const plan = {
    schemaVersion: "clarification-plan-v1",
    evaluationId: evaluation.evaluationId,
    profileId: evaluation.profileId,
    stateVersion: 1,
    parentClarificationId: null,
    status: "ACTIONABLE",
    planId: "synthetic-plan",
    evidenceSource: "captured",
    factor: {
      kind: factor,
      question:
        factor === "CULTURAL_BORDERLINE"
          ? "Is this candidate acceptable in this context?"
          : "Provide this candidate price in USD, or UNKNOWN.",
      currency: "USD",
      policyEffect: "SYNTHETIC TEST DATA — captured reevaluation",
      answerSchema:
        factor === "CULTURAL_BORDERLINE" ? "DISPOSITION" : "MONEY_OR_UNKNOWN",
    },
  };
  let answer: unknown, repair: unknown;
  await page.route("**/api/demo/resolve", (r) =>
    r.fulfill({
      json: {
        status: "available",
        data: entities.slice(0, 5).map((e) => ({
          status: "available",
          data: { state: "single", matches: [e] },
        })),
      },
    }),
  );
  await page.route("**/api/demo/discover", (r) =>
    r.fulfill({
      json: {
        status: "available",
        data: {
          candidates: [
            { entity: receipt.candidate, alignmentScore: 0.65, rank: 1 },
          ],
          provenance: receipt.qlooEvidence.provenance,
        },
      },
    }),
  );
  await page.route("**/api/demo/evaluate", (r) =>
    r.fulfill({ json: { status: "available", data: receipt } }),
  );
  await page.route("**/api/state/**", (r) => {
    const op = r.request().url().split("/").at(-1)!;
    operations.push(op);
    const input = r.request().postDataJSON();
    let data: unknown = {};
    if (op === "read")
      data = {
        state: {
          stateVersion: 1,
          stateHash: "synthetic-hash",
          entries: [
            {
              signalId: "synthetic",
              kind: "EXPLICIT_LIKE",
              entity: entities[0],
            },
          ],
        },
        previous: null,
        evaluations: [],
        feedback: [],
        graph: { nodes: [], edges: [], semanticHash: "synthetic" },
        diff: {
          added: [],
          removed: [],
          changedConstraints: [],
          feedbackEventIds: [],
        },
      };
    if (op === "evaluate")
      data = {
        ...evaluation,
        action: { ...evaluation.action, candidate: input.candidate },
      };
    if (op === "plan") data = plan;
    if (op === "answer") {
      const result =
        input.answer.kind === "UNKNOWN" || input.answer.value === "STILL_UNSURE"
          ? "ASK"
          : input.answer.value === "UNACCEPTABLE" || input.answer.amount > 50
            ? "REJECT"
            : "ALLOW";
      answer = {
        schemaVersion: "interactive-authorization-v1",
        interactionId: "synthetic-interaction",
        originalEvaluation: evaluation,
        plan,
        answer: input.answer,
        finalDecision: { outcome: result, basis: "CULTURAL_PLUS_CONTEXT" },
        stateVersion: 1,
        evidenceSource: "captured",
      };
      data = answer;
    }
    if (op === "repair") {
      repair = {
        schemaVersion: "repair-plan-v1",
        repairId: "synthetic-repair",
        originalEvaluation: evaluation,
        stateVersion: 1,
        status: repairStatus,
        reason: "SYNTHETIC TEST DATA — bounded result",
        method: {
          providerCalls: repairStatus === "NO_VERIFIABLE_REPAIR" ? 0 : 4,
          maxProviderCalls: 4,
          maxCandidates: 1,
        },
        preservedConstraints: ["synthetic-rule"],
        changeSet: [],
        ...(repairStatus === "REPAIR_AVAILABLE"
          ? {
              verification: {
                ...evaluation,
                evaluationId: "synthetic-verification",
                action: {
                  kind: "SELECT_ENTITY",
                  candidate: {
                    ...receipt.candidate,
                    name: "SYNTHETIC verified alternative",
                  },
                },
                decision: { outcome: "ASK" },
              },
            }
          : { condition: "Required candidate evidence was not established." }),
      };
      data = repair;
    }
    if (op === "replay-clarification") data = answer;
    if (op === "replay-repair") data = repair;
    return r.fulfill({ json: { status: "available", data } });
  });
  await page.goto("/demo");
  await labelSynthetic(page);
  await page.getByRole("button", { name: "Resolve with Qloo" }).click();
  for (let i = 0; i < 5; i++)
    await page
      .getByLabel(`Signal ${i + 1} resolved identity`)
      .selectOption(entities[i].id);
  await page.getByLabel("Target domain").selectOption("destination");
  await page.getByRole("button", { name: "Discover with Qloo" }).click();
  await page.getByRole("button", { name: "Propose SELECT_ENTITY" }).click();
  await page
    .getByRole("button", { name: "Start / resume demo profile" })
    .click();
  await page
    .getByRole("button", { name: "Evaluate using current state" })
    .click();
  return operations;
}
test("synthetic borderline clarification is explicit, keyboard accessible and replayed without discovery", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const operations = await flow(page, "ASK");
  expect(operations).not.toContain("plan");
  await expect(
    page.getByRole("region", {
      name: "Interactive authorization",
      exact: true,
    }),
  ).toHaveCSS("display", "grid");
  await expect(
    page.getByRole("button", { name: "Ask one clarification" }),
  ).toHaveCSS("border-top-width", "1px");
  const button = page.getByRole("button", { name: "Ask one clarification" });
  await button.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "ACCEPTABLE", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Interaction cultural policy: ALLOW" }),
  ).toBeVisible();
  await expect(
    page.getByText("Original M2 decision: ASK", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Replay captured clarification" })
    .click();
  await expect(
    page.getByText(/CAPTURED EVIDENCE REPLAY · explicit/),
  ).toBeVisible();
  expect(operations.filter((x) => x === "repair")).toHaveLength(0);
  await page
    .getByText("Interactive authorization envelope", { exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/m2-5-synthetic-clarification-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("synthetic price clarification preserves uncertainty then applies explicit context", async ({
  page,
}) => {
  await flow(page, "ASK", "PRICE_REQUIRED");
  await page.getByRole("button", { name: "Ask one clarification" }).click();
  await page.getByRole("button", { name: "Price UNKNOWN" }).click();
  await expect(
    page.getByRole("heading", { name: "Interaction cultural policy: ASK" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ask one clarification" }).click();
  await page.getByLabel("Candidate price in USD").fill("60");
  await page
    .getByRole("button", { name: "Apply price to this interaction" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Interaction cultural policy: REJECT" }),
  ).toBeVisible();
});
for (const status of [
  "REPAIR_AVAILABLE",
  "NO_VERIFIABLE_REPAIR",
  "UNAVAILABLE",
  "NO_VERIFIED_REPAIR_WITHIN_BOUND",
  "STALE",
])
  test(`synthetic bounded repair presents ${status} honestly`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    const operations = await flow(
      page,
      "REJECT",
      "CULTURAL_BORDERLINE",
      status,
    );
    expect(operations).not.toContain("repair");
    await page
      .getByRole("button", { name: "Request minimal candidate repair" })
      .click();
    await expect(
      page.getByRole("heading", {
        name: status.replaceAll("_", " "),
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(/Original decision remains REJECT/),
    ).toBeVisible();
    if (status !== "STALE") {
      await page
        .getByRole("button", { name: "Replay captured repair" })
        .click();
      expect(operations.filter((x) => x === "repair")).toHaveLength(1);
    }
    if (status === "REPAIR_AVAILABLE") {
      await expect(
        page.getByRole("button", { name: "Evaluate repaired proposal" }),
      ).toBeVisible();
      expect(operations.filter((x) => x === "evaluate")).toHaveLength(1);
      await page.screenshot({
        path: "test-results/m2-5-synthetic-repair-mobile.png",
        fullPage: true,
      });
      await page
        .getByRole("region", { name: "Repair result" })
        .screenshot({ path: "test-results/m2-5-synthetic-repair-detail.png" });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page
        .getByRole("region", { name: "Interactive authorization", exact: true })
        .screenshot({
          path: "test-results/m2-5-synthetic-interactive-desktop.png",
        });
      await page
        .getByRole("button", { name: "Evaluate repaired proposal" })
        .click();
      expect(operations.filter((x) => x === "evaluate")).toHaveLength(2);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
test("synthetic stale answer is a conflict and not a false authorization", async ({
  page,
}) => {
  await flow(page, "ASK");
  await page.getByRole("button", { name: "Ask one clarification" }).click();
  await page.route("**/api/state/interactive/answer", (r) =>
    r.fulfill({
      status: 409,
      json: { status: "error", code: "STATE_VERSION_CONFLICT" },
    }),
  );
  await page.getByRole("button", { name: "ACCEPTABLE", exact: true }).click();
  await expect(page.getByLabel("Interactive operation")).toContainText(
    "State changed",
  );
  await expect(
    page.getByRole("region", { name: "Interactive result" }),
  ).toHaveCount(0);
});
