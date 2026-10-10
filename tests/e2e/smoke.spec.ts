import { test, expect } from "@playwright/test";
test("homepage and health work without provider credentials", async ({
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
    page.getByText("Phase 0 — Engineering Foundation"),
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
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({
    path: "test-results/homepage-dark.png",
    fullPage: true,
  });
  const r = await request.get("/api/health");
  expect(r.status()).toBe(200);
  expect(await r.json()).toEqual({ status: "ok", service: "tastepolicy" });
  expect(r.headers()["x-content-type-options"]).toBe("nosniff");
  expect(r.headers()["x-frame-options"]).toBe("DENY");
  expect(errors).toEqual([]);
});
