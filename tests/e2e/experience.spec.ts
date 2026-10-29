import { test, expect as baseExpect, type Page } from "@playwright/test";
import { mockExperience } from "./experience-fixture";
import { labelSynthetic } from "./synthetic-label";

// Each step is a separately paced request (the client spaces calls ~1.1s).
const expect = baseExpect.configure({ timeout: 20000 });
test.setTimeout(120000);

async function toPlace(page: Page, path = "/experience") {
  await page.goto(path, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Find (places|somewhere)/ }).click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Find places that feel like this" })
    .click();
  await expect(
    page.getByRole("heading", { name: /SYNTHETIC TEST DATA Jazz Cellar/ }),
  ).toBeAttached();
  await labelSynthetic(page);
}

test("Margaret: ASK on an unknown critical fact, answer, ALLOW shortlist, over-ceiling ASK, widen", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const api = await mockExperience(page);
  await toPlace(page);
  // Unknown stays unknown before any check.
  await expect(page.getByText("Step-free entrance").first()).toBeVisible();
  await page
    .getByRole("button", { name: "Check it against her needs" })
    .click();

  // ASK: taste fits, entrance & walking unknown.
  await expect(
    page.getByRole("heading", { name: "Needs your answer" }).first(),
  ).toBeVisible();
  await expect(page.getByText(/I need to confirm a few things/)).toBeVisible();
  expect(api.evaluations.at(-1)?.decision).toMatchObject({
    outcome: "ASK",
    basis: "UNRESOLVED_CONTEXT",
  });

  await page.getByRole("button", { name: "Yes, step-free" }).click();
  await expect(
    page.getByRole("button", { name: "Yes, step-free" }),
  ).toHaveCount(0);
  await page.getByLabel("minutes").fill("8");
  await page.getByRole("button", { name: "Use this" }).click();

  // ALLOW, but only as far as SHORTLIST.
  await expect(page.getByRole("heading", { name: /Go ahead/ })).toBeVisible();
  const allowed = api.evaluations.at(-1)!;
  expect(allowed.authority).toMatchObject({
    outcome: "ALLOW",
    permitted: ["SUGGEST", "RANK", "SHORTLIST"],
  });
  // The answers are recorded as the person's word, not a provider's.
  expect(allowed.context.facts?.every((f) => f.sourceType === "USER")).toBe(
    true,
  );

  // An over-eager agent asks for more than the ceiling: ASK again.
  await page.getByRole("button", { name: /Simulate: the agent tries/ }).click();
  await expect(page.getByText(/further than you allowed/)).toBeVisible();
  expect(api.evaluations.at(-1)?.authority).toMatchObject({
    outcome: "ASK",
    basis: "ACTION_CEILING",
    escalationRequired: true,
  });

  // Only the person can widen it.
  await page.getByRole("button", { name: /I allow it/ }).click();
  await expect(page.getByRole("heading", { name: /Go ahead/ })).toBeVisible();
  expect(api.evaluations.at(-1)?.authority?.permitted).toContain(
    "PRESENT_AS_SELECTED",
  );

  // Why this happened keeps sources apart.
  await page.getByText("Why this happened").first().click();
  for (const kind of [
    "Cultural evidence",
    "Place facts",
    "Your requirements",
    "Authority",
    "Final decision",
  ])
    await expect(page.locator(".tp-source b", { hasText: kind })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Margaret: a known violation REJECTs even for a strong taste match", async ({
  page,
}) => {
  const api = await mockExperience(page, {
    facts: [
      {
        key: "accessible_entrance",
        value: false,
        state: "known",
        evidence: "VERIFIED",
        source: "google-places",
        sourceType: "PLACE_PROVIDER",
      },
    ],
  });
  await toPlace(page);
  await page
    .getByRole("button", { name: "Check it against her needs" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Not this one" }),
  ).toBeVisible();
  expect(api.evaluations.at(-1)?.decision).toMatchObject({
    outcome: "REJECT",
    rules: ["REQUIREMENT_VIOLATION:accessible_entrance"],
  });
});

test("Margaret: unavailable cultural evidence pauses instead of guessing", async ({
  page,
}) => {
  const api = await mockExperience(page, { culturalUnavailable: true });
  await toPlace(page);
  await page
    .getByRole("button", { name: "Check it against her needs" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Couldn't check" }),
  ).toBeVisible();
  expect(api.evaluations.at(-1)?.decision.outcome).toBe("UNAVAILABLE");
});

test("sensory-aware scenario uses the same generic requirement path", async ({
  page,
}) => {
  const api = await mockExperience(page);
  await toPlace(page, "/experience/sensory-aware");
  await page
    .getByRole("button", { name: "Check it against her needs" })
    .click();
  await expect(page.getByText("How loud is it likely to be?")).toBeVisible();
  expect(api.evaluations.at(-1)?.decision.rules).toEqual([
    "REQUIRED_FACT:noise_level",
  ]);
  await page.getByRole("button", { name: "Loud" }).click();
  await expect(
    page.getByRole("heading", { name: "Not this one" }),
  ).toBeVisible();
});

test("low-energy scenario treats walking time as a requirement", async ({
  page,
}) => {
  const api = await mockExperience(page);
  await toPlace(page, "/experience/low-energy");
  await page
    .getByRole("button", { name: "Check it against her needs" })
    .click();
  await page.getByLabel("minutes").fill("25");
  await page.getByRole("button", { name: "Use this" }).click();
  await expect(
    page.getByRole("heading", { name: "Not this one" }),
  ).toBeVisible();
  expect(api.evaluations.at(-1)?.decision.rules).toEqual([
    "REQUIREMENT_VIOLATION:walking_minutes",
  ]);
});

test("mobile: no horizontal overflow and actions stay reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await mockExperience(page);
  await toPlace(page);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const button = page.getByRole("button", {
    name: "Check it against her needs",
  });
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
});

test("dashboard shows a clearly labelled example when signed out, with no invented activity", async ({
  page,
}) => {
  await page.route("**/api/account/**", (r) =>
    r.fulfill({
      status: 401,
      json: { status: "unauthorized", code: "AUTH_REQUIRED" },
    }),
  );
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await expect(
    page.getByText(/You're looking at an example: Margaret/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Needs your answer" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "How far AI may go" }),
  ).toBeVisible();
  await expect(page.getByText(/Your decisions appear here/)).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("axe: no serious or critical violations on the human product pages", async ({
  page,
}) => {
  const AxeBuilder = (await import("@axe-core/playwright")).default;
  await mockExperience(page);
  for (const path of ["/", "/experience", "/judge", "/product"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${path}: ${v.id} (${v.nodes.length})`),
    ).toEqual([]);
  }
});

test("reduced motion: ribbon and seal animations are disabled", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockExperience(page);
  await page.goto("/experience", { waitUntil: "networkidle" });
  const animated = await page.evaluate(() =>
    [...document.querySelectorAll(".rb-flow, .rb-scan")].map(
      (e) => getComputedStyle(e).animationName,
    ),
  );
  expect(animated.every((n) => n === "none")).toBe(true);
});
