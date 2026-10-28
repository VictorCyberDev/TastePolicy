import { test, expect, type Page } from "@playwright/test";
import { labelSynthetic } from "./synthetic-label";
import { entities, ids } from "../qloo-fixtures";
import { syntheticReceipt } from "../receipt-presentation-fixture";
const unexpectedBrowserErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  unexpectedBrowserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !/Failed to load resource: the server responded with a status of (400|422|429|500|503)/.test(
        message.text(),
      )
    )
      errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(unexpectedBrowserErrors.get(page)).toEqual([]);
});
async function arrange(page: Page, score = 0.7) {
  await page.route("**/api/demo/resolve", (r) =>
    r.fulfill({
      json: {
        status: "available",
        data: entities.slice(0, 5).map((e) => ({
          status: "available",
          data: { state: "single", matches: [e] },
        })),
      },
    }),
  );
  await page.route("**/api/demo/discover", (r) =>
    r.fulfill({
      json: {
        status: "available",
        data: {
          candidates: [{ entity: entities[5], rank: 1, alignmentScore: score }],
        },
      },
    }),
  );
  await page.route("**/api/demo/evaluate", (r) =>
    r.fulfill({ json: { status: "available", data: syntheticReceipt(score) } }),
  );
  await page.goto("/demo");
  await labelSynthetic(page);
  await page.getByRole("button", { name: "Resolve with Qloo" }).click();
  for (let i = 0; i < 5; i++)
    await page
      .getByLabel(`Signal ${i + 1} resolved identity`)
      .selectOption(ids[i]);
  await page.getByLabel("Target domain").selectOption("destination");
  await page.getByRole("button", { name: "Discover with Qloo" }).click();
}
for (const [score, outcome] of [
  [0.9, "ALLOW"],
  [0.7, "ASK"],
  [0.2, "REJECT"],
] as const) {
  test(`synthetic ${outcome} exposes cultural boundary and auditable receipt`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await arrange(page, score);
    await page.getByRole("button", { name: "Propose SELECT_ENTITY" }).click();
    await expect(
      page.getByRole("heading", { name: `Cultural policy: ${outcome}` }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toContainText(
      "Cultural Receipt ready.",
    );
    await expect(page.getByText("Travel agent proposal")).toBeVisible();
    await expect(page.getByText(/grants no spending/)).toBeVisible();
    await expect(
      page.getByText("Raw affinity / configured scale"),
    ).toBeVisible();
    await page.getByText("Policy & thresholds").click();
    await expect(page.getByText(/ALLOW above 0.8/)).toBeVisible();
    await page.getByText("Provenance & versions").click();
    await expect(
      page.getByText("cultural-receipt-v1", { exact: true }),
    ).toBeVisible();
    await page.getByText("Machine-readable receipt").focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByLabel("Machine-readable Cultural Receipt"),
    ).toContainText(`"outcome": "${outcome}"`);
    await expect(
      page.getByText("SYNTHETIC TEST DATA — TEST ONLY"),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/SYNTHETIC-${outcome}-desktop.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}
test("synthetic provider failure remains unavailable without a receipt or reject", async ({
  page,
}) => {
  await arrange(page);
  await page.route("**/api/demo/evaluate", (r) =>
    r.fulfill({
      status: 503,
      json: { status: "unavailable", reason: "provider_error" },
    }),
  );
  await page.getByRole("button", { name: "Propose SELECT_ENTITY" }).click();
  await expect(
    page.getByRole("heading", { name: "Cultural evaluation unavailable" }),
  ).toBeVisible();
  await expect(page.getByTestId("decision")).toHaveCount(0);
  await expect(page.getByText("Machine-readable receipt")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/SYNTHETIC-unavailable.png",
    fullPage: true,
  });
});
test("keyboard validation is associated and loading describes each real request", async ({
  page,
}) => {
  await page.goto("/demo");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to working demo" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByLabel("Signal 1 name", { exact: true }).fill("");
  await page.getByRole("button", { name: "Resolve with Qloo" }).click();
  await expect(page.getByLabel("Signal 1 name", { exact: true })).toBeFocused();
  await expect(
    page.getByLabel("Signal 1 name", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Signal 1 name", { exact: true }).fill("Radiohead");
  let release!: () => void;
  await page.route("**/api/demo/resolve", async (r) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await r.fulfill({
      json: {
        status: "available",
        data: entities.slice(0, 5).map((e) => ({
          status: "available",
          data: { state: "single", matches: [e] },
        })),
      },
    });
  });
  await page.getByRole("button", { name: "Resolve with Qloo" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Resolving cultural signals",
  );
  await expect(
    page.getByRole("button", { name: "Resolve with Qloo" }),
  ).toBeDisabled();
  release();
  for (let i = 0; i < 5; i++)
    await page
      .getByLabel(`Signal ${i + 1} resolved identity`)
      .selectOption(ids[i]);
  await page.route("**/api/demo/discover", async (r) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await r.fulfill({
      json: {
        status: "available",
        data: {
          candidates: [{ entity: entities[5], rank: 1, alignmentScore: 0.7 }],
        },
      },
    });
  });
  await page.getByRole("button", { name: "Discover with Qloo" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Requesting cross-domain cultural evidence",
  );
  release();
  await page.route("**/api/demo/evaluate", async (r) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await r.fulfill({
      json: { status: "available", data: syntheticReceipt() },
    });
  });
  await page.getByRole("button", { name: "Propose SELECT_ENTITY" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Evaluating candidate and awaiting Cultural Receipt",
  );
  release();
  await expect(page.getByTestId("decision")).toHaveText("ASK");
});
test("synthetic mobile decision precedes inputs and long evidence stays bounded", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await arrange(page);
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    ),
  ).toBe("auto");
  const receipt = syntheticReceipt();
  receipt.candidate.name =
    "SYNTHETIC DEVELOPMENT DATA " + "verylongcandidate".repeat(12);
  receipt.action.targetEntity.name = receipt.candidate.name;
  await page.route("**/api/demo/evaluate", (r) =>
    r.fulfill({ json: { status: "available", data: receipt } }),
  );
  await page.getByRole("button", { name: "Propose SELECT_ENTITY" }).click();
  await expect(page.getByTestId("decision")).toHaveText("ASK");
  const outputs = await page.locator(".output-column").boundingBox(),
    inputs = await page.locator(".inputs-column").boundingBox();
  expect(outputs!.y).toBeLessThan(inputs!.y);
  await page.getByText("Machine-readable receipt").click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/SYNTHETIC-mobile-dark.png",
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: "light" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("synthetic invalid request and internal failure use separate safe states", async ({
  page,
}) => {
  await page.goto("/demo");
  await labelSynthetic(page);
  await page.route("**/api/demo/resolve", (r) =>
    r.fulfill({
      status: 400,
      json: {
        status: "error",
        code: "INVALID_INPUT",
        message: "private raw error",
      },
    }),
  );
  await page.getByRole("button", { name: "Resolve with Qloo" }).click();
  await expect(
    page.getByRole("heading", { name: "Review the request" }),
  ).toBeVisible();
  await page.route("**/api/demo/resolve", (r) =>
    r.fulfill({
      status: 500,
      json: {
        status: "error",
        code: "INTERNAL_ERROR",
        message: "private raw error",
      },
    }),
  );
  await page.getByRole("button", { name: "Resolve with Qloo" }).click();
  await expect(
    page.getByRole("heading", { name: "Request could not be completed" }),
  ).toBeVisible();
  await expect(page.getByText("private raw error")).toHaveCount(0);
});

test("light/dark controls have labels, visible focus and AA text tokens", async ({
  page,
}) => {
  await page.goto("/demo");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const audit = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const rgb = (hex: string) =>
        hex
          .trim()
          .replace("#", "")
          .match(/../g)!
          .map((v) => parseInt(v, 16) / 255);
      const lum = (hex: string) =>
        rgb(hex)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
      const ratio = (a: string, b: string) => {
        const x = lum(a),
          y = lum(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      const colors = ["--foreground", "--muted", "--accent"],
        backgrounds = ["--background", "--surface"];
      return {
        unlabeled: Array.from(
          document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
            "input,select",
          ),
        ).filter((e) => !e.labels?.length).length,
        emptyHeadings: Array.from(document.querySelectorAll("h1,h2,h3")).filter(
          (e) => !e.textContent?.trim(),
        ).length,
        ratios: colors.flatMap((c) =>
          backgrounds.map((b) =>
            ratio(root.getPropertyValue(c), root.getPropertyValue(b)),
          ),
        ),
        smallControls: Array.from(
          document.querySelectorAll("button,input,select"),
        ).filter((e) => e.getBoundingClientRect().height < 44).length,
      };
    });
    expect(audit.unlabeled).toBe(0);
    expect(audit.emptyHeadings).toBe(0);
    expect(audit.smallControls).toBe(0);
    for (const ratio of audit.ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
  await page.getByLabel("Signal 1 name", { exact: true }).focus();
  await expect(page.getByLabel("Signal 1 name", { exact: true })).toHaveCSS(
    "outline-style",
    "solid",
  );
  await expect(page.getByLabel("Signal 1 name", { exact: true })).toHaveCSS(
    "outline-width",
    "3px",
  );
});

test("Judge Mode is a preset, not automatic resolution or authorization", async ({
  page,
}) => {
  const providerRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/demo/")) providerRequests.push(r.url());
  });
  await page.goto("/demo");
  await page
    .getByLabel("Signal 1 name", { exact: true })
    .fill("Custom concept");
  await page.getByRole("button", { name: "Load Judge Mode" }).click();
  await expect(page.getByLabel("Signal 1 name", { exact: true })).toHaveValue(
    "Nils Frahm",
  );
  await expect(page.getByLabel("Target domain")).toHaveValue("place");
  await expect(
    page.getByRole("list", { name: "Judge Mode steps" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Discover with Qloo" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Signal 1 resolved identity")).toHaveCount(0);
  expect(providerRequests).toEqual([]);
  await page.screenshot({
    path: "test-results/Judge-Mode-unconfigured.png",
    fullPage: true,
  });
});
test("synthetic evidence never displays a live provenance badge", async ({
  page,
}) => {
  await arrange(page);
  await page.getByRole("button", { name: "Propose SELECT_ENTITY" }).click();
  await expect(page.locator('[data-evidence-source="synthetic"]')).toHaveCount(
    4,
  );
  await expect(page.locator('[data-evidence-source="live"]')).toHaveCount(0);
  await expect(page.getByText("SYNTHETIC TEST DATA — TEST ONLY")).toBeVisible();
});

for (const [score, outcome] of [
  [0.9, "ALLOW"],
  [0.7, "ASK"],
  [0.2, "REJECT"],
] as const) {
  test(`M1.6 synthetic ${outcome} proof uses one candidate without another request`, async ({
    page,
  }) => {
    await arrange(page, score);
    await page.getByRole("button", { name: "Propose SELECT_ENTITY" }).click();
    await expect(
      page.getByRole("article", {
        name: "Signature Cultural Authorization Receipt",
      }),
    ).toContainText(outcome);
    const calls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/demo/")) calls.push(r.url());
    });
    await page
      .getByText("Why does TastePolicy matter?", { exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Capability Comparison" }),
    ).toBeVisible();
    for (const name of [
      "Agent proposal only",
      "Qloo cultural evidence",
      "TastePolicy authorization",
    ])
      await expect(page.getByRole("article", { name })).toContainText(ids[5]);
    await expect(
      page.getByRole("article", { name: "Agent proposal only" }),
    ).not.toContainText(score.toFixed(4));
    await expect(
      page.getByRole("article", { name: "Qloo cultural evidence" }),
    ).not.toContainText(`Cultural policy: ${outcome}`);
    await expect(
      page.getByRole("article", { name: "TastePolicy authorization" }),
    ).toContainText(`Cultural policy: ${outcome}`);
    await expect(page.getByText(/3\/3 identical/)).toBeVisible();
    await page
      .getByText("Structured stability output", { exact: true })
      .click();
    await expect(page.getByLabel("Structured stability output")).toContainText(
      '"stable": true',
    );
    await expect(page.locator('[data-evidence-source="live"]')).toHaveCount(0);
    expect(calls).toEqual([]);
    await page.screenshot({
      path: `test-results/SYNTHETIC-M16-${outcome}-proof.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.getByText("Machine-readable receipt", { exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/SYNTHETIC-M16-${outcome}-mobile.png`,
      fullPage: true,
    });
  });
}
