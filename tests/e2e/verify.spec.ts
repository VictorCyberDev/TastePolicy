import { test, expect, type Page } from "@playwright/test";
import { labelSynthetic } from "./synthetic-label";
// SYNTHETIC TEST DATA. Intercepted browser transport only; verification logic is covered by the library,
// service and conformance tests.
async function fixture(page: Page, result: object) {
  const calls: Record<string, unknown>[] = [],
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/attest/verify", async (r) => {
    calls.push(r.request().postDataJSON());
    await r.fulfill({ json: { status: "available", data: result } });
  });
  await page.goto("/verify");
  await labelSynthetic(page);
  return { calls, errors };
}
const fill = async (page: Page) => {
  await page
    .getByLabel("Proof", { exact: true })
    .fill("eyJhbGciOiJFUzI1NiJ9.e30.sig~");
  await page.getByLabel(/Your address/).fill("https://merchant.test");
};
test("a valid proof shows only what was shared, in plain words, and does not use it up by default", async ({
  page,
}) => {
  const f = await fixture(page, {
    valid: true,
    reasons: [],
    status: "VALID",
    dryRun: true,
    claims: {
      decision: "ALLOW",
      candidate_name: "SYNTHETIC TEST DATA Cafe",
      permitted: ["recommend", "add_to_draft"],
      exp: 1800000900,
    },
  });
  const button = page.getByRole("button", { name: "Check proof" });
  await expect(button).toBeDisabled();
  await fill(page);
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByRole("heading", { name: "Valid" })).toBeVisible();
  await expect(page.getByText("SYNTHETIC TEST DATA Cafe")).toBeVisible();
  await expect(page.getByText(/recommend, add_to_draft/)).toBeVisible();
  await expect(page.getByText(/did not use the proof up/)).toBeVisible();
  await expect(page.getByText(/subject|lease_ref|agent id/i)).toHaveCount(0);
  expect(f.calls[0]).toMatchObject({
    audience: "https://merchant.test",
    dryRun: true,
  });
  expect(f.errors).toEqual([]);
});
test("an invalid proof explains why and never shows claims; ticking the box asks to use the proof up", async ({
  page,
}) => {
  const f = await fixture(page, {
    valid: false,
    reasons: ["STATUS_INVALID"],
    dryRun: false,
    claims: { decision: "ALLOW" },
  });
  await fill(page);
  await page.getByRole("checkbox", { name: /Use this proof up/ }).check();
  await page.getByRole("button", { name: "Check proof" }).click();
  await expect(page.getByRole("heading", { name: "Not valid" })).toBeVisible();
  await expect(
    page.getByText("It was withdrawn or the permission has ended."),
  ).toBeVisible();
  await expect(page.getByText("Shared with you")).toHaveCount(0);
  expect(f.calls[0]).toMatchObject({ dryRun: false });
});
test("the checker refuses a non-https recipient before sending anything", async ({
  page,
}) => {
  const f = await fixture(page, { valid: true, reasons: [], dryRun: true });
  await page.getByLabel("Proof", { exact: true }).fill("x~");
  await page.getByLabel(/Your address/).fill("http://merchant.test");
  await expect(
    page.getByRole("button", { name: "Check proof" }),
  ).toBeDisabled();
  expect(f.calls).toHaveLength(0);
});
for (const colorScheme of ["light", "dark"] as const)
  test(`verify page ${colorScheme} mobile: no horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await fixture(page, { valid: false, reasons: ["EXPIRED"], dryRun: true });
    await expect(
      page.getByRole("heading", { name: "Check a TastePolicy proof" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/SYNTHETIC-M9-verify-${colorScheme}-mobile.png`,
      fullPage: true,
    });
  });
