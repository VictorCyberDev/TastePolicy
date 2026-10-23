import { test, expect as baseExpect, type Page } from "@playwright/test";
import { mockConsumerState } from "./consumer-state-fixture";
import { entities } from "../qloo-fixtures";
import { syntheticReceipt } from "../receipt-presentation-fixture";
import { labelSynthetic } from "./synthetic-label";
// Bootstrap + explicit mutation + evaluation + captured plan are separately paced requests.
const expect = baseExpect.configure({ timeout: 15000 });
const receipt = syntheticReceipt(0.9);
const candidates = [
  {
    ...receipt.candidate,
    type: "place" as const,
    name: "SYNTHETIC TEST DATA original",
    address: "SYNTHETIC location",
  },
  {
    ...receipt.candidate,
    id: "10000000-0000-4000-8000-000000000006",
    type: "place" as const,
    name: "SYNTHETIC TEST DATA alternative with a long readable label",
    address: "SYNTHETIC location",
  },
];
async function setup(
  page: Page,
  options: Parameters<typeof mockConsumerState>[3] = {},
) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.route("**/api/demo/**", (route) =>
    route.fulfill({
      json: {
        status: "available",
        data: route.request().url().endsWith("/resolve")
          ? entities.slice(0, 5).map((e) => ({
              status: "available",
              data: { state: "single", matches: [e] },
            }))
          : {
              candidates: candidates.map((entity, i) => ({
                entity,
                rank: i + 1,
              })),
              provenance: receipt.qlooEvidence.provenance,
            },
      },
    }),
  );
  await page.route("**/api/media/place?**", (route) =>
    route.fulfill({
      json: {
        status: "unavailable",
        presentationOnly: true,
        classification: "UNAVAILABLE",
      },
    }),
  );
  const api = await mockConsumerState(page, receipt, candidates, options);
  await page.goto("/arena/consumer");
  await labelSynthetic(page);
  return Object.assign(api, { errors });
}
// Navigates TASTE → confirm → DISCOVER and stops on the first candidate card.
async function start(
  page: Page,
  options: Parameters<typeof mockConsumerState>[3] = {},
) {
  const api = await setup(page, options);
  await page.getByRole("button", { name: "Use my reviewed taste" }).click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Find a place through my taste" })
    .click();
  await expect(page.locator(".placeContent h3")).toContainText("original");
  return api;
}
async function boundaries(page: Page) {
  await page.getByText("Try a boundary", { exact: true }).click();
}
const decision = (page: Page) => page.locator(".humanDecision");
const progress = (page: Page) => page.getByRole("list", { name: /^Step \d/ });
const checkButton = (page: Page) =>
  page.getByRole("button", { name: /^(Looks good|Check this alternative)/ });

