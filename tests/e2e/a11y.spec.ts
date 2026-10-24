import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
// SYNTHETIC TEST DATA. Automated WCAG 2.1 A/AA scan of the M7-M9 pages with intercepted transport. Automated
// scanning finds a subset of issues; keyboard, focus, reduced-motion and mobile-overflow checks live in the
// page specs, and nothing here replaces a human review.
const passportRef = "tp_" + "a".repeat(48),
  lease = (ref: string, status: string) => ({
    leaseRef: ref,
    status,
    valid: status === "ACTIVE",
    reasons: status === "SUSPENDED" ? ["POLICY_CHANGED"] : [],
    agentId: "Agent-A",
    candidateName: "SYNTHETIC TEST DATA Cafe",
    contextKey: "dinner",
    expiresAt: "2026-10-24T13:00:00.000Z",
    checkpointDueAt: "2026-10-24T12:05:00.000Z",
  });
async function intercept(page: Page) {
  await page.route("**/api/account/**", async (r) => {
    const op = r.request().url().split("/").at(-1)!;
    const data: Record<string, unknown> = {
      inspect: { passport: { passportRef } },
      "policy-get": {
        passportRef,
        history: [],
        suggestions: [],
        overrides: [
          {
            overrideId: "0b1f2f68-6c0a-4b34-8a38-2f0f6a51a111",
            effect: "ALLOW_THROUGH_ASK",
            scope: { domain: "place" },
            createdAt: "2026-10-24T00:00:00.000Z",
            expiresAt: "2026-10-31T00:00:00.000Z",
            status: "ACTIVE",
          },
        ],
        active: {
          version: 1,
          createdAt: "2026-10-24T00:00:00.000Z",
          note: null,
          document: {
            schemaVersion: "taste-policy-v1",
            freshness: { EXPLICIT_POSITIVE: 90 },
            autonomy: {
              default: "CONFIRM_ABOVE_LIMIT",
              byDomain: { place: "OBSERVE" },
              byAgent: { "Agent-A": "AUTONOMOUS" },
              limit: { amount: 100, currency: "USD" },
            },
          },
        },
      },
      "lease-list": {
        passportRef,
        pending: [lease("tl_" + "b".repeat(48), "ASK_PENDING")],
        leases: [
          lease("tl_" + "b".repeat(48), "ASK_PENDING"),
          lease("tl_" + "c".repeat(48), "SUSPENDED"),
        ],
        attestations: [
          {
            ref: "abcd1234",
            audience: "https://merchant.test",
            issuedAt: "2026-10-24T12:00:00.000Z",
            expiresAt: "2026-10-24T12:10:00.000Z",
            holderBound: true,
            delegatedTo: "Agent-B",
          },
        ],
        timeline: [
          {
            leaseRef: "tl_" + "c".repeat(48),
            seq: 2,
            kind: "DRIFT",
            at: "2026-10-24T12:02:00.000Z",
            actor: "SYSTEM",
            reasons: ["POLICY_CHANGED"],
          },
        ],
      },
      "policy-explain": {
        evaluationRef: "tp_" + "d".repeat(48),
        base: { outcome: "ALLOW", basis: "CULTURAL_POLICY", rules: [] },
        final: {
          outcome: "ASK",
          basis: "AUTONOMY_CEILING",
          rules: ["AUTONOMY:OBSERVE"],
          baseOutcome: "ALLOW",
          policyVersion: 1,
          trace: [
            { step: "BASE", action: "KEPT", outcome: "ALLOW" },
            { step: "AUTONOMY", action: "LOWERED", outcome: "ASK" },
          ],
        },
        counterfactuals: [
          {
            change: "RAISE_AUTONOMY",
            detail: "Let this agent act without asking",
            resultOutcome: "ALLOW",
          },
        ],
      },
    };
    await r.fulfill({ json: { status: "available", data: data[op] ?? {} } });
  });
  await page.route("**/api/attest/verify", (r) =>
    r.fulfill({
      json: {
        status: "available",
        data: {
          valid: true,
          reasons: [],
          dryRun: true,
          claims: { decision: "ALLOW", exp: 1800000000 },
        },
      },
    }),
  );
}
const pages: [string, string][] = [
  ["/account/rules", "Your rules"],
  ["/account/inspector", "Why was this the answer?"],
  ["/account/leases", "What agents may do now"],
  ["/verify", "Check a TastePolicy proof"],
];
for (const colorScheme of ["light", "dark"] as const)
  for (const [path, heading] of pages)
    test(`axe: ${path} (${colorScheme}) has no WCAG 2.1 A/AA violations`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await intercept(page);
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      if (path === "/account/inspector") {
        await page
          .getByLabel("Evaluation reference")
          .fill("tp_" + "d".repeat(48));
        await page.getByRole("button", { name: "Explain" }).click();
        await expect(page.getByText("What would change it")).toBeVisible();
      }
      if (path === "/verify") {
        await page.getByLabel("Proof", { exact: true }).fill("x~");
        await page.getByLabel(/Your address/).fill("https://merchant.test");
        await page.getByRole("button", { name: "Check proof" }).click();
        await expect(
          page.getByRole("heading", { name: "Valid" }),
        ).toBeVisible();
      }
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
        })),
      ).toEqual([]);
    });
