import { test, expect } from "@playwright/test";
test("real runtime fails safely without Qloo credentials", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "TastePolicy", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Milestone 1 — Qloo vertical slice"),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "TastePolicy", exact: true }),
  ).toHaveCSS("font-size", "48px");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Resolve with Qloo" }).click();
  await expect(page.getByText(/Qloo not configured/).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Discover with Qloo" }),
  ).toBeDisabled();
  await expect(page.getByText("No decision issued.")).toBeVisible();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({
    path: "test-results/milestone-1-mobile-dark.png",
    fullPage: true,
  });
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: "ok", service: "tastepolicy" });
  expect(health.headers()["x-content-type-options"]).toBe("nosniff");
  expect(health.headers()["x-frame-options"]).toBe("DENY");
  expect(errors).toEqual([]);
  const invalid = await request.post("/api/demo/evaluate", {
    data: { alignmentScore: 0.99 },
  });
  expect(invalid.status()).toBe(400);
});
