import { test, expect as baseExpect, type Page } from "@playwright/test";
import { mockConsumerState } from "./consumer-state-fixture";
import { entities } from "../qloo-fixtures";
import { syntheticReceipt } from "../receipt-presentation-fixture";
import { labelSynthetic } from "./synthetic-label";
// Bootstrap + explicit mutation + evaluation + captured plan are separately paced requests.
const expect = baseExpect.configure({ timeout: 15000 });
const receipt = syntheticReceipt(0.9);
const candidates = [
  {
    ...receipt.candidate,
    type: "place" as const,
    name: "SYNTHETIC TEST DATA original",
    address: "SYNTHETIC location",
  },
  {
    ...receipt.candidate,
    id: "10000000-0000-4000-8000-000000000006",
    type: "place" as const,
    name: "SYNTHETIC TEST DATA alternative with a long readable label",
    address: "SYNTHETIC location",
  },
];
async function start(
  page: Page,
  options: Parameters<typeof mockConsumerState>[3] = {},
) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
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
              candidates: candidates.map((entity, i) => ({
                entity,
                rank: i + 1,
              })),
              provenance: receipt.qlooEvidence.provenance,
            },
      },
    }),
  );
  await page.route("**/api/media/place?**", (route) =>
    route.fulfill({
      json: {
        status: "unavailable",
        presentationOnly: true,
        classification: "UNAVAILABLE",
      },
    }),
  );
  const api = await mockConsumerState(page, receipt, candidates, options);
  await page.goto("/arena/consumer");
  await labelSynthetic(page);
  await page.getByRole("button", { name: "Use my reviewed taste" }).click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Find a place through my taste" })
    .click();
  await expect(page.locator(".placeContent h3")).toContainText("original");
  return { ...api, errors };
}
async function boundaries(page: Page) {
  await page.getByText("Try a boundary", { exact: true }).click();
}
test("synthetic consumer budget ASK → explicit price → captured ALLOW; UNKNOWN never guesses", async ({
  page,
}) => {
  const api = await start(page);
  await boundaries(page);
  await page.getByRole("button", { name: "I have a $100 budget" }).click();
  await expect(page.locator(".humanDecision")).toContainText("One thing first");
  await expect(page.getByLabel("Price in USD")).toBeVisible();
  expect(api.state.stateVersion).toBe(2);
  const rules = JSON.stringify(api.state.entries);
  await page.getByRole("button", { name: "I don’t know", exact: true }).click();
  await expect(page.locator(".humanDecision")).toContainText(
    "Internal policy: ASK",
  );
  await page.getByRole("button", { name: "Show the question" }).click();
  await page.getByLabel("Price in USD").fill("40");
  await page.getByRole("button", { name: "Use this price" }).click();
  await expect(page.locator(".humanDecision")).toContainText("This fits");
  await expect(page.locator(".humanDecision")).toContainText(
    "Original decision: ASK",
  );
  expect(api.state.stateVersion).toBe(2);
  expect(JSON.stringify(api.state.entries)).toBe(rules);
  expect(api.calls.some((c) => c.operation === "interactive/plan")).toBe(true);
  expect(
    api.calls.filter((c) => c.operation === "interactive/answer"),
  ).toHaveLength(2);
  expect(api.errors).toEqual([]);
});
test("synthetic consumer explicit exclusion → one proposal → separate authorization keeps exclusion", async ({
  page,
}) => {
  const api = await start(page);
  await boundaries(page);
  await page
    .getByRole("button", { name: "Never choose this place for me" })
    .click();
  await expect(page.locator(".humanDecision")).toContainText("Not this one");
  await expect(page.locator(".humanDecision")).toContainText(
    "You told TastePolicy",
  );
  const before = JSON.stringify(api.state);
  expect(api.state.stateVersion).toBe(2);
  await page
    .getByRole("button", { name: "Find another that respects this" })
    .click();
  await expect(page.locator(".placeContent h3")).toContainText("alternative");
  await expect(
    page.getByText("One alternative found", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".humanDecision")).toHaveCount(0);
  expect(api.evaluations).toHaveLength(1);
  expect(JSON.stringify(api.state)).toBe(before);
  await page
    .getByRole("button", { name: "Check this choice with TastePolicy" })
    .click();
  await expect(page.locator(".humanDecision")).toContainText("This fits");
  expect(api.evaluations).toHaveLength(2);
  expect(api.evaluations[0].decision.outcome).toBe("REJECT");
  expect(JSON.stringify(api.state)).toBe(before);
  expect(
    api.state.entries.some(
      (e) =>
        e.candidateId === candidates[0].id &&
        e.constraint?.kind === "EXCLUDE_CANDIDATE",
    ),
  ).toBe(true);
  expect(
    api.calls.filter((c) => c.operation === "interactive/repair"),
  ).toHaveLength(1);
  expect(JSON.stringify(api.evaluationInputs)).not.toMatch(
    /wikimedia|presentationOnly|licenseUrl/,
  );
  expect(api.errors).toEqual([]);
});
test("synthetic consumer swipe navigation makes no rule and rehearsal makes no provider call", async ({
  page,
}) => {
  const api = await start(page);
  const portrait = page.locator(".placePortrait");
  await portrait.dispatchEvent("pointerdown", { clientX: 260 });
  await portrait.dispatchEvent("pointerup", { clientX: 30 });
  await expect(page.locator(".placeContent h3")).toContainText("alternative");
  expect(api.calls).toHaveLength(0);
  await boundaries(page);
  await page
    .getByRole("button", { name: "What if evidence is missing?" })
    .click();
  await expect(
    page.getByRole("region", { name: "Demo rehearsal" }),
  ).toContainText("No Qloo call");
  await expect(
    page.getByRole("region", { name: "Demo rehearsal" }),
  ).toContainText("No fabricated receipt");
  expect(api.calls).toHaveLength(0);
});
test("synthetic consumer genuine unavailability is not rejection and creates no cultural receipt", async ({
  page,
}) => {
  const api = await start(page, { unavailable: true });
  await page
    .getByRole("button", { name: "Check this choice with TastePolicy" })
    .click();
  await expect(page.locator(".humanDecision")).toContainText(
    "I don’t know enough yet",
  );
  await expect(page.locator(".humanDecision")).toContainText(
    "Internal policy: UNAVAILABLE",
  );
  await expect(page.locator(".humanDecision")).toContainText(
    "not the same as disliking",
  );
  expect(api.evaluations[0].cultural.status).toBe("unavailable");
  expect(api.calls.filter((c) => c.operation === "evaluate")).toHaveLength(1);
  expect(api.errors).toEqual([]);
});
test("synthetic consumer budget prevents unverifiable replacement without removing any rule", async ({
  page,
}) => {
  const api = await start(page);
  await boundaries(page);
  await page.getByRole("button", { name: "I have a $100 budget" }).click();
  await expect(page.getByLabel("Price in USD")).toBeVisible();
  await page
    .getByRole("button", { name: "Never choose this place for me" })
    .click();
  await expect(page.locator(".humanDecision")).toContainText("Not this one");
  const before = JSON.stringify(api.state);
  await page
    .getByRole("button", { name: "Find another that respects this" })
    .click();
  await expect(
    page.getByText(/cannot verify an alternative’s own price/),
  ).toBeVisible();
  expect(JSON.stringify(api.state)).toBe(before);
  await expect(page.locator(".placeContent h3")).toContainText("original");
});
test("synthetic consumer mobile keyboard, light/dark, reduced motion and long alternative labels", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const api = await start(page);
  await boundaries(page);
  const exclude = page.getByRole("button", {
    name: "Never choose this place for me",
  });
  await exclude.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".humanDecision")).toContainText("Not this one");
  await page
    .getByRole("button", { name: "Find another that respects this" })
    .click();
  await expect(page.locator(".placeContent h3")).toContainText("alternative");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: ".tastebench/wgb-consumer-authorization/mobile-proposal.png",
    fullPage: true,
  });
  expect(api.errors).toEqual([]);
});
test("synthetic consumer refuses a different saved profile without initialization or overwrite", async ({
  page,
}) => {
  const api = await start(page, { mismatched: true });
  await boundaries(page);
  await page.getByRole("button", { name: "I have a $100 budget" }).click();
  await expect(page.getByRole("status")).toContainText(
    "saved preferences are different",
  );
  expect(api.calls.filter((c) => c.operation === "mutate")).toHaveLength(0);
  expect(api.state.stateVersion).toBe(1);
});
test("synthetic consumer stale state fails closed and offers explicit refresh without retry", async ({
  page,
}) => {
  const api = await start(page, { stale: true });
  await boundaries(page);
  await page.getByRole("button", { name: "I have a $100 budget" }).click();
  await expect(page.getByRole("status")).toContainText("saved rules changed");
  expect(api.calls.filter((c) => c.operation === "evaluate")).toHaveLength(1);
  await expect(
    page.getByRole("button", { name: "Refresh my saved rules" }),
  ).toBeVisible();
});
