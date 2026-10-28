import { labelSynthetic } from "./synthetic-label";
import { test, expect } from "@playwright/test";
import { ids, entities, signalIds } from "../qloo-fixtures";
import { createReceipt } from "../../src/server/receipts/createReceipt";
const receipt = createReceipt(
  {
    action: { kind: "SELECT_ENTITY", targetEntity: entities[5] },
    signals: entities.slice(0, 5),
    evidence: {
      entity: entities[5],
      rawAffinity: 0.7,
      alignmentScore: 0.7,
      scale: "unit",
      rank: 1,
      explainability: {
        status: "partial",
        contributions: [{ signalId: ids[0], score: 0.3 }],
        missingSignalIds: signalIds.slice(1),
        omittedSignalIds: [],
        omission: "unknown",
        issues: ["missing_signals"],
      },
    },
    provenance: {
      provider: "qloo",
      endpoint: "/v2/insights",
      host: "https://hackathon.api.qloo.com",
      fetchedAt: "2026-10-10T00:00:00Z",
      signalIds,
      targetType: "destination",
      specificCandidateId: ids[5],
    },
    decision: { outcome: "ASK", reasonCode: "UNCERTAIN_ALIGNMENT" },
    requestId: ids[0],
  },
  () => "2026-10-10T00:00:00Z",
  () => ids[1],
);
test("test-only browser responses exercise the complete decision UI", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/demo/resolve", (route) =>
    route.fulfill({
      json: {
        status: "available",
        data: entities.slice(0, 5).map((e) => ({
          status: "available",
          data: { state: "single", matches: [e] },
        })),
      },
    }),
  );
  await page.route("**/api/demo/discover", (route) =>
    route.fulfill({
      json: {
        status: "available",
        data: {
          candidates: [{ entity: entities[5], alignmentScore: 0.7, rank: 1 }],
        },
      },
    }),
  );
  await page.route("**/api/demo/evaluate", (route) =>
    route.fulfill({
      json: {
        status: "available",
        data: receipt,
      },
    }),
  );
  await page.goto("/demo");
  await labelSynthetic(page);
  await page.getByRole("button", { name: "Resolve with Qloo" }).click();
  for (let i = 0; i < 5; i++)
    await page
      .getByLabel(`Signal ${i + 1} resolved identity`)
      .selectOption(ids[i]);
  await page.getByLabel("Target domain").selectOption("destination");
  await page.getByRole("button", { name: "Discover with Qloo" }).click();
  await page.getByRole("button", { name: "Propose SELECT_ENTITY" }).click();
  await expect(page.getByTestId("decision")).toHaveText("ASK");
  await page.getByText("Machine-readable receipt").click();
  await expect(
    page.getByLabel("Machine-readable Cultural Receipt"),
  ).toContainText("tastepolicy-v1-experimental");
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: "test-results/test-only-flow-desktop.png",
    fullPage: true,
  });
  // Editing signals invalidates old discovery and receipt.
  await page.getByLabel("Signal 1 name", { exact: true }).fill("changed");
  await expect(page.getByTestId("decision")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Discover with Qloo" }),
  ).toBeDisabled();
});
