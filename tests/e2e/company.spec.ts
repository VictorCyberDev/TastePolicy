import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const routes = [
  "/",
  "/pricing",
  "/judge",
  "/security",
  "/trust",
  "/privacy",
  "/terms",
  "/support",
  "/status",
  "/integrations",
  "/docs",
  "/docs/rest",
  "/docs/mcp",
  "/docs/a2a",
  "/docs/oauth",
  "/docs/proofs",
  "/docs/sdk",
  "/login",
  "/signup",
];
for (const [label, width, height] of [
  ["phone", 360, 740],
  ["tablet", 768, 1024],
  ["desktop", 1440, 1000],
] as const) {
  test(`company pages at ${label}: complete content and no overflow`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const route of routes) {
      // Settle speculative RSC fetches before replacing the document. WebKit
      // reports canceled prefetches as access-control page errors on rapid goto.
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.locator("main h1")).toHaveCount(1);
      await expect(page.locator("main h1")).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
        route,
      ).toBeLessThanOrEqual(0);
    }
    expect(errors).toEqual([]);
  });
}
for (const colorScheme of ["light", "dark"] as const) {
  test(`Authority Card example, keyboard and axe in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to content" }),
    ).toBeFocused();
    for (const outcome of ["ASK", "REJECT", "UNAVAILABLE", "ALLOW"]) {
      await page.getByRole("button", { name: outcome, exact: true }).click();
      await expect(
        page.getByRole("button", { name: outcome, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.getByText("Interactive example · no live decision"),
      ).toBeVisible();
    }
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations).toEqual([]);
    await page.screenshot({
      path: `test-results/company-home-${colorScheme}.png`,
      fullPage: true,
    });
  });
}
test("signup fails honestly when auth is unconfigured; status distinguishes configured from reachable", async ({
  page,
}) => {
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill("Synthetic acceptance");
  await page
    .getByLabel("Email", { exact: true })
    .fill("synthetic@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-password-only");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Account creation failed",
  );
  await page.goto("/status");
  await expect(
    page.getByRole("heading", { name: "Application readiness: not ready" }),
  ).toBeVisible();
  await expect(
    page.getByText(/does not prove provider reachability/),
  ).toBeVisible();
});

test("new developer can review identities, enroll and issue a credential without manual IDs", async ({
  page,
}) => {
  const { entities } = await import("../qloo-fixtures");
  const passportRef = "tp_" + "a".repeat(48);
  let enrolled = false,
    issued = false;
  await page.route("**/api/account/**", async (route) => {
    const op = route.request().url().split("/").at(-1);
    let data: unknown;
    if (op === "create") {
      enrolled = true;
      data = { passportRef };
    } else if (op === "create-key") {
      issued = true;
      data = { secret: "SYNTHETIC_CREDENTIAL_DO_NOT_USE" };
    } else {
      data = {
        userId: "synthetic-user",
        passport: enrolled
          ? {
              passportRef,
              displayLabel: "My private Passport",
              stateVersion: 1,
              expiresAt: "2026-11-28T00:00:00Z",
            }
          : null,
        credentials: issued
          ? [
              {
                credentialId: "synthetic",
                displayLabel: "My application",
                revoked: false,
              },
            ]
          : [],
      };
    }
    if (op === "create")
      expect(route.request().postDataJSON().identitiesReviewed).toBe(true);
    await route.fulfill({ json: { status: "available", data } });
  });
  await page.route("**/api/demo/resolve", (route) =>
    route.fulfill({
      json: {
        status: "available",
        data: entities.slice(0, 5).map((entity) => ({
          status: "available",
          data: { matches: [entity], state: "single" },
        })),
      },
    }),
  );
  await page.goto("/developers/workspace");
  await page
    .getByRole("button", { name: "Use public example anchors" })
    .click();
  await page
    .getByRole("button", { name: "Resolve public cultural entities" })
    .click();
  for (let i = 0; i < 5; i++)
    await page
      .getByRole("combobox", {
        name: `Reviewed identity ${i + 1}`,
        exact: true,
      })
      .selectOption(entities[i].id);
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Create my private Passport" })
    .click();
  await expect(
    page.getByRole("heading", { name: "1. Your Passport is ready" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Issue developer credential" })
    .click();
  await expect(page.getByLabel("One-time developer credential")).toHaveValue(
    "SYNTHETIC_CREDENTIAL_DO_NOT_USE",
  );
  await page.getByRole("button", { name: "Hide from this page" }).click();
  await expect(
    page.getByText("SYNTHETIC_CREDENTIAL_DO_NOT_USE", { exact: true }),
  ).toHaveCount(0);
  expect(enrolled && issued).toBe(true);
});

test("company navigation uses the client router without runtime errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/", { waitUntil: "networkidle" });
  // Human pages use the "Primary" navigation, technical/company pages "Company".
  for (const [nav, name, pathname] of [
    ["Primary", "Product", "/product"],
    ["Primary", "Developers", "/developers"],
    ["Company", "Trust", "/trust"],
    ["Company", "Use cases", "/experience"],
  ]) {
    await page
      .getByRole("navigation", { name: nav, exact: true })
      .first()
      .getByRole("link", { name, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(pathname + "$"));
    await expect(page.locator("main h1").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
  }
  expect(errors).toEqual([]);
});
