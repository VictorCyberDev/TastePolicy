/* eslint-disable @typescript-eslint/no-explicit-any -- test assertions over loosely typed JSON responses */
import { test, expect, type Page } from "@playwright/test";
import { labelSynthetic } from "./synthetic-label";
// SYNTHETIC TEST DATA. Intercepted browser transport only; the policy logic itself is covered by the
// engine and database tests. These cases check that the control plane is usable and truthful.
const passportRef = "tp_" + "a".repeat(48),
  evaluationRef = "tp_" + "c".repeat(48),
  overrideId = "0b1f2f68-6c0a-4b34-8a38-2f0f6a51a111";
type Doc = Record<string, unknown>;
async function fixture(page: Page) {
  let active: { version: number; document: Doc } | null = null;
  let override: Record<string, unknown> | null = null;
  const calls: { op: string; body: Record<string, any> }[] = [],
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/account/**", async (r) => {
    const op = r.request().url().split("/").at(-1)!,
      body = r.request().postDataJSON();
    calls.push({ op, body });
    let data: unknown = {};
    if (op === "inspect")
      data = { mode: "AUTHENTICATED_ACCOUNT", passport: { passportRef } };
    else if (op === "policy-get")
      data = {
        passportRef,
        active: active && {
          ...active,
          createdAt: "2026-10-24T00:00:00.000Z",
          note: null,
        },
        history: active
          ? [{ ...active, createdAt: "2026-10-24T00:00:00.000Z", note: null }]
          : [],
        overrides: override ? [override] : [],
        suggestions: [],
      };
    else if (op === "policy-impact")
      data = { total: 12, changed: 5, transitions: { "ALLOW->ASK": 5 } };
    else if (op === "policy-publish") {
      active = { version: (active?.version ?? 0) + 1, document: body.document };
      data = active;
    } else if (op === "override-create") {
      override = {
        overrideId,
        effect: body.effect,
        scope: body.scope,
        createdAt: "2026-10-24T00:00:00.000Z",
        expiresAt: "2026-10-31T00:00:00.000Z",
        status: "ACTIVE",
      };
      data = override;
    } else if (op === "override-revoke") {
      override = { ...override!, status: "REVOKED" };
      data = { status: "REVOKED" };
    } else if (op === "policy-explain")
      data = {
        evaluationRef,
        base: { outcome: "ALLOW", basis: "CULTURAL_POLICY", rules: [] },
        final: {
          outcome: "ASK",
          basis: "AUTONOMY_CEILING",
          rules: ["AUTONOMY:OBSERVE"],
          baseOutcome: "ALLOW",
          policyVersion: 1,
          trace: [
            { step: "BASE", action: "KEPT", outcome: "ALLOW" },
            { step: "FRESHNESS", action: "KEPT", outcome: "ALLOW" },
            {
              step: "AUTONOMY",
              action: "LOWERED",
              outcome: "ASK",
              rules: ["AUTONOMY:OBSERVE"],
            },
          ],
        },
        counterfactuals: [
          {
            change: "RAISE_AUTONOMY",
            detail: "Let this agent act without asking",
            resultOutcome: "ALLOW",
          },
        ],
      };
    return r.fulfill({ json: { status: "available", data } });
  });
  await page.goto("/account/rules");
  await labelSynthetic(page);
  return { calls, errors };
}
test("rules: choose a setting, preview, publish; the stored document matches the choice", async ({
  page,
}) => {
  const f = await fixture(page);
  await expect(page.getByRole("heading", { name: "Your rules" })).toBeVisible();
  await page.getByRole("radio", { name: /Ask me every time/ }).check();
  await page
    .getByRole("checkbox", { name: /Things you said you like/ })
    .check();
  await page.getByRole("button", { name: "Preview what would change" }).click();
  await expect(
    page.getByText(/5 of your last 12 checks would have changed/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish these rules" }).click();
  await expect(page.getByRole("status").first()).toContainText("Published");
  const pub = f.calls.find((c) => c.op === "policy-publish")!;
  expect(pub.body.expectedVersion).toBe(0);
  expect(pub.body.document.autonomy.default).toBe("OBSERVE");
  expect(pub.body.document.freshness.EXPLICIT_POSITIVE).toBe(180);
  expect(typeof pub.body.idempotencyKey).toBe("string");
  expect(f.errors).toEqual([]);
});
test("a spending limit appears only for the limit setting and is sent with the document", async ({
  page,
}) => {
  const f = await fixture(page);
  await expect(page.getByLabel("Spending limit")).toHaveCount(0);
  await page.getByRole("radio", { name: /Ask me above a limit/ }).check();
  await page.getByLabel("Spending limit").fill("150");
  await page.getByRole("button", { name: "Publish these rules" }).click();
  await expect(page.getByRole("status").first()).toContainText("Published");
  expect(
    f.calls.find((c) => c.op === "policy-publish")!.body.document.autonomy
      .limit,
  ).toEqual({ amount: 150, currency: "USD" });
});
test("temporary permission: broad cultural override needs confirmation and an exact choice; ending it works", async ({
  page,
}) => {
  const f = await fixture(page);
  await page
    .getByLabel("What it does")
    .selectOption("ALLOW_THROUGH_CULTURAL_REJECT");
  const add = page.getByRole("button", { name: "Add temporary permission" });
  await expect(add).toBeDisabled();
  await page.getByLabel("Applies to").selectOption("candidate");
  await page.getByLabel("Id or key").fill("candidate-1");
  await expect(add).toBeDisabled();
  await page.getByRole("checkbox", { name: /I understand/ }).check();
  await expect(add).toBeEnabled();
  await add.click();
  await expect(page.getByText(/until/)).toBeVisible();
  const body = f.calls.find((c) => c.op === "override-create")!.body;
  expect(body.scope).toEqual({ candidateId: "candidate-1" });
  expect(body.confirmCulturalReject).toBe(true);
  await page.getByRole("button", { name: "End now" }).click();
  await expect(page.getByText("revoked")).toBeVisible();
});
test("inspector explains each step and offers only verified changes", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.goto("/account/inspector");
  await expect(page.getByRole("button", { name: "Explain" })).toBeDisabled();
  await page.getByLabel("Evaluation reference").fill(evaluationRef);
  await page.getByRole("button", { name: "Explain" }).click();
  await expect(
    page.getByText("Your autonomy setting asks first."),
  ).toBeVisible();
  await expect(page.getByText(/Autonomy setting/)).toBeVisible();
  await expect(
    page.getByText("Let this agent decide without asking"),
  ).toBeVisible();
  expect(f.calls.some((c) => c.op === "policy-explain")).toBe(true);
});
for (const colorScheme of ["light", "dark"] as const)
  test(`rules page ${colorScheme} mobile: no horizontal overflow, keyboard reachable`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await fixture(page);
    await expect(
      page.getByRole("heading", { name: "Your rules" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(["A", "INPUT", "BUTTON", "SUMMARY"]).toContain(focused);
    await page.screenshot({
      path: `test-results/SYNTHETIC-M7-rules-${colorScheme}-mobile.png`,
      fullPage: true,
    });
  });
