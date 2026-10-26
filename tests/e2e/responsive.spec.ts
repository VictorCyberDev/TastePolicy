import { test, expect } from "@playwright/test";
// SYNTHETIC TEST DATA. Representative phone, tablet and desktop widths for the
// main account and public pages: no horizontal overflow, a visible main
// heading, and every interactive control reachable by keyboard (focus lands on
// something other than the body after Tab).
const passportRef = "tp_" + "a".repeat(48);
const sizes = [
  ["phone", 360, 740],
  ["tablet", 768, 1024],
  ["desktop", 1280, 800],
] as const;
const pages: [string, string][] = [
  ["/product", "Your taste. Your rules. Any agent."],
  ["/developers", "Subjective authority for your agents"],
  ["/account/rules", "Your rules"],
  ["/account/leases", "What agents may do now"],
  ["/account/timeline", "What happened, in order"],
  ["/verify", "Check a TastePolicy proof"],
];
for (const [name, width, height] of sizes)
  for (const [path, heading] of pages)
    test(`${path} at ${name} (${width}px): no overflow, heading visible, keyboard reachable`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.route("**/api/account/**", async (r) => {
        const op = r.request().url().split("/").at(-1)!;
        const data: Record<string, unknown> = {
          inspect: { passport: { passportRef } },
          "policy-get": {
            passportRef,
            history: [],
            suggestions: [],
            overrides: [],
            active: null,
          },
          "lease-list": {
            passportRef,
            pending: [],
            leases: [],
            timeline: [],
          },
          timeline: {
            schemaVersion: "taste-authority-timeline-v1",
            events: [],
            truncated: false,
          },
        };
        await r.fulfill({
          json: { status: "available", data: data[op] ?? {} },
        });
      });
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(
        () => document.activeElement?.tagName ?? "BODY",
      );
      expect(focused).not.toBe("BODY");
    });
