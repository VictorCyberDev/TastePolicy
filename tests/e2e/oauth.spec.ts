import { test, expect } from "@playwright/test";
// SYNTHETIC TEST DATA. Intercepted transport only; the protocol itself is covered by tests/oauth*.test.ts.
const q =
  "?response_type=code&client_id=tpc_synthetic01&redirect_uri=https%3A%2F%2Fapp.test%2Fcb&code_challenge=" +
  "a".repeat(43) +
  "&code_challenge_method=S256&scope=PASSPORT_READ%20TASTE_EVALUATE";
test("consent says who asks, what it can and cannot do, and sends the decision", async ({
  page,
}) => {
  let decision: Record<string, unknown> | null = null;
  await page.route("**/api/oauth/decision", async (r) => {
    const body = r.request().postDataJSON();
    if (body.approve === undefined)
      return r.fulfill({
        json: {
          clientName: "SYNTHETIC TEST DATA Assistant",
          redirectHost: "app.test",
          scopes: ["PASSPORT_READ", "TASTE_EVALUATE"],
          expiresInDays: 30,
        },
      });
    decision = body;
    return r.fulfill({ json: { redirectTo: "/?linked=1" } });
  });
  await page.goto("/oauth/consent" + q);
  await expect(
    page.getByRole("heading", {
      name: /SYNTHETIC TEST DATA Assistant wants to ask TastePolicy about your preference boundaries/,
    }),
  ).toBeVisible();
  await expect(page.getByText("app.test")).toBeVisible();
  await expect(page.getByText(/Buy, book, pay or send anything/)).toBeVisible();
  await expect(page.getByText(/disconnect it at any time/)).toBeVisible();
  await page.getByRole("button", { name: "Allow", exact: true }).click();
  await expect.poll(() => decision?.approve).toBe(true);
});
test("an unusable request explains itself and offers no Allow button", async ({
  page,
}) => {
  await page.route("**/api/oauth/decision", (r) =>
    r.fulfill({ status: 400, json: { error: "invalid_request" } }),
  );
  await page.goto("/oauth/consent" + q);
  await expect(
    page.getByRole("heading", { name: /can’t be used/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Allow" })).toHaveCount(0);
});
test("a stale sign-in asks for a fresh one and keeps the way back", async ({
  page,
}) => {
  await page.route("**/api/oauth/decision", async (r) => {
    const body = r.request().postDataJSON();
    if (body.approve === undefined)
      return r.fulfill({
        json: {
          clientName: "A",
          redirectHost: "app.test",
          scopes: ["PASSPORT_READ"],
          expiresInDays: 30,
        },
      });
    return r.fulfill({ status: 400, json: { error: "login_required" } });
  });
  await page.goto("/oauth/consent" + q);
  await page.getByRole("button", { name: "Allow", exact: true }).click();
  const link = page.getByRole("link", { name: "Sign in" });
  await expect(link).toBeVisible();
  expect(await link.getAttribute("href")).toContain(
    "/account?next=%2Foauth%2Fconsent",
  );
});
for (const colorScheme of ["light", "dark"] as const)
  test(`consent ${colorScheme} mobile: no horizontal overflow`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 375, height: 800 });
    await page.route("**/api/oauth/decision", (r) =>
      r.fulfill({
        json: {
          clientName: "A",
          redirectHost: "app.test",
          scopes: ["PASSPORT_READ"],
          expiresInDays: 30,
        },
      }),
    );
    await page.goto("/oauth/consent" + q);
    await expect(
      page.getByRole("button", { name: "Allow", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