test("stage journey: TASTE → confirm → DISCOVER → CHECKING → ALLOW → non-executing HANDOFF", async ({
  page,
}) => {
  const requested: string[] = [];
  page.on("request", (r) => requested.push(r.url()));
  const api = await setup(page, { evaluateDelayMs: 1500 });

  // TASTE: one moment, one action, no candidate yet.
  await expect(progress(page)).toHaveAttribute(
    "aria-label",
    "Step 1 of 4: Taste",
  );
  await expect(
    page.getByRole("heading", { name: /Taste is plural/ }),
  ).toBeVisible();
  // The opening screen separates Qloo's taste evidence from TastePolicy's permission.
  await expect(
    page.getByText(
      "Qloo finds what fits. TastePolicy decides whether your agent may continue.",
    ),
  ).toBeVisible();
  await expect(page.locator(".placeCard")).toHaveCount(0);
  await page.getByRole("button", { name: "Use my reviewed taste" }).click();

  // Taste confirmation replaces the taste screen.
  await expect(
    page.getByRole("heading", { name: /five things you meant/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Use my reviewed taste" }),
  ).toHaveCount(0);
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Find a place through my taste" })
    .click();

  // DISCOVER: one dominant candidate card, taste setup is gone.
  await expect(page.locator(".boundary")).toHaveAttribute(
    "data-boundary",
    "discover",
  );
  await expect(page.locator(".consumerArena")).toHaveAttribute(
    "data-mode",
    "discovery",
  );
  expect(
    await page.evaluate(async () => {
      await document.fonts.ready;
      return [
        document.fonts.check('16px "Instrument Serif"'),
        document.fonts.check('600 16px "Inter"'),
      ];
    }),
  ).toEqual([true, true]);
  await expect(page.locator(".placeContent h3")).toContainText("original");
  await expect(progress(page)).toHaveAttribute(
    "aria-label",
    "Step 2 of 4: Discover",
  );
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.locator(".placeCard")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Another one/ })).toBeVisible();
  await expect(page.getByText("Why this?", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Looks good →" }),
  ).toBeVisible();
  expect(api.calls.filter((c) => c.operation === "evaluate")).toHaveLength(0);

  // CHOOSE → CHECKING: the deck leaves immediately and the real request runs.
  await page.getByRole("button", { name: "Looks good →" }).click();
  await expect(
    page.getByRole("heading", {
      name: "TastePolicy is checking your boundaries…",
    }),
  ).toBeVisible();
  await expect(page.locator(".placeCard")).toHaveCount(0);
  await expect(progress(page)).toHaveAttribute(
    "aria-label",
    "Step 3 of 4: Check",
  );
  await expect(page.locator(".boundary")).toHaveAttribute(
    "data-boundary",
    "checking",
  );
  expect(api.evaluations).toHaveLength(0);

  // DECISION → ALLOW has its own screen; nothing of the deck remains.
  await expect(decision(page)).toContainText("This fits");
  await expect(page.getByRole("heading", { name: /This fits/ })).toBeFocused();
  await expect(decision(page)).toContainText(
    "Your concierge can continue with this choice.",
  );
  await expect(decision(page)).toContainText(
    "Booking and payment still need separate authority.",
  );
  await expect(page.getByText("Internal policy: ALLOW")).toBeVisible();
  await expect(page.locator(".boundary")).toHaveAttribute(
    "data-boundary",
    "allow",
  );
  await expect(page.locator(".consumerArena")).toHaveAttribute(
    "data-mode",
    "authorization",
  );
  await expect(progress(page)).toHaveAttribute(
    "aria-label",
    "Step 4 of 4: Decision",
  );
  await expect(page.locator(".placeCard")).toHaveCount(0);
  expect(api.evaluations).toHaveLength(1);
  expect(api.evaluations[0].decision.outcome).toBe("ALLOW");

  // HANDOFF performs no network request and offers no executable action.
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  const stateBefore = JSON.stringify(api.state);
  const callsBefore = api.calls.length;
  await page
    .getByRole("button", { name: "Continue with this choice →" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Preference check complete." }),
  ).toBeVisible();
  await expect(page.locator(".boundary")).toHaveAttribute(
    "data-boundary",
    "handoff",
  );
  // Same-agent continuity is explicit; booking/payment need separate authority.
  await expect(
    page.getByText("The same concierge can keep going with this choice."),
  ).toBeVisible();
  await expect(
    page.getByText("Same agent. Different permission."),
  ).toBeVisible();
  await expect(page.getByText("Next permission")).toBeVisible();
  await expect(
    page.getByText(/need separate execution authority/),
  ).toBeVisible();
  await expect(page.getByText(/another agent|elsewhere/i)).toHaveCount(0);
  await expect(
    page.getByText(/Nothing was booked, reserved, purchased or paid/),
  ).toBeVisible();
  await expect(page.locator("main input, main select, main form")).toHaveCount(
    0,
  );
  const labels = await page.locator("main button, main a").allInnerTexts();
  expect(labels.join("|")).not.toMatch(/\b(book|pay|purchase|reserve|buy)\b/i);
  expect(api.calls).toHaveLength(callsBefore);
  expect(api.evaluations).toHaveLength(1);
  expect(JSON.stringify(api.state)).toBe(stateBefore);
  expect(requests.filter((url) => /\/api\//.test(url))).toEqual([]);
  // Fonts are self-hosted: none requested from a third party.
  expect(
    requested.filter((u) => /fonts\.(googleapis|gstatic)\.com/.test(u)),
  ).toEqual([]);
  expect(
    requested.some((u) =>
      u.includes("/fonts/instrument-serif-latin-400-normal.woff2"),
    ),
  ).toBe(true);
  expect(api.errors).toEqual([]);
});

test("synthetic consumer budget ASK → explicit price → captured ALLOW; UNKNOWN never guesses", async ({
  page,
}) => {
  const api = await start(page);
  await boundaries(page);
  await page.getByRole("button", { name: "I have a $100 budget" }).click();
  // ASK is its own screen: the deck is gone and one focused question remains.
  await expect(decision(page)).toContainText("One thing first");
  await expect(decision(page)).toContainText("Your budget is $100.");
  await expect(
    page.getByRole("heading", { name: "What does this place cost?" }),
  ).toBeVisible();
  await expect(page.locator(".placeCard")).toHaveCount(0);
  await expect(page.getByText("Try a boundary")).toHaveCount(0);
  await expect(page.getByLabel("Price in USD")).toBeVisible();
  expect(api.state.stateVersion).toBe(2);
  const rules = JSON.stringify(api.state.entries);
  await page.getByRole("button", { name: "I don’t know", exact: true }).click();
  await expect(decision(page)).toContainText("Internal policy: ASK");
  await page.getByRole("button", { name: "Show the question" }).click();
  await page.getByLabel("Price in USD").fill("40");
  await page.getByRole("button", { name: "Use this price" }).click();
  await expect(decision(page)).toContainText("This fits");
  // Captured-evidence labelling lives behind progressive disclosure.
  await page.getByText("Why this?", { exact: true }).click();
  await page.getByText("Developer details", { exact: true }).click();
  await expect(page.locator(".consumerDeveloper")).toContainText(
    "Original decision: ASK",
  );
  await expect(page.locator(".whyPanel")).toContainText(
    "CAPTURED QLOO EVIDENCE",
  );
  expect(api.state.stateVersion).toBe(2);
  expect(JSON.stringify(api.state.entries)).toBe(rules);
  expect(api.calls.some((c) => c.operation === "interactive/plan")).toBe(true);
  expect(
    api.calls.filter((c) => c.operation === "interactive/answer"),
  ).toHaveLength(2);
  expect(api.errors).toEqual([]);
});

test("synthetic consumer explicit exclusion → STOP → one separate proposal → fresh authorization keeps exclusion", async ({
  page,
}) => {
  const api = await start(page);
  await boundaries(page);
  await page
    .getByRole("button", { name: "Never choose this place for me" })
    .click();
  // REJECT is its own screen.
  await expect(decision(page)).toContainText("Not this one");
  await expect(decision(page)).toContainText("You told TastePolicy");
  await expect(page.locator(".placeCard")).toHaveCount(0);
  const before = JSON.stringify(api.state);
  expect(api.state.stateVersion).toBe(2);
  await page
    .getByRole("button", { name: "Find something that respects that →" })
    .click();
  // Repair appears as a new proposal stage, not beneath the original.
  await expect(page.locator(".placeContent h3")).toContainText("alternative");
  await expect(page.getByText("New proposal · not checked yet")).toBeVisible();
  await expect(page.getByText(/excluded choice stays excluded/)).toBeVisible();
  await expect(page.getByText("SYNTHETIC TEST DATA original")).toHaveCount(0);
  await expect(decision(page)).toHaveCount(0);
  await expect(page.locator(".placeCard")).toHaveCount(1);
  // Repair verification alone is not authorization.
  expect(api.evaluations).toHaveLength(1);
  expect(JSON.stringify(api.state)).toBe(before);
  await checkButton(page).click();
  await expect(decision(page)).toContainText("This fits");
  await expect(decision(page)).toContainText(
    "earlier exclusion is still saved",
  );
  expect(api.evaluations).toHaveLength(2);
  expect(api.evaluations[0].decision.outcome).toBe("REJECT");
  expect(api.evaluations[1].action.candidate.id).toBe(candidates[1].id);
  expect(JSON.stringify(api.state)).toBe(before);
  expect(
    api.state.entries.some(
      (e) =>
        e.candidateId === candidates[0].id &&
        e.constraint?.kind === "EXCLUDE_CANDIDATE",
    ),
  ).toBe(true);
  expect(
    api.calls.filter((c) => c.operation === "interactive/repair"),
  ).toHaveLength(1);
  expect(api.calls.filter((c) => c.operation === "evaluate")).toHaveLength(2);
  expect(JSON.stringify(api.evaluationInputs)).not.toMatch(
    /wikimedia|presentationOnly|licenseUrl|taste-\d|\.svg|spectrum|palette|Illustrative taste image/,
  );
  expect(api.errors).toEqual([]);
});

test("synthetic consumer swipe navigation makes no rule and rehearsal makes no provider call", async ({
  page,
}) => {
  const api = await start(page);
  const portrait = page.locator(".placePortrait");
  await portrait.dispatchEvent("pointerdown", { clientX: 260 });
  await portrait.dispatchEvent("pointerup", { clientX: 30 });
  await expect(page.locator(".placeContent h3")).toContainText("alternative");
  expect(api.calls).toHaveLength(0);
  expect(api.state.entries).toHaveLength(0);
  await boundaries(page);
  await page
    .getByRole("button", { name: "What if evidence is missing?" })
    .click();
  await expect(
    page.getByRole("region", { name: "Demo rehearsal" }),
  ).toContainText("No Qloo call");
  await expect(
    page.getByRole("region", { name: "Demo rehearsal" }),
  ).toContainText("No fabricated receipt");
  expect(api.calls).toHaveLength(0);
});

test("synthetic consumer swipe right only checks this choice; it grants no execution authority", async ({
  page,
}) => {
  const api = await start(page);
  const portrait = page.locator(".placePortrait");
  await portrait.dispatchEvent("pointerdown", { clientX: 30 });
  await portrait.dispatchEvent("pointerup", { clientX: 260 });
  await expect(decision(page)).toContainText("This fits");
  // The swipe stopped at the decision: no handoff, no extra rule or request.
  await expect(
    page.getByRole("heading", { name: "Preference check complete." }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/Booking and payment still need separate/),
  ).toBeVisible();
  expect(
    api.calls.every((c) =>
      ["session", "read", "mutate", "evaluate"].includes(c.operation),
    ),
  ).toBe(true);
  expect(api.state.entries.filter((e) => e.constraint)).toHaveLength(0);
  expect(api.evaluations).toHaveLength(1);
});

test("synthetic consumer genuine unavailability gets its own PAUSE, is not rejection and creates no cultural receipt", async ({
  page,
}) => {
  const api = await start(page, { unavailable: true });
  await checkButton(page).click();
  await expect(decision(page)).toContainText("I don’t know enough yet");
  await expect(decision(page)).toHaveAttribute("data-decision", "UNAVAILABLE");
  await expect(decision(page)).toContainText("Internal policy: UNAVAILABLE");
  await expect(decision(page)).toContainText("not the same as disliking");
  await expect(decision(page)).not.toContainText("Not this one");
  await expect(page.locator(".placeCard")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Find something that respects/ }),
  ).toHaveCount(0);
  expect(api.evaluations[0].cultural.status).toBe("unavailable");
  expect(api.calls.filter((c) => c.operation === "evaluate")).toHaveLength(1);
  expect(api.errors).toEqual([]);
});

test("synthetic consumer budget prevents unverifiable replacement without removing any rule", async ({
  page,
}) => {
  const api = await start(page);
  await boundaries(page);
  await page.getByRole("button", { name: "I have a $100 budget" }).click();
  await expect(page.getByLabel("Price in USD")).toBeVisible();
  // Step back to the choice (navigation only), then add the exclusion.
  await page.getByRole("button", { name: "← Back to the choice" }).click();
  await expect(page.locator(".placeContent h3")).toContainText("original");
  await boundaries(page);
  await page
    .getByRole("button", { name: "Never choose this place for me" })
    .click();
  await expect(decision(page)).toContainText("Not this one");
  const before = JSON.stringify(api.state);
  await page
    .getByRole("button", { name: "Find something that respects that →" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "I can’t verify another option within your budget yet.",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Your rule is still active. I won’t guess a price."),
  ).toBeVisible();
  expect(JSON.stringify(api.state)).toBe(before);
  expect(
    api.state.entries.some((e) => e.constraint?.kind === "MAX_PRICE"),
  ).toBe(true);
  expect(
    api.state.entries.some((e) => e.constraint?.kind === "EXCLUDE_CANDIDATE"),
  ).toBe(true);
  await expect(page.locator(".placeCard")).toHaveCount(0);
  // No replacement was proposed and none was evaluated.
  expect(api.evaluations).toHaveLength(2);
  expect(api.repair?.status).toBe("NO_VERIFIABLE_REPAIR");
});

test("synthetic consumer mobile keyboard, light/dark, reduced motion and long alternative labels", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const api = await start(page);
  const noOverflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    expect(await noOverflow()).toBe(true);
  }
  expect(
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector(".choiceStage")!).animationName,
    ),
  ).toBe("none");
  // The Boundary keeps its static, non-motion treatment under reduced motion.
  expect(
    await page.evaluate(() => {
      const t = getComputedStyle(document.querySelector(".boundary .bTaste")!);
      const i = getComputedStyle(document.querySelector(".cardBoundary i")!);
      return [t.transitionDuration, t.animationName, i.animationName];
    }),
  ).toEqual(["0s", "none", "none"]);
  await page.screenshot({
    path: ".tastebench/wgb-progressive/mobile-discover.png",
    fullPage: true,
  });
  await boundaries(page);
  const exclude = page.getByRole("button", {
    name: "Never choose this place for me",
  });
  await exclude.focus();
  await page.keyboard.press("Enter");
  await expect(decision(page)).toContainText("Not this one");
  await expect(
    page.getByRole("heading", { name: /Not this one/ }),
  ).toBeFocused();
  expect(await noOverflow()).toBe(true);
  await page.screenshot({
    path: ".tastebench/wgb-progressive/mobile-reject.png",
    fullPage: true,
  });
  // Keyboard-only: Tab to the single dominant action and activate it.
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Find something that respects that →" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".placeContent h3")).toContainText("alternative");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    expect(await noOverflow()).toBe(true);
  }
  await page.screenshot({
    path: ".tastebench/wgb-consumer-authorization/mobile-proposal.png",
    fullPage: true,
  });
  await checkButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(decision(page)).toContainText("This fits");
  expect(await noOverflow()).toBe(true);
  await page.screenshot({
    path: ".tastebench/wgb-progressive/mobile-allow.png",
    fullPage: true,
  });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Preference check complete." }),
  ).toBeVisible();
  expect(await noOverflow()).toBe(true);
  await page.screenshot({
    path: ".tastebench/wgb-progressive/mobile-handoff.png",
    fullPage: true,
  });
  expect(api.errors).toEqual([]);
});

test("synthetic consumer refuses a different saved profile without initialization or overwrite", async ({
  page,
}) => {
  const api = await start(page, { mismatched: true });
  await boundaries(page);
  await page.getByRole("button", { name: "I have a $100 budget" }).click();
  await expect(page.getByRole("status")).toContainText(
    "saved preferences are different",
  );
  expect(api.calls.filter((c) => c.operation === "mutate")).toHaveLength(0);
  expect(api.state.stateVersion).toBe(1);
});

test("synthetic consumer stale state fails closed and offers explicit refresh without retry", async ({
  page,
}) => {
  const api = await start(page, { stale: true });
  await boundaries(page);
  await page.getByRole("button", { name: "I have a $100 budget" }).click();
  await expect(page.getByRole("status")).toContainText("saved rules changed");
  expect(api.calls.filter((c) => c.operation === "evaluate")).toHaveLength(1);
  await expect(
    page.getByRole("button", { name: "Refresh my saved rules" }),
  ).toBeVisible();
});
