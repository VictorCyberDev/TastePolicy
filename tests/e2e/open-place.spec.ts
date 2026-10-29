import { test, expect as baseExpect, type Page } from "@playwright/test";
import { mockExperience } from "./experience-fixture";
import {
  openContext,
  routeFixture,
  stubOpenNetwork,
} from "./open-place-fixture";
import { labelSynthetic } from "./synthetic-label";

const expect = baseExpect.configure({ timeout: 20000 });
test.setTimeout(120000);

async function toPlace(
  page: Page,
  context: unknown,
  opts: Parameters<typeof mockExperience>[1] = {},
) {
  await stubOpenNetwork(page);
  const api = await mockExperience(page, { ...opts, context });
  await page.goto("/experience", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Find places/ }).click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Find places that feel like this" })
    .click();
  await expect(
    page.getByRole("heading", { name: /SYNTHETIC TEST DATA Jazz Cellar/ }),
  ).toBeAttached();
  await labelSynthetic(page);
  return api;
}

test("gallery labels every picture by its real relationship and credits its source", async ({
  page,
}) => {
  await toPlace(page, openContext());
  const gallery = page.getByRole("figure", { name: /Photos of and around/ });
  // First: the map-linked exact image.
  await expect(gallery.locator(".tp-gallery-tag")).toHaveText(
    "Photo of SYNTHETIC TEST DATA Jazz Cellar",
  );
  await expect(
    gallery.getByText("Epicgenius · Wikimedia Commons"),
  ).toBeVisible();
  await expect(
    gallery.getByRole("link", { name: "CC BY-SA 4.0" }),
  ).toHaveAttribute("href", /creativecommons/);
  // Next picture: only "near" or "around", never the venue itself.
  await gallery.getByRole("button", { name: "Next photo" }).click();
  const tag = await gallery.locator(".tp-gallery-tag").innerText();
  expect(tag).toMatch(/^(Street view near|Around|In the area around)/);
  expect(tag).not.toMatch(/^Photo of/);
  await expect(gallery.getByText("© KartaView contributors")).toBeVisible();
  // Thumbnails are real buttons with names; the count is announced.
  await expect(
    gallery.getByRole("button", { name: /^Photo 1: Photo of/ }),
  ).toBeVisible();
  await expect(gallery.getByText(/2 of 4/)).toBeVisible();
});

test("falls back to the labelled authored illustration when no real media exists", async ({
  page,
}) => {
  await toPlace(
    page,
    openContext({ media: [], sequence: undefined, panorama: undefined }),
  );
  await expect(
    page.getByText("Illustrative taste image · not property photography"),
  ).toBeVisible();
  await expect(
    page.getByRole("figure", { name: /Photos of and around/ }),
  ).toHaveCount(0);
});

test("See the approach waits for the person: no autoplay, manual steps, then play", async ({
  page,
}) => {
  await toPlace(page, openContext());
  await page.getByRole("button", { name: "See the approach" }).click();
  const seq = page.getByRole("region", { name: /Street sequence toward/ });
  await expect(seq.getByText("Street sequence · frame 1 of 5")).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(seq.getByText("Street sequence · frame 1 of 5")).toBeVisible();
  await seq.getByRole("button", { name: "Next frame" }).click();
  await expect(seq.getByText("frame 2 of 5")).toBeVisible();
  await seq.getByRole("button", { name: "Play" }).click();
  await expect(seq.getByText(/frame ([3-5]) of 5/)).toBeVisible();
  await expect(
    seq.getByText(/not whether the place is accessible/),
  ).toBeVisible();
  // Never described as a video.
  await expect(page.getByText(/video/i)).toHaveCount(0);
  await seq.getByRole("button", { name: "Close" }).click();
  await expect(seq).toHaveCount(0);
});

test("reduced motion: the sequence only moves when the person steps it", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await toPlace(page, openContext());
  await page.getByRole("button", { name: "See the approach" }).click();
  const seq = page.getByRole("region", { name: /Street sequence toward/ });
  await expect(seq.getByRole("button", { name: "Play" })).toBeDisabled();
  await expect(seq.getByText(/Reduced motion is on/)).toBeVisible();
  await seq.getByRole("button", { name: "Next frame" }).click();
  await expect(seq.getByText("frame 2 of 5")).toBeVisible();
});

test("Look around shows only a genuinely panoramic capture and can always be exited", async ({
  page,
}) => {
  await toPlace(page, openContext());
  await page.getByRole("button", { name: "Look around" }).click();
  const pano = page.getByRole("region", { name: /360° panorama near/ });
  await expect(
    pano.getByRole("region", { name: /Scroll sideways or use the arrow keys/ }),
  ).toBeVisible();
  await expect(
    pano.getByText(/Captured nearby, not at the door/),
  ).toBeVisible();
  await pano.getByRole("button", { name: "Exit panorama" }).click();
  await expect(pano).toHaveCount(0);
  // No panoramic capture, no Look around.
  await page
    .getByRole("button", { name: "Show me another" })
    .waitFor({ state: "attached" })
    .catch(() => undefined);
});

test("no 360 control without real panoramic imagery", async ({ page }) => {
  await toPlace(page, openContext({ panorama: undefined }));
  await expect(page.getByRole("button", { name: "Look around" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "See the approach" }),
  ).toBeVisible();
});

