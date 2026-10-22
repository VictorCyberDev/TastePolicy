import { test, expect, type Page } from "@playwright/test";
import { syntheticReceipt } from "../receipt-presentation-fixture";
import { entities } from "../qloo-fixtures";
import { labelSynthetic } from "./synthetic-label";
const image = {
  status: "available",
  source: "wikimedia-commons",
  presentationOnly: true,
  classification: "LOCATION_CONTEXT",
  caption: "Licensed visual context — exact property not verified",
  searchQuery: "SYNTHETIC TEST DATA",
  image: {
    url: "https://upload.wikimedia.org/wikipedia/commons/a/test.png",
    title: "SYNTHETIC TEST DATA visual context",
    creator: "Synthetic photographer",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    landingUrl: "https://commons.wikimedia.org/wiki/File:Test.png",
  },
};
async function prepare(page: Page, mode: "photo" | "none" | "broken") {
  const receipt = syntheticReceipt(0.9);
  const candidates = [0, 1].map((i) => ({
    entity: {
      ...receipt.candidate,
      id: entities[i].id,
      type: "place",
      name: `SYNTHETIC TEST DATA place ${i}`,
      address: "SYNTHETIC location",
    },
    rank: i + 1,
  }));
  const inputs: unknown[] = [];
  await page.route("**/api/demo/**", async (route) => {
    const op = route.request().url().split("/").at(-1);
    let data: unknown;
    if (op === "resolve")
      data = entities.slice(0, 5).map((entity) => ({
        status: "available",
        data: { state: "single", matches: [entity] },
      }));
    else if (op === "discover")
      data = { candidates, provenance: receipt.qlooEvidence.provenance };
    else {
      const body = route.request().postDataJSON();
      inputs.push(body);
      data = {
        ...receipt,
        candidate: candidates.find((c) => c.entity.id === body.candidateId)!
          .entity,
        action: {
          ...receipt.action,
          targetEntity: candidates.find(
            (c) => c.entity.id === body.candidateId,
          )!.entity,
        },
      };
    }
    await route.fulfill({ json: { status: "available", data } });
  });
  await page.route("**/api/media/place?**", (route) =>
    route.fulfill({
      json: mode === "none" ? { status: "unavailable" } : image,
    }),
  );
  await page.route("https://upload.wikimedia.org/**", (route) =>
    mode === "broken"
      ? route.abort()
      : route.fulfill({
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
            "base64",
          ),
        }),
  );
  await page.goto("/arena/consumer");
  await labelSynthetic(page);
  await page.getByRole("button", { name: "Use my reviewed taste" }).click();

  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Find a place through my taste" })
    .click();
  return inputs;
}
test("licensed context, keyboard controls and photo-independent evaluation on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const inputs = await prepare(page, "photo");
  await expect(
    page.getByRole("link", { name: /Synthetic photographer/ }),
  ).toBeVisible();
  await expect(page.getByText(/exact property not verified/)).toBeVisible();
  const check = page.getByRole("button", {
    name: "Check this choice with TastePolicy",
  });
  await check.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Internal policy: ALLOW")).toBeVisible();
  expect(JSON.stringify(inputs)).not.toMatch(
    /wikimedia|presentationOnly|licenseUrl/,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Show another place" }).click();
  await expect(page.locator(".placeContent h3")).toContainText("place 1");
  await page.screenshot({
    path: ".tastebench/wgb-photo-review/consumer-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
for (const mode of ["none", "broken"] as const)
  test(`mood fallback and unchanged ALLOW when image is ${mode}`, async ({
    page,
  }) => {
    const inputs = await prepare(page, mode);
    await expect(
      page.getByText("Visual mood artwork — presentation only."),
    ).toBeVisible();
    await expect(page.locator(".hasLicensedPhoto")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Check this choice with TastePolicy" })
      .click();
    await expect(page.getByText("Internal policy: ALLOW")).toBeVisible();
    expect(JSON.stringify(inputs)).not.toMatch(
      /wikimedia|presentationOnly|licenseUrl/,
    );
  });
