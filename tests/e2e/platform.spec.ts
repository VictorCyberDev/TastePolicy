import { test, expect, type Page } from "@playwright/test";
import { labelSynthetic } from "./synthetic-label";
import { entities } from "../qloo-fixtures";
// SYNTHETIC TEST DATA. Intercepted browser transport, never production auth/provider fallback.
const passportRef = "tp_" + "a".repeat(48),
  sharedRef = "tp_" + "b".repeat(48),
  evaluationRef = "tp_" + "c".repeat(48),
  grantId = entities[1].id;
async function fixture(page: Page, initialPassport = true) {
  let initialized = initialPassport,
    revoked = false,
    deleted = false,
    keyIssued = false,
    keyRevoked = false;
  let privacy: Record<string, unknown> = {
    mode: "MINIMAL",
    claims: {
      candidate_name: false,
      candidate_id: false,
      context_key: false,
      agent_id: false,
      policy: false,
    },
    required: ["decision", "permitted_actions"],
  };
  const calls: { op: string; body: Record<string, unknown> }[] = [],
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const p = () => ({
    subjectRef: "tps_" + "e".repeat(48),
    passportRef,
    displayLabel: "SYNTHETIC TEST DATA " + "Long-Label-".repeat(8),
    passportVersion: 1,
    visibility: "PRIVATE",
    stateVersion: 1,
    stateHash: "d".repeat(64),
    expiresAt: "2026-11-17T00:00:00Z",
  });
  const credential = () => ({
    credentialId: entities[2].id,
    displayLabel: "SYNTHETIC TEST DATA API",
    scopes: ["PASSPORT_READ", "TASTE_EVALUATE"],
    expiresAt: "2026-11-01T00:00:00Z",
    revoked: keyRevoked,
  });
  const grant = () => ({
    schemaVersion: "taste-passport-grant-v1",
    grantId,
    grantorUserId: entities[0].id,
    granteeUserId: entities[3].id,
    passportRef,
    scopes: ["READ_PASSPORT_SUMMARY", "EVALUATE_TASTE_ACTION"],
    purpose: "SYNTHETIC TEST DATA Agent",
    expiresAt: "2026-11-01T00:00:00Z",
    assurance: "AUTHENTICATED_GRANTOR_CONSENT",
    revoked,
  });
  await page.route("**/api/auth/**", (r) =>
    r.fulfill({ json: { status: "authenticated" } }),
  );
  await page.route("**/api/account/**", async (r) => {
    const op = r.request().url().split("/").at(-1)!,
      body = r.request().postDataJSON();
    calls.push({ op, body });
    let data: unknown;
    if (op === "inspect")
      data = {
        mode: "AUTHENTICATED_ACCOUNT",
        userId: entities[0].id,
        passport: initialized && !deleted ? p() : null,
        grants: calls.some((c) => c.op === "grant") ? [grant()] : [],
        credentials: keyIssued ? [credential()] : [],
      };
    else if (op === "create") {
      initialized = true;
      data = p();
    } else if (op === "grant") data = grant();
    else if (op === "revoke-grant") {
      revoked = true;
      data = { revoked: true };
    } else if (op === "create-key" || op === "rotate-key") {
      keyIssued = true;
      data = {
        credential: credential(),
        secret: "SYNTHETIC TEST DATA ONE-TIME SECRET",
      };
    } else if (op === "revoke-key") {
      keyRevoked = true;
      data = { revoked: true };
    } else if (op === "export")
      data = {
        schemaVersion: "taste-passport-export-v1",
        explicitUserState: [],
        providerDerived: { rawPayloadsIncluded: false },
        delegateAttestedProxyState: { included: false },
        groupAuthorizations: { included: false },
        semanticHash: "synthetic-not-live",
      };
    else if (op === "proof-privacy-get") data = privacy;
    else if (op === "proof-privacy-set") {
      privacy = { ...privacy, mode: body.mode, claims: body.claims };
      data = privacy;
    } else if (op === "passport") data = { ...p(), passportRef: sharedRef };
    else if (op === "evaluate" || op === "receipt") {
      if (revoked && body.grantId)
        return r.fulfill({
          status: 403,
          json: { status: "error", code: "GRANT_REVOKED" },
        });
      data = {
        schemaVersion: "taste-authorization-response-v1",
        evaluationRef,
        receiptRef: evaluationRef,
        decision: "ASK",
        decisionBasis: "UNRESOLVED_CONTEXT",
        continuation: {
          permitted: ["request_clarification"],
          automaticRetry: false,
        },
        ...(op === "receipt"
          ? {
              source: "recorded",
              authorizationEvidence: { cultural: { status: "unavailable" } },
            }
          : {}),
      };
    } else if (op === "delete-passport" || op === "delete-account") {
      deleted = true;
      data = { deleted: true };
    } else data = {};
    return r.fulfill({ json: { status: "available", data } });
  });
  await page.goto("/account");
  await labelSynthetic(page);
  async function signIn() {
    await page
      .getByLabel("Email", { exact: true })
      .fill("synthetic@example.test");
    await page
      .getByLabel("Password", { exact: true })
      .fill("synthetic-password-only");
    await page.getByRole("button", { name: "Sign in", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText("AUTHENTICATED ACCOUNT", { exact: true }),
    ).toBeVisible();
  }
  async function sharing() {
    await page.getByLabel("Grantee account identifier").fill(entities[3].id);
    await page
      .getByLabel("Purpose / client label")
      .fill("SYNTHETIC TEST DATA Agent");
    await page
      .getByLabel("Permission / credential expiry")
      .fill("2026-11-01T10:00");
    await page
      .getByRole("checkbox", { name: "READ_PASSPORT_SUMMARY", exact: true })
      .check();
    await page
      .getByRole("checkbox", { name: "EVALUATE_TASTE_ACTION", exact: true })
      .check();
    await page.getByRole("button", { name: "Create expiring share" }).click();
  }
  return { calls, errors, signIn, sharing };
}
test("account runtime without authentication configuration is explicitly unavailable", async ({
  page,
}) => {
  await page.goto("/account");
  await page
    .getByRole("button", { name: "Resume authenticated session" })
    .click();
  await expect(page.getByRole("status")).toContainText("not configured");
});
test("a malformed optional section cannot take the signed-in account page down", async ({
  page,
}) => {
  const f = await fixture(page);
  // Registered after the fixture's catch-all, so it takes precedence.
  await page.route("**/api/account/connected-agents", (r) =>
    r.fulfill({
      json: {
        status: "available",
        data: [{ familyId: "x", clientName: "Broken" }],
      },
    }),
  );
  await f.signIn();
  await expect(
    page.getByText("AUTHENTICATED ACCOUNT", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Connected assistants is unavailable right now."),
  ).toBeVisible();
  await expect(
    page.getByText("PRIVATE · never publicly discoverable"),
  ).toBeVisible();
});
test("synthetic authenticated sign-in and private Passport summary leak no raw state", async ({
  page,
}) => {
  const f = await fixture(page);
  await f.signIn();
  await expect(
    page.getByText("PRIVATE · never publicly discoverable"),
  ).toBeVisible();
  await expect(
    page.getByText("tps_" + "e".repeat(48), { exact: true }),
  ).toBeVisible();
  expect(f.calls.filter((c) => c.op === "evaluate")).toHaveLength(0);
  expect(f.errors).toEqual([]);
});
test("synthetic explicit five-anchor Passport creation is separate from demo claim", async ({
  page,
}) => {
  const f = await fixture(page, false);
  await f.signIn();
  await page
    .getByLabel("Passport label", { exact: true })
    .fill("SYNTHETIC TEST DATA Passport");
  for (let i = 0; i < 5; i++)
    await page
      .getByLabel(`Reviewed cultural anchor ID ${i + 1}`)
      .fill(entities[i].id);
  await page.getByRole("checkbox", { name: "I explicitly selected" }).check();
  await page
    .getByRole("button", { name: "Create private TastePolicy Passport" })
    .click();
  expect(f.calls.find((c) => c.op === "create")?.body).toMatchObject({
    identitiesReviewed: true,
    signalIds: entities.slice(0, 5).map((e) => e.id),
  });
  await expect(
    page.getByText("PRIVATE · never publicly discoverable"),
  ).toBeVisible();
});
test("synthetic share displays scope, expiry and authenticated grantor provenance, then revokes", async ({
  page,
}) => {
  const f = await fixture(page);
  await f.signIn();
  await f.sharing();
  await expect(
    page.getByText(
      /AUTHENTICATED_GRANTOR_CONSENT — no legally verified identity claim/,
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Revoke share SYNTHETIC TEST DATA Agent" })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Revoke share SYNTHETIC TEST DATA Agent",
    }),
  ).toBeDisabled();
});
test("synthetic shared evaluation returns ASK and captured receipt without execution authority", async ({
  page,
}) => {
  const f = await fixture(page);
  await f.signIn();
  await page.getByLabel("Shared Passport reference").fill(sharedRef);
  await page.getByLabel("Sharing grant ID").fill(grantId);
  await page
    .getByRole("button", { name: "Read shared Passport summary" })
    .click();
  await page.getByLabel("Candidate ID", { exact: true }).fill(entities[5].id);
  await page
    .getByLabel("Candidate display name")
    .fill("SYNTHETIC TEST DATA " + "candidate-".repeat(15));
  await page
    .getByRole("button", { name: "Evaluate taste action", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Cultural policy: ASK" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retrieve captured receipt" }).click();
  await expect(
    page.locator("pre").filter({ hasText: '"source": "recorded"' }),
  ).toBeVisible();
  expect(f.errors).toEqual([]);
});
test("synthetic one-time API secret is hidden and never recoverable through inspection", async ({
  page,
}) => {
  const f = await fixture(page);
  await f.signIn();
  await page
    .getByLabel("Credential label", { exact: true })
    .fill("SYNTHETIC TEST DATA API");
  await page
    .getByLabel("Permission / credential expiry")
    .fill("2026-11-01T10:00");
  await page
    .getByRole("checkbox", { name: "PASSPORT_READ", exact: true })
    .check();
  await page.getByRole("button", { name: "Create API credential" }).click();
  await expect(page.getByLabel("One-time API secret")).toContainText(
    "SYNTHETIC TEST DATA ONE-TIME SECRET",
  );
  await page.getByRole("button", { name: "Hide secret permanently" }).click();
  await expect(page.getByLabel("One-time API secret")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Revoke credential SYNTHETIC TEST DATA API" })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Revoke credential SYNTHETIC TEST DATA API",
    }),
  ).toBeDisabled();
});
test("synthetic export precedes explicit destructive account deletion", async ({
  page,
}) => {
  const f = await fixture(page);
  await f.signIn();
  await page
    .getByRole("button", { name: "Export Passport", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Download private export" }),
  ).toHaveAttribute("download", "taste-passport-export-v1.json");
  await expect(
    page.getByRole("button", { name: "Delete authenticated account" }),
  ).toBeDisabled();
  await page
    .getByLabel("Type DELETE PASSPORT or DELETE ACCOUNT")
    .fill("DELETE ACCOUNT");
  await page
    .getByRole("button", { name: "Delete authenticated account" })
    .click();
  await expect(page.getByRole("status")).toContainText("Account deleted");
  await expect(
    page.getByRole("link", { name: "Download private export" }),
  ).toHaveCount(0);
});
for (const colorScheme of ["light", "dark"] as const)
  test(`synthetic account mobile ${colorScheme}, keyboard and reduced motion`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const f = await fixture(page);
    await f.signIn();
    await f.sharing();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(f.errors).toEqual([]);
    await page.screenshot({
      path: `test-results/SYNTHETIC-M6-${colorScheme}-mobile.png`,
      fullPage: true,
    });
  });
test("proof privacy: shares nothing extra by default; each plain-language detail is a deliberate, reversible choice", async ({
  page,
}) => {
  const f = await fixture(page);
  await f.signIn();
  const name = page.getByRole("checkbox", {
    name: /May include the name of the choice/,
  });
  await expect(page.getByText("Proof privacy", { exact: true })).toBeVisible();
  await expect(name).not.toBeChecked();
  await name.click(); // saved on the server first, then reflected
  await expect(page.getByRole("status").last()).toContainText("Saved");
  const set = f.calls.filter((c) => c.op === "proof-privacy-set");
  expect(set).toHaveLength(1);
  expect(set[0].body).toMatchObject({
    mode: "MINIMAL",
    claims: { candidate_name: true, agent_id: false },
  });
  await expect(name).toBeChecked();
  await page.getByRole("button", { name: "Share nothing extra" }).click();
  await expect(name).not.toBeChecked();
  expect(f.errors).toEqual([]);
});