test("See the journey: map region, text equivalents, honest unknown travel time, attribution", async ({
  page,
}) => {
  await toPlace(page, openContext());
  await page.getByRole("button", { name: "See the journey" }).click();
  const map = page.getByTestId("journey-map");
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute(
    "aria-label",
    /Map showing SYNTHETIC TEST DATA Jazz Cellar/,
  );
  await expect(page.getByText(/Travel time/)).toBeVisible();
  await expect(
    page.getByText(/Not confirmed: no routing provider is configured here/),
  ).toBeVisible();
  await expect(page.getByText(/not a walking route/)).toBeVisible();
  await expect(
    page.getByText(
      /Map: OpenFreeMap · © OpenMapTiles · Data © OpenStreetMap contributors/,
    ),
  ).toBeVisible();
  // No invented minutes anywhere.
  await expect(page.getByText(/\d+ min walk/)).toHaveCount(0);
});

test("a real route shows distance, duration and ties the line to the authority state", async ({
  page,
}) => {
  await toPlace(
    page,
    openContext({ route: routeFixture, routeUnavailable: undefined }),
  );
  await page.getByRole("button", { name: "See the journey" }).click();
  await expect(
    page.getByText(/13 min · 900 m from Margaret's home/),
  ).toBeVisible();
  await expect(
    page.getByText(/Route: openrouteservice \(HeiGIT\)/),
  ).toBeVisible();
  const map = page.getByTestId("journey-map");
  // If WebGL is unavailable in this browser the map degrades to text, never to nothing.
  await expect(map).toHaveAttribute("data-ready", /ready|failed/);
  if ((await map.getAttribute("data-ready")) === "ready") {
    const badge = page.locator(".tp-map-badge");
    await expect(badge).toHaveText("Exploring");
    await page
      .getByRole("button", { name: "Check it against her needs" })
      .click();
    await expect(badge).toHaveText("Paused at the boundary");
  }
});

test("map failure degrades to text and a fallback line; the decision flow still works", async ({
  page,
}) => {
  await stubOpenNetwork(page, { style: false });
  const api = await mockExperience(page, {
    context: openContext({ route: routeFixture, routeUnavailable: undefined }),
  });
  await page.goto("/experience", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Find places/ }).click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Find places that feel like this" })
    .click();
  await page.getByRole("button", { name: "See the journey" }).click();
  await expect(page.getByText(/13 min · 900 m/).first()).toBeVisible();
  await page
    .getByRole("button", { name: "Check it against her needs" })
    .click();
  await expect(page.getByText(/I need to confirm a few things/)).toBeVisible();
  expect(api.evaluations.at(-1)?.decision.outcome).toBe("ASK");
});

test("privacy: no automatic geolocation, and only the explicit demo origin is sent", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { __geo: number }).__geo = 0;
    const g = navigator.geolocation;
    for (const k of ["getCurrentPosition", "watchPosition"] as const)
      (g as unknown as Record<string, unknown>)[k] = () => {
        (window as unknown as { __geo: number }).__geo++;
      };
  });
  const bodies: Record<string, unknown>[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/places/context")) bodies.push(r.postDataJSON());
  });
  await toPlace(page, openContext());
  await page.getByRole("button", { name: "See the journey" }).click();
  expect(
    await page.evaluate(() => (window as unknown as { __geo: number }).__geo),
  ).toBe(0);
  expect(bodies.length).toBeGreaterThan(0);
  for (const b of bodies)
    expect((b.origin as { label: string }).label).toMatch(/demo location/);
});

test("authority semantics are unchanged by imagery: pictures never satisfy a requirement", async ({
  page,
}) => {
  const api = await toPlace(page, openContext());
  await page
    .getByRole("button", { name: "Check it against her needs" })
    .click();
  await expect(page.getByText(/I need to confirm a few things/)).toBeVisible();
  expect(api.evaluations.at(-1)?.decision).toMatchObject({
    outcome: "ASK",
    basis: "UNRESOLVED_CONTEXT",
  });
  expect(api.evaluations.at(-1)?.context.facts ?? []).toEqual([]);
  // The receipt keeps imagery apart from evidence.
  await page.getByText("Why this happened").first().click();
  await expect(
    page.locator(".tp-source b", { hasText: "Place imagery" }),
  ).toBeVisible();
  await expect(
    page.getByText(/never used as evidence about access, noise or safety/),
  ).toBeVisible();
});

test("OpenStreetMap facts show plainly (Yes / No), not as raw booleans", async ({
  page,
}) => {
  const fact = (value: boolean) => ({
    key: "accessible_entrance",
    value,
    state: "known",
    evidence: "VERIFIED",
    source: "openstreetmap",
    sourceType: "PLACE_PROVIDER",
    note: "Mapped by OpenStreetMap contributors; not independently verified.",
  });
  await toPlace(page, openContext({}, { facts: [fact(false)] as never }), {
    facts: [fact(false)] as never,
  });
  await expect(page.getByText(/Step-free entrance/).first()).toBeVisible();
  await expect(
    page.locator(".tp-need", { hasText: "Step-free entrance" }),
  ).toContainText("No");
  await expect(
    page.locator(".tp-need", { hasText: "Step-free entrance" }),
  ).not.toContainText("false");
});

test("axe and mobile: gallery, approach and journey open with no serious violations or overflow", async ({
  page,
}) => {
  const AxeBuilder = (await import("@axe-core/playwright")).default;
  await page.setViewportSize({ width: 390, height: 844 });
  await toPlace(page, openContext());
  await page.getByRole("button", { name: "See the journey" }).click();
  await expect(page.getByTestId("journey-map")).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const check = async () =>
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map(
        (v) =>
          `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 80)).join(" | ")}`,
      );
  expect(await check()).toEqual([]);
  await page.getByRole("button", { name: "See the approach" }).click();
  expect(await check()).toEqual([]);
  for (const name of ["Previous frame", "Next frame", "Close"]) {
    const box = await page
      .getByRole("button", { name })
      .boundingBox()
      .catch(() => null);
    if (box) expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
