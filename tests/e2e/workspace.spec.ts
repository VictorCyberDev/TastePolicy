import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("owner creates application namespaces, binds a key and keeps billing simulation separate", async ({
  page,
}) => {
  const workspaceId = "10000000-0000-4000-8000-000000000001",
    projectId = "10000000-0000-4000-8000-000000000002",
    environmentId = "10000000-0000-4000-8000-000000000003",
    agentId = "10000000-0000-4000-8000-000000000004",
    credentialId = "10000000-0000-4000-8000-000000000005";
  const state = {
    workspaces: [] as object[],
    projects: [] as object[],
    environments: [] as object[],
    agents: [] as Record<string, unknown>[],
    bindings: [] as object[],
    subscriptions: [] as Record<string, unknown>[],
    invoices: [] as object[],
    metrics: {
      windowDays: 30,
      outcomes: [
        { decision: "ALLOW", count: 2 },
        { decision: "ASK", count: 1 },
      ],
      captured: { total: 3, latest_receipt_at: "2026-10-28T12:00:00Z" },
      recordedLeases: [{ status: "SUSPENDED", count: 1 }],
      issuedProofs: 1,
      activePolicy: { version: 2, action_ceilings: null },
      leaseStatesRequireFreshVerification: true,
    },
  };
  await page.route("**/api/account/inspect", (route) =>
    route.fulfill({
      json: {
        status: "available",
        data: {
          userId: "synthetic-owner",
          passport: {
            passportRef: "tp_" + "a".repeat(48),
            displayLabel: "Synthetic Passport",
            stateVersion: 1,
            expiresAt: "2026-11-01T00:00:00Z",
          },
          credentials: [
            {
              credentialId,
              displayLabel: "Synthetic credential",
              revoked: false,
            },
          ],
        },
      },
    }),
  );
  const seen: string[] = [];
  await page.route("**/api/workspace/*", async (route) => {
    const op = route.request().url().split("/").at(-1)!,
      v = route.request().postDataJSON();
    seen.push(op);
    if (op === "create-workspace") {
      state.workspaces.push({ id: workspaceId, label: v.displayLabel });
      state.subscriptions.push({
        workspace_id: workspaceId,
        mode: "LIVE",
        plan: "FREE",
        state: "ACTIVE",
        provider: "NONE",
      });
    }
    if (op === "create-project") {
      expect(v.workspaceId).toBe(workspaceId);
      state.projects.push({
        id: projectId,
        label: v.displayLabel,
        workspace_id: workspaceId,
      });
    }
    if (op === "create-environment") {
      expect(v.projectId).toBe(projectId);
      state.environments.push({
        id: environmentId,
        label: v.displayLabel,
        project_id: projectId,
        kind: v.kind,
      });
    }
    if (op === "register-agent") {
      expect(v.environmentId).toBe(environmentId);
      state.agents.push({
        id: agentId,
        label: v.displayLabel,
        external_id: v.externalId,
        environment_id: environmentId,
        revoked_at: null,
      });
    }
    if (op === "bind-credential") {
      expect(v.credentialId).toBe(credentialId);
      expect(v.agentId).toBe(agentId);
      expect(v.environmentId).toBe(environmentId);
      state.bindings.push({
        credential_id: credentialId,
        environment_id: environmentId,
      });
    }
    if (op === "sandbox-upgrade") {
      expect(v.confirmation).toBe("SIMULATE ONLY");
      state.subscriptions.push({
        workspace_id: workspaceId,
        mode: "SANDBOX",
        plan: "PRO",
        state: "ACTIVE",
        provider: "INTERNAL_SANDBOX",
      });
      state.invoices.push({
        event_id: "sim_test",
        mode: "SANDBOX",
        kind: "SIMULATED_INVOICE_PAID",
        amount_minor: 4900,
        currency: "usd",
      });
    }
    if (op === "revoke-agent") {
      expect(v.agentId).toBe(agentId);
      state.agents[0].revoked_at = "2026-10-28T12:05:00Z";
    }
    await route.fulfill({
      json: { status: "available", data: op === "inspect" ? state : {} },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await expect(page.getByText("33.3% of 3 captured decisions")).toBeVisible();
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Project workspace", exact: true })
    .selectOption(workspaceId);
  await page
    .getByRole("button", { name: "Create application", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Environment project", exact: true })
    .selectOption(projectId);
  await page
    .getByRole("button", { name: "Create environment", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Agent environment", exact: true })
    .selectOption(environmentId);
  await page
    .getByRole("button", { name: "Register agent", exact: true })
    .click();
  await page
    .getByRole("combobox", {
      name: "Existing developer credential",
      exact: true,
    })
    .selectOption(credentialId);
  await page
    .getByRole("combobox", { name: "Credential agent", exact: true })
    .selectOption(agentId);
  await page
    .getByRole("button", { name: "Attach credential", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Simulate Pro invoice and entitlement",
      exact: true,
    })
    .click();
  await expect(page.getByText(/LIVE · FREE · ACTIVE · NONE/)).toBeVisible();
  await expect(
    page.getByText(/SANDBOX · SIMULATED_INVOICE_PAID · USD49.00 · no charge/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Revoke My assistant authority", exact: true })
    .click();
  await expect(page.locator(".workspace-control [role=status]")).toContainText(
    "Agent authority revoked across your Passport",
  );
  await expect(
    page.getByRole("button", {
      name: "Revoke My assistant authority",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(seen).toEqual(
    expect.arrayContaining([
      "create-workspace",
      "create-project",
      "create-environment",
      "register-agent",
      "bind-credential",
      "sandbox-upgrade",
      "revoke-agent",
    ]),
  );
});
