import { test, expect, type Page } from "@playwright/test";
// SYNTHETIC TEST DATA. Intercepted browser transport only; the read model itself is covered by unit and database tests.
const passportRef = "tp_" + "a".repeat(48);
const events = [
  {
    at: "2026-10-24T12:05:00.000Z",
    kind: "PROOFS_INVALIDATED",
    actor: "SYSTEM",
    title: "1 shared proof stopped being valid",
    detail: "They do not come back, even if authority resumes.",
    ref: "cccccccc",
    technical: { epoch: 1, count: 1 },
  },
  {
    at: "2026-10-24T12:04:00.000Z",
    kind: "CHECKPOINT",
    actor: "AGENT",
    title: "Agent-A checked in",
  },
  {
    at: "2026-10-24T12:00:00.000Z",
    kind: "EVALUATED",
    actor: "AGENT",
    title: "Agent-A asked about “SYNTHETIC TEST DATA Cafe”: allowed",
    ref: "aaaaaaaa",
  },
];
async function fixture(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/account/**", async (r) => {
    const op = r.request().url().split("/").at(-1)!;
    const data: Record<string, unknown> = {
      inspect: { passport: { passportRef } },
      timeline: {
        schemaVersion: "taste-authority-timeline-v1",
        events,
        truncated: true,
      },
    };
    await r.fulfill({ json: { status: "available", data: data[op] ?? {} } });
  });
  return errors;
}
test("the timeline reads newest first, hides routine check-ins by default, and exposes technical details only on request", async ({
  page,
}) => {
  const errors = await fixture(page);
  await page.goto("/account/timeline");
  const list = page.getByRole("list", { name: "Authority history" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list.getByRole("listitem").first()).toContainText(
    "1 shared proof stopped being valid",
  );
  await expect(page.getByText("checked in")).toHaveCount(0);
  await page.getByLabel("Hide routine check-ins").uncheck();
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(
    page.getByText("Older history is not shown here."),
  ).toBeVisible();
  // technical details stay collapsed until opened, and open from the keyboard
  const summary = page.getByText("Technical details").first();
  await expect(page.locator("pre").first()).toBeHidden();
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("pre").first()).toContainText('"epoch": 1');
  // no credential-shaped value is ever rendered
  expect(await page.content()).not.toMatch(/tp_live_|tl_[a-f0-9]{20}/);
  expect(errors).toEqual([]);
});
test("timeline on a phone: no horizontal overflow, readable without colour", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await fixture(page);
  await page.goto("/account/timeline");
  await expect(
    page.getByRole("heading", { name: "What happened, in order" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  // each entry carries a text mark, not only a colour
  await expect(page.locator(".mark").first()).not.toBeEmpty();
});
