import { test, expect, type Page } from "@playwright/test";
import { labelSynthetic } from "./synthetic-label";
import { syntheticReceipt } from "../receipt-presentation-fixture";
import { entities } from "../qloo-fixtures";
async function setup(page: Page, outcome = "ALLOW") {
  const r = syntheticReceipt(
    outcome === "ASK" ? 0.7 : outcome === "REJECT" ? 0.2 : 0.9,
  );
  const candidate = {
    ...r.candidate,
    name: "SYNTHETIC TEST DATA place",
    type: "place" as const,
  };
  r.candidate = candidate;
  r.action.targetEntity = candidate;
  let version = 0,
    entries: unknown[] = [],
    decision = outcome;
  const ops: string[] = [];
  const state = () => ({
    stateVersion: version,
    stateHash: "synthetic-hash",
    entries,
  });
  const evaluation = () => ({
    schemaVersion: "taste-state-evaluation-v1",
    evaluationId: entities[0].id,
    profileId: entities[1].id,
    stateVersion: version,
    stateHash: "synthetic-hash",
    agentId: "Arena-Concierge",
    action: { kind: "SELECT_ENTITY", candidate },
    context: { key: "arena_dinner", domain: "place" },
    decision: {
      outcome: decision,
      basis:
        decision === "ASK"
          ? "UNRESOLVED_CONTEXT"
          : decision === "REJECT"
            ? "USER_HARD_BLOCK"
            : "CULTURAL_POLICY",
      rules: ["SYNTHETIC TEST DATA"],
    },
    cultural: { status: "available", data: r },
    source: "live",
    requestId: entities[2].id,
    evaluatedAt: r.evaluatedAt,
  });
  await page.route("**/api/demo/**", (route) => {
    const op = route.request().url().split("/").at(-1)!;
    ops.push(op);
    return route.fulfill({
      json:
        op === "evaluate" && outcome === "UNAVAILABLE"
          ? { status: "unavailable", reason: "timeout" }
          : {
              status: "available",
              data:
                op === "resolve"
                  ? entities.slice(0, 5).map((e) => ({
                      status: "available",
                      data: { state: "single", matches: [e] },
                    }))
                  : op === "discover"
                    ? {
                        candidates: [{ entity: candidate, rank: 1 }],
                        provenance: r.qlooEvidence.provenance,
                      }
                    : r,
            },
    });
  });
  await page.route("**/api/state/**", (route) => {
    const op = route.request().url().split("/").at(-1)!,
      body = route.request().postDataJSON();
    ops.push(op);
    let data: unknown = {};
    if (op === "read") data = { state: state() };
    if (op === "mutate") {
      version++;
      if (body.payload.kind === "INITIALIZE")
        entries = r.inputSignals.map((e) => ({
          kind: "EXPLICIT_LIKE",
          entity: e,
        }));
      else if (body.payload.kind === "FEEDBACK") {
        decision =
          body.payload.feedback.category === "SPECIFIC_DISLIKE"
            ? "REJECT"
            : "ASK";
        entries.push({
          signalId: entities[3].id,
          kind: "CONSTRAINT",
          scope: "CONTEXT",
          constraint: { kind: "MAX_PRICE" },
        });
      }
      data = { state: state() };
    }
    if (op === "evaluate") data = evaluation();
    if (op === "plan")
      data = {
        status: "ACTIONABLE",
        planId: "synthetic-plan",
        stateVersion: version,
        factor: {
          kind: "PRICE_REQUIRED",
          question: "Provide candidate price in USD.",
          currency: "USD",
          answerSchema: "MONEY_OR_UNKNOWN",
          policyEffect: "SYNTHETIC TEST DATA",
        },
      };
    if (op === "answer")
      data = {
        interactionId: "synthetic-answer",
        originalEvaluation: evaluation(),
        stateVersion: version,
        finalDecision: { outcome: "ALLOW", basis: "CULTURAL_PLUS_CONTEXT" },
        evidenceSource: "captured",
      };
    if (op === "repair")
      data = {
        status: "NO_VERIFIED_REPAIR_WITHIN_BOUND",
        reason: "SYNTHETIC no replacement",
        method: { providerCalls: 1, maxProviderCalls: 4, maxCandidates: 1 },
        originalEvaluation: evaluation(),
        changeSet: [],
        preservedConstraints: [],
      };
    return route.fulfill({ json: { status: "available", data } });
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/arena");
  await labelSynthetic(page);
  expect(ops).toHaveLength(0);
  await page.getByRole("button", { name: "Resolve live identities" }).click();
  for (let i = 0; i < 5; i++)
    await page
      .getByLabel(
        `Identity for ${["Nils Frahm", "Perfect Days", "Muji", "Piranesi", "Severance"][i]}`,
      )
      .selectOption(entities[i].id);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Discover real Qloo places" }).click();
  await page.getByLabel("Agent's proposed place").selectOption(candidate.id);
  await page
    .getByRole("button", { name: "Evaluate candidate with Qloo" })
    .click();
  return { ops, errors };
}
for (const outcome of ["ALLOW", "ASK", "REJECT", "UNAVAILABLE"])
  test(`Arena synthetic ${outcome} evidence, authority and source labels`, async ({
    page,
  }) => {
    const f = await setup(page, outcome);
    await expect(
      page
        .getByRole("region", { name: "Preference authorization" })
        .getByRole("heading", { level: 2 }),
    ).toContainText(outcome);
    await expect(
      page.getByText("Qloo contributed", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("TastePolicy contributed", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Not granted:/)).toBeVisible();
    if (outcome !== "UNAVAILABLE") {
      await expect(
        page.getByText("Affinity ", { exact: false }).first(),
      ).toBeVisible();
      await expect(
        page.getByText("SYNTHETIC TEST DATA", { exact: true }).first(),
      ).toBeVisible();
    } else
      await expect(
        page.getByText("Required cultural evidence could not be established."),
      ).toBeVisible();
    expect(f.errors).toEqual([]);
  });
test("Arena same proposal uses explicit state, ASK clarification and hard exclusion without stale ALLOW", async ({
  page,
}) => {
  const f = await setup(page);
  await page
    .getByRole("button", { name: "Save these signals to temporary SELF state" })
    .click();
  await page
    .getByRole("button", { name: "Set dinner budget: USD 100" })
    .click();
  await expect(
    page.getByRole("region", { name: "Preference authorization" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Evaluate under current state" })
    .click();
  await expect(
    page.getByRole("region", { name: "Preference authorization" }),
  ).toContainText("ASK");
  await page.getByRole("button", { name: "Ask one clarification" }).click();
  await page
    .getByRole("spinbutton", { name: "Candidate price in USD", exact: true })
    .fill("40");
  await page
    .getByRole("button", { name: "Apply price to this interaction" })
    .click();
  await expect(
    page.getByRole("region", { name: "Interactive result" }),
  ).toContainText("ALLOW");
  await expect(
    page.getByRole("region", { name: "Preference authorization" }),
  ).toContainText("CAPTURED CLARIFICATION");
  await page
    .getByRole("button", { name: "Do not select this candidate for me" })
    .click();
  await page
    .getByRole("button", { name: "Evaluate under current state" })
    .click();
  await expect(
    page.getByRole("region", { name: "Preference authorization" }),
  ).toContainText("REJECT");
  await page
    .getByRole("button", { name: "Request minimal candidate repair" })
    .click();
  await expect(
    page.getByRole("region", { name: "Repair result" }),
  ).toContainText("NO VERIFIED REPAIR WITHIN BOUND");
  await expect(
    page.getByRole("button", { name: "Evaluate repaired proposal" }),
  ).toHaveCount(0);
  expect(f.ops).toContain("answer");
  expect(f.errors).toEqual([]);
});
for (const colorScheme of ["light", "dark"] as const)
  test(`Arena mobile ${colorScheme}, keyboard, fault and recorded boundaries`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto("/arena");
    await page
      .getByText("Failure handling rehearsal — explicit demo fault injection")
      .click();
    const button = page.getByRole("button", {
      name: "Inject unavailable evidence rehearsal",
    });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText("DEMO FAULT INJECTION — CULTURAL EVIDENCE UNAVAILABLE", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByText("Recorded live acceptance — historical, not a live fallback")
      .click();
    await expect(
      page.getByText(/RECORDED LIVE ACCEPTANCE · 2026/),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: `test-results/WG-${colorScheme}-unconfigured-rehearsal.png`,
      fullPage: true,
    });
  });
test("annotation packet is optional, local-only and blinded", async ({
  page,
}) => {
  let posts = 0;
  page.on("request", (r) => {
    if (r.method() === "POST") posts++;
  });
  await page.goto("/annotate");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Open independent annotation packet" })
    .click();
  await expect(page.getByRole("group", { name: /^Situation/ })).toHaveCount(18);
  await expect(
    page.getByRole("button", { name: "Download anonymous responses" }),
  ).toBeDisabled();
  await expect(
    page.getByText(/Qloo score|allowAbove|FULL_TASTEPOLICY/),
  ).toHaveCount(0);
  expect(posts).toBe(0);
});

test("v2 annotation exposes material evidence before five choices on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/annotate");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Open independent annotation packet" })
    .click();
  const cases = page.getByRole("group", { name: /^Situation/ });
  await expect(cases).toHaveCount(18);
  for (const c of await cases.all()) {
    await expect(c.getByRole("radio")).toHaveCount(5);
    await expect(
      c.getByText(
        /Independent cultural relationship evidence for this proposed option:|Required independent cultural relationship evidence is unavailable/,
      ),
    ).toBeVisible();
    await expect(c.locator("details")).toHaveCount(0);
  }
  await expect(
    page.getByText(/0.65 on a 0–1 affinity scale/).first(),
  ).toBeVisible();
  await expect(
    page.getByText(/0.2 on a 0–1 affinity scale/).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
});
