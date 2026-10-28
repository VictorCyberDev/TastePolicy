import { test, expect, type Page } from "@playwright/test";
import { labelSynthetic } from "./synthetic-label";
// SYNTHETIC TEST DATA. Intercepted browser transport only; lease behaviour itself is covered by the state-machine
// and database tests.
const passportRef = "tp_" + "a".repeat(48),
  ask = "tl_" + "b".repeat(48),
  live = "tl_" + "c".repeat(48);
const lease = (ref: string, status: string, extra: object = {}) => ({
  leaseRef: ref,
  status,
  valid: status === "ACTIVE",
  reasons: [],
  agentId: "Agent-A",
  candidateName: "SYNTHETIC TEST DATA Cafe",
  contextKey: "dinner",
  ask: null,
  expiresAt: "2026-10-24T13:00:00.000Z",
  checkpointDueAt: "2026-10-24T12:05:00.000Z",
  ...extra,
});
const confirmation = {
  ask: {
    kind: "AUTHORITY_CONFIRMATION",
    question: "Your rule says to ask you before your agent continues.",
  },
};
async function fixture(page: Page, pendingAsk: object = confirmation) {
  let pending = true,
    liveStatus = "ACTIVE";
  const calls: { op: string; body: Record<string, unknown> }[] = [],
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/account/**", async (r) => {
    const op = r.request().url().split("/").at(-1)!,
      body = r.request().postDataJSON();
    calls.push({ op, body });
    let data: unknown = {};
    if (op === "inspect") data = { passport: { passportRef } };
    else if (op === "lease-list")
      data = {
        passportRef,
        pending: pending ? [lease(ask, "ASK_PENDING", pendingAsk)] : [],
        leases: [
          ...(pending ? [lease(ask, "ASK_PENDING", pendingAsk)] : []),
          lease(
            live,
            liveStatus,
            liveStatus === "SUSPENDED" ? { reasons: ["POLICY_CHANGED"] } : {},
          ),
        ],
        timeline: [
          {
            leaseRef: live,
            seq: 2,
            kind: "DRIFT",
            at: "2026-10-24T12:02:00.000Z",
            actor: "SYSTEM",
            reasons: ["POLICY_CHANGED"],
          },
          {
            leaseRef: live,
            seq: 1,
            kind: "ISSUED",
            at: "2026-10-24T12:00:00.000Z",
            actor: "AGENT",
          },
        ],
      };
    else if (op === "lease-approve") {
      pending = false;
      data = lease(ask, "ACTIVE");
    } else if (op === "lease-decline") {
      pending = false;
      data = lease(ask, "DECLINED");
    } else if (op === "lease-revoke") {
      liveStatus = "REVOKED";
      pending = false;
      data = { revoked: 1 };
    }
    return r.fulfill({ json: { status: "available", data } });
  });
  await page.goto("/account/leases");
  await labelSynthetic(page);
  return { calls, errors, setSuspended: () => (liveStatus = "SUSPENDED") };
}
test("an agent's question is answered in plain language and the answer carries a bounded duration", async ({
  page,
}) => {
  const f = await fixture(page);
  await expect(
    page.getByRole("heading", { name: "What agents may do now" }),
  ).toBeVisible();
  await expect(page.getByText(/wants to go ahead with/)).toContainText(
    "SYNTHETIC TEST DATA Cafe",
  );
  await expect(
    page.getByText(/never lets an agent buy, book or pay/),
  ).toBeVisible();
  await page.getByLabel("Allow for").selectOption("60");
  await page.getByRole("button", { name: "Allow this once" }).click();
  await expect(page.getByRole("status").first()).toContainText("Allowed once");
  const body = f.calls.find((c) => c.op === "lease-approve")!.body;
  expect(body.ttlSeconds).toBe(3600);
  expect(body.confirm).toBe(true);
  expect(body.leaseRef).toBe(ask);
  expect(typeof body.idempotencyKey).toBe("string");
  expect(f.errors).toEqual([]);
});
test("a missing fact is never offered as a yes: it shows the exact question and no approve control", async ({
  page,
}) => {
  const f = await fixture(page, {
    ask: { kind: "CLARIFICATION_REQUIRED", question: "What is the price?" },
  });
  await expect(
    page.getByText("TastePolicy needs one fact before it can decide."),
  ).toBeVisible();
  await expect(page.getByText("What is the price?")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /allow|approve|yes/i }),
  ).toHaveCount(0);
  expect(f.calls.some((c) => c.op === "lease-approve")).toBe(false);
  await expect(page.getByText(/Your rule says to ask you/)).toHaveCount(0);
});
test("declining, ending one permission and stopping everything call the owner operations", async ({
  page,
}) => {
  const f = await fixture(page);
  await page
    .getByRole("button", { name: "Not this time", exact: true })
    .click();
  await expect(page.getByRole("status").first()).toContainText("Declined");
  await page.getByRole("button", { name: "End now" }).click();
  expect(
    f.calls.some((c) => c.op === "lease-revoke" && c.body.leaseRef === live),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Stop all agents" }),
  ).toBeDisabled();
});
test("a paused permission says why, and the log explains what happened", async ({
  page,
}) => {
  const f = await fixture(page);
  f.setSuspended();
  await page.reload();
  await labelSynthetic(page);
  await expect(
    page.getByText("Paused: needs a fresh check").first(),
  ).toBeVisible();
  await expect(page.getByText(/because your rules changed/)).toBeVisible();
  await expect(page.getByText(/Paused/).last()).toBeVisible();
  await expect(page.getByText("Agent asked")).toBeVisible();
});
for (const colorScheme of ["light", "dark"] as const)
  test(`leases page ${colorScheme} mobile: no horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await fixture(page);
    await expect(
      page.getByRole("heading", { name: "What agents may do now" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/SYNTHETIC-M8-leases-${colorScheme}-mobile.png`,
      fullPage: true,
    });
  });
