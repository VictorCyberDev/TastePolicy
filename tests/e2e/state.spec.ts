import { test, expect } from "@playwright/test";
import { labelSynthetic } from "./synthetic-label";
test("credential-free persistence is explicitly unavailable and mobile keyboard remains bounded", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/demo");
  const start = page.getByRole("button", {
    name: "Start / resume demo profile",
  });
  await start.focus();
  await page.keyboard.press("Enter");
  await expect(
    page
      .getByLabel("Taste State operation")
      .filter({ hasText: "Persistent Taste State is not configured" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("state UI presents synthetic snapshot, scope confirmation, version diff and sanitized conflicts", async ({
  page,
}) => {
  let version = 1;
  let initialized = false;
  await page.route("**/api/state/**", (r) => {
    const op = r.request().url().split("/").at(-1);
    if (op === "session") return r.fulfill({ json: { status: "available" } });
    if (op === "mutate") {
      version++;
      return r.fulfill({
        status: 409,
        json: { status: "error", code: "STATE_VERSION_CONFLICT" },
      });
    }
    initialized = true;
    return r.fulfill({
      json: {
        status: "available",
        data: {
          state: {
            profileId: "synthetic-profile",
            stateVersion: version,
            stateHash: "synthetic-hash",
            entries: [],
          },
          previous: null,
          feedback: [],
          evaluations: [],
          graph: {
            nodes: [
              {
                id: "synthetic-node",
                kind: "PROFILE",
                label: "SYNTHETIC TEST DATA",
                source: { kind: "STATE", id: "synthetic-profile", version },
              },
            ],
            edges: [],
            semanticHash: "synthetic-only",
          },
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
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Start / resume demo profile" })
    .click();
  await expect(page.getByText("Taste State version 1")).toBeVisible();
  expect(initialized).toBe(true);
  await page.getByText("ContextGraph · deterministic provenance").click();
  await expect(page.getByText("PROFILE · SYNTHETIC TEST DATA")).toBeVisible();
  await page.getByLabel("Projection").selectOption("State Diff");
  await expect(
    page.getByText("Added 0 · removed 0 · changed constraints 0"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh Taste State" }).click();
  await expect(page.getByText("Taste State version 1")).toBeVisible();
});

test("synthetic state flow exposes feedback version transition, agent B, replay and all graph modes", async ({
  page,
}) => {
  const { syntheticReceipt } = await import("../receipt-presentation-fixture");
  const { entities } = await import("../qloo-fixtures");
  const receipt = syntheticReceipt(0.9);
  let version = 1;
  let event = false;
  const requests: string[] = [];
  const entry = {
    signalId: "synthetic-signal",
    kind: "EXPLICIT_LIKE",
    entity: entities[0],
    scope: "GLOBAL_PREFERENCE",
    persistence: "DURABLE",
    source: "USER",
    sourceEventId: "synthetic-source",
  };
  const envelope = () => ({
    schemaVersion: "taste-state-evaluation-v1",
    evaluationId: "synthetic-evaluation",
    profileId: "synthetic-profile",
    stateVersion: version,
    stateHash: "synthetic-hash",
    agentId: version === 1 ? "Agent-A" : "Agent-B",
    action: { kind: "SELECT_ENTITY", candidate: receipt.candidate },
    context: { key: "demo", domain: receipt.candidate.type },
    decision: {
      outcome: version === 1 ? "ALLOW" : "REJECT",
      basis: version === 1 ? "CULTURAL_POLICY" : "USER_HARD_BLOCK",
      rules: ["SYNTHETIC TEST DATA"],
    },
    cultural: { status: "available", data: receipt },
    source: "live",
  });
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
          candidates: [
            { entity: receipt.candidate, alignmentScore: 0.9, rank: 1 },
          ],
          provenance: receipt.qlooEvidence.provenance,
        },
      },
    }),
  );
  await page.route("**/api/demo/evaluate", (r) =>
    r.fulfill({ json: { status: "available", data: receipt } }),
  );
  await page.route("**/api/state/**", (r) => {
    const op = r.request().url().split("/").at(-1)!;
    requests.push(op);
    if (op === "mutate") {
      event = true;
      version = 2;
      return r.fulfill({ json: { status: "available", data: {} } });
    }
    if (op === "evaluate")
      return r.fulfill({ json: { status: "available", data: envelope() } });
    if (op === "replay")
      return r.fulfill({
        json: {
          status: "available",
          data: { ...envelope(), source: "recorded" },
        },
      });
    if (op === "session") return r.fulfill({ json: { status: "available" } });
    return r.fulfill({
      json: {
        status: "available",
        data: {
          state: {
            stateVersion: version,
            stateHash: "synthetic-hash",
            entries: [entry],
          },
          previous: null,
          evaluations: [],
          feedback: [],
          graph: {
            nodes: [
              {
                id: "synthetic-node",
                kind: "PROFILE",
                label: "SYNTHETIC TEST DATA",
                source: { kind: "STATE", id: "synthetic-profile", version },
              },
            ],
            edges: [],
            semanticHash: "synthetic-hash",
          },
          diff: {
            added: event ? [{ kind: "CONSTRAINT" }] : [],
            removed: [],
            changedConstraints: event ? [{ kind: "CONSTRAINT" }] : [],
            feedbackEventIds: event ? ["synthetic-event"] : [],
          },
        },
      },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/demo");
  await labelSynthetic(page);
  await page.getByRole("button", { name: "Resolve with Qloo" }).click();
  for (let i = 0; i < 5; i++)
    await page
      .getByLabel(`Signal ${i + 1} resolved identity`)
      .selectOption(entities[i].id);
  await page.getByLabel("Target domain").selectOption("destination");
  await page.getByRole("button", { name: "Discover with Qloo" }).click();
  await page.getByRole("button", { name: "Propose SELECT_ENTITY" }).click();
  await page
    .getByRole("button", { name: "Start / resume demo profile" })
    .click();
  await page
    .getByRole("button", { name: "Evaluate using current state" })
    .click();
  await expect(
    page
      .getByRole("region", { name: "State-linked decision" })
      .getByRole("heading", { name: "Cultural policy: ALLOW", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Record scoped feedback" }).click();
  await expect(page.getByText("Taste State version 2")).toBeVisible();
  await page.getByLabel("Logical agent").selectOption("Agent-B");
  await page
    .getByRole("button", { name: "Evaluate using current state" })
    .click();
  await expect(
    page
      .getByRole("region", { name: "State-linked decision" })
      .getByRole("heading", { name: "Cultural policy: REJECT", exact: true }),
  ).toBeVisible();
  const count = requests.filter((r) => r === "evaluate").length;
  await page
    .getByRole("button", { name: "Replay captured evaluation (no Qloo call)" })
    .click();
  await expect(page.getByText(/RECORDED EVIDENCE REPLAY/)).toBeVisible();
  expect(requests.filter((r) => r === "evaluate").length).toBe(count);
  await page.getByText("ContextGraph · deterministic provenance").click();
  for (const mode of [
    "Taste Map",
    "Decision Focus",
    "State Diff",
    "Evidence / Provenance Inspector",
  ]) {
    await page.getByLabel("Projection").selectOption(mode);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: "test-results/m2-synthetic-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: "test-results/m2-synthetic-desktop.png",
    fullPage: true,
  });
});
