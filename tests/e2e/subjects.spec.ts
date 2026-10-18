import { test, expect, type Page } from "@playwright/test";
import { entities } from "../qloo-fixtures";
import { labelSynthetic } from "./synthetic-label";
// SYNTHETIC TEST DATA: intercepted HTTP responses, never production fixtures.
const owner = entities[0].id,
  sid = "20000000-0000-4000-8000-000000000001",
  gid = "20000000-0000-4000-8000-000000000002",
  aid = "20000000-0000-4000-8000-000000000003";
async function fixture(page: Page, decision = "REJECT", failure = "") {
  let created = false,
    revoked = false,
    version = 1;
  const calls: string[] = [],
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const state = (proxy = false) => ({
    profileId: proxy ? sid : owner,
    stateVersion: 1,
    stateHash: "a".repeat(64),
    entries: entities.slice(0, 5).map((entity) => ({
      signalId: entity.id,
      kind: "EXPLICIT_LIKE",
      entity,
      scope: "GLOBAL_PREFERENCE",
      persistence: "DURABLE",
      source: "USER",
    })),
  });
  const selfEvaluation = {
    schemaVersion: "taste-state-evaluation-v1",
    evaluationId: entities[1].id,
    profileId: owner,
    stateVersion: 1,
    stateHash: "a".repeat(64),
    action: {
      kind: "SELECT_ENTITY",
      candidate: {
        ...entities[5],
        name: "SYNTHETIC TEST DATA candidate " + "long-name-".repeat(12),
      },
    },
    context: { key: "demo", domain: "destination" },
    decision: { outcome: "ALLOW", basis: "CULTURAL_POLICY", rules: [] },
    cultural: { status: "unavailable", reason: "no_evidence" },
    culturalRequest: "REQUESTED",
    agentId: "SELF",
    evaluatedAt: "2026-10-18T12:00:00Z",
    source: "recorded",
  };
  const proxyEvaluation = {
    schemaVersion: "proxy-authorization-v1",
    authorizationId: aid,
    subjectId: sid,
    stateVersion: 1,
    baseEvaluation: {
      ...selfEvaluation,
      evaluationId: aid,
      profileId: sid,
      decision: { outcome: decision, basis: "CULTURAL_POLICY", rules: [] },
    },
    authorityBoundary: "Cultural authorization only. No execution authority.",
    permissionAssurance: "USER_ATTESTED_PERMISSION",
  };
  const subject = (proxy = false) => ({
    subject: {
      ownerProfileId: owner,
      subjectId: proxy ? sid : owner,
      subjectKind: proxy ? "PROXY" : "SELF",
      stateProfileId: proxy ? sid : owner,
      displayLabel: proxy ? "SYNTHETIC TEST DATA " + "Alex-".repeat(8) : "You",
      expiresAt: "2026-10-19T00:00:00Z",
    },
    state: state(proxy),
    deleted: false,
    permissionActive: !proxy || (!revoked && failure !== "PERMISSION_INACTIVE"),
    permission: proxy
      ? {
          scopes: ["MODEL_MANAGEMENT", "TASTE_EVALUATION", "GROUP_EVALUATION"],
          expiresAt: "2026-10-19T00:00:00Z",
        }
      : null,
  });
  const group = () => ({
    group: {
      groupId: gid,
      displayLabel: "SYNTHETIC TEST DATA Trip",
      currentVersion: version,
    },
    version: {
      groupVersion: version,
      policyId: "UNANIMOUS_NO_VETO_V1",
      memberSubjectIds: [owner, sid],
    },
    closed: false,
  });
  const envelope = () => ({
    schemaVersion: "group-authorization-v1",
    authorizationId: gid,
    groupId: gid,
    groupVersion: version,
    aggregateDecision: decision,
    aggregateBasis:
      decision === "REJECT"
        ? "MEMBER_REJECT"
        : decision === "UNAVAILABLE"
          ? "MEMBER_EVIDENCE_UNAVAILABLE"
          : decision === "ASK"
            ? "MEMBER_CLARIFICATION_REQUIRED"
            : "UNANIMOUS_ALLOW",
    memberResults: [
      {
        subjectId: owner,
        subjectKind: "SELF",
        decision: "ALLOW",
        stateVersion: 1,
      },
      { subjectId: sid, subjectKind: "PROXY", decision, stateVersion: 1 },
    ],
    authorityBoundary: "Cultural authorization only. No execution authority.",
  });
  await page.route("**/api/state/**", async (route) => {
    const path = new URL(route.request().url()).pathname,
      op = path.split("/").at(-1)!;
    if (path.includes("/subjects/")) {
      calls.push(path);
      const proxy = path.includes("/proxy/");
      let data: unknown;
      if (op === "inspect")
        data = proxy
          ? [subject(), ...(created ? [subject(true)] : [])]
          : created
            ? [group()]
            : [];
      else if (op === "resolve") {
        const body = route.request().postDataJSON();
        data = {
          status: "available",
          data: {
            matches: entities.filter((e) => e.type === body.expectedType),
            state: "ambiguous",
          },
        };
      } else if (op === "create") {
        created = true;
        data = proxy ? subject(true) : group();
      } else if (op === "evaluate") {
        if (revoked)
          return route.fulfill({
            status: 409,
            json: { status: "error", code: "PERMISSION_INACTIVE" },
          });
        data = proxyEvaluation;
      } else if (op === "revoke") {
        revoked = true;
        data = {};
      } else if (op === "update") {
        version++;
        data = group();
      } else if (op === "authorize") {
        const body = route.request().postDataJSON();
        if (failure)
          return route.fulfill({
            status: 409,
            json: { status: "error", code: failure },
          });
        if (body.expectedGroupVersion !== version)
          return route.fulfill({
            status: 409,
            json: { status: "error", code: "GROUP_VERSION_CONFLICT" },
          });
        data = envelope();
      } else if (op === "replay")
        data = proxy
          ? { wrapper: proxyEvaluation, permissionActiveNow: !revoked }
          : { envelope: envelope(), permissionActiveNow: { [sid]: !revoked } };
      return route.fulfill({ json: { status: "available", data } });
    }
    if (op === "session")
      return route.fulfill({ json: { status: "available" } });
    return route.fulfill({
      json: {
        status: "available",
        data: {
          state: state(),
          previous: null,
          feedback: [],
          evaluations: [selfEvaluation],
          graph: { nodes: [], edges: [], semanticHash: "synthetic" },
          diff: {
            added: [],
            removed: [],
            changedConstraints: [],
            feedbackEventIds: [],
          },
        },
      },
    });
  });
  await page.goto("/");
  await labelSynthetic(page);
  await page
    .getByRole("button", { name: "Start / resume demo profile" })
    .click();
  const panel = page.getByRole("region", { name: "Whose taste?" });
  await expect(panel).toBeVisible();
  async function create() {
    await panel
      .getByRole("button", { name: "Inspect subjects and groups" })
      .click();
    await panel.getByLabel("Pseudonymous display label").fill("Alex");
    const types = ["artist", "movie", "brand", "tv_show", "brand"];
    for (let i = 0; i < 5; i++) {
      const slot = panel.getByRole("group", {
        name: `Proxy anchor ${i + 1}`,
        exact: true,
      });
      await slot.getByLabel("Cultural concept").fill(entities[i].name);
      await slot
        .getByRole("combobox", { name: "Domain", exact: true })
        .selectOption(types[i]);
      await slot.getByRole("button").click();
      await slot
        .getByRole("combobox", { name: "Reviewed identity" })
        .selectOption(entities[i].id);
    }
    await panel.getByLabel("I reviewed all five").check();
    await panel.getByLabel("I attest permission to manage").check();
    await panel.getByLabel("I also attest permission").check();
    await panel
      .getByRole("button", { name: "Create proxy subject", exact: true })
      .click();
    await panel
      .getByRole("combobox", { name: "Subject", exact: true })
      .selectOption(sid);
  }
  async function aggregate() {
    await panel
      .getByRole("button", { name: "Evaluate proxy independently" })
      .click();
    await panel.getByLabel("Group label", { exact: true }).fill("Trip");
    await panel.getByLabel("You · SELF", { exact: true }).check();
    await panel
      .getByRole("checkbox", { name: /Proxy: SYNTHETIC TEST DATA/ })
      .check();
    await panel.getByRole("button", { name: "Create versioned group" }).click();
    await panel
      .getByRole("combobox", { name: "Completed result · You" })
      .selectOption(entities[1].id);
    await panel
      .getByRole("combobox", { name: /Completed result · SYNTHETIC TEST DATA/ })
      .selectOption(aid);
    await panel
      .getByRole("button", { name: "Aggregate completed decisions" })
      .click();
  }
  return { panel, calls, errors, create, aggregate };
}
for (const decision of ["ALLOW", "ASK", "REJECT", "UNAVAILABLE"])
  test(`synthetic independent proxy + group ${decision}, visible veto/uncertainty and recorded replay`, async ({
    page,
  }) => {
    const f = await fixture(page, decision);
    expect(f.calls).toHaveLength(0);
    await f.create();
    await expect(
      f.panel.getByText(
        "Permission is attested by the current user and is not independently verified.",
      ),
    ).toBeVisible();
    await expect(
      f.panel.getByText(
        "This is a delegated model, not the owner's Taste State.",
      ),
    ).toBeVisible();
    await f.aggregate();
    await expect(
      f.panel.getByRole("heading", {
        name: `Group cultural policy: ${decision}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(f.panel.getByRole("table")).toContainText(decision);
    await f.panel.getByRole("button", { name: "Replay group receipt" }).click();
    await expect(
      f.panel.getByText("RECORDED HISTORICAL EVIDENCE"),
    ).toBeVisible();
    expect(f.errors).toEqual([]);
  });
test("synthetic revocation blocks new proxy authority and keeps historical replay", async ({
  page,
}) => {
  const f = await fixture(page);
  await f.create();
  await f.panel
    .getByRole("button", { name: "Evaluate proxy independently" })
    .click();
  await f.panel
    .getByRole("button", { name: "Revoke delegated permission" })
    .click();
  await expect(
    f.panel.getByRole("button", { name: "Evaluate proxy independently" }),
  ).toBeDisabled();
  await f.panel.getByRole("button", { name: "Replay proxy receipt" }).click();
  await expect(f.panel.getByRole("status")).toContainText(
    "Permission active now: false",
  );
});
for (const colorScheme of ["dark", "light"] as const)
  test(`synthetic M5 mobile keyboard, ${colorScheme}, reduced motion and long labels`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const f = await fixture(page);
    const inspect = f.panel.getByRole("button", {
      name: "Inspect subjects and groups",
    });
    await inspect.focus();
    await page.keyboard.press("Enter");
    await f.create();
    await f.aggregate();
    await page.screenshot({
      path: `test-results/SYNTHETIC-M5-${colorScheme}-mobile.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(f.errors).toEqual([]);
  });

for (const code of ["GROUP_VERSION_CONFLICT", "GROUP_MEMBER_STATE_STALE"])
  test(`synthetic group fails closed for ${code}`, async ({ page }) => {
    const f = await fixture(page, "ALLOW", code);
    await f.create();
    await f.aggregate();
    await expect(f.panel.getByRole("status")).toContainText(
      code === "GROUP_VERSION_CONFLICT"
        ? "Membership changed"
        : "member state changed",
    );
    await expect(
      f.panel.getByRole("heading", {
        name: "Group cultural policy: ALLOW",
        exact: true,
      }),
    ).toHaveCount(0);
  });
test("synthetic expired delegation blocks new proxy evaluation", async ({
  page,
}) => {
  const f = await fixture(page, "ALLOW", "PERMISSION_INACTIVE");
  await f.create();
  await expect(
    f.panel.getByText("Permission: USER_ATTESTED_PERMISSION · Inactive"),
  ).toBeVisible();
  await expect(
    f.panel.getByRole("button", { name: "Evaluate proxy independently" }),
  ).toBeDisabled();
});
test("synthetic membership edit produces explicit new version", async ({
  page,
}) => {
  const f = await fixture(page, "ALLOW");
  await f.create();
  await f.aggregate();
  await f.panel
    .getByRole("button", {
      name: "Create new membership version from selection",
    })
    .click();
  await expect(
    f.panel.getByText("Policy: UNANIMOUS_NO_VETO_V1 · Version 2"),
  ).toBeVisible();
});
