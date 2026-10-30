import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveProductState, homeFor } from "@/lib/product/state";
import {
  NEED_DEFAULTS,
  buildRequirements,
  selectionFromRequirements,
} from "@/lib/product/needs";
import { parseRequirements } from "@/lib/requirements/validate";

describe("product state", () => {
  it("resolves the four states from the account API alone", () => {
    expect(
      resolveProductState(false, { status: "error", code: "AUTH_REQUIRED" }),
    ).toEqual({ kind: "VISITOR" });
    expect(
      resolveProductState(true, {
        status: "available",
        data: { passport: null },
      }),
    ).toEqual({ kind: "AUTHENTICATED_UNONBOARDED" });
    const passport = {
      passportRef: "tpp_x",
      displayLabel: "Mine",
      stateVersion: 1,
      expiresAt: "2030-01-01T00:00:00Z",
    };
    expect(
      resolveProductState(true, { status: "available", data: { passport } }),
    ).toEqual({ kind: "ACTIVE", passport });
    expect(resolveProductState(false, { code: "NOT_CONFIGURED" })).toEqual({
      kind: "UNAVAILABLE",
      code: "NOT_CONFIGURED",
    });
    expect(resolveProductState(false, null).kind).toBe("UNAVAILABLE");
  });
  it("never treats an outage as a visitor or a new user", () => {
    for (const body of [{}, null, { status: "error", code: "INTERNAL_ERROR" }])
      expect(["VISITOR", "AUTHENTICATED_UNONBOARDED"]).not.toContain(
        resolveProductState(false, body).kind,
      );
  });
  it("sends each state where it belongs", () => {
    expect(homeFor({ kind: "VISITOR" })).toBe("/login");
    expect(homeFor({ kind: "AUTHENTICATED_UNONBOARDED" })).toBe("/onboarding");
  });
});

describe("what matters", () => {
  it("builds requirements the evaluator accepts and round-trips them", () => {
    const sel = NEED_DEFAULTS.map((n) =>
      n.id === "step_free" || n.id === "short_walk" || n.id === "quiet"
        ? { ...n, on: true, value: n.id === "short_walk" ? 15 : n.value }
        : n,
    );
    const reqs = buildRequirements(sel);
    expect(parseRequirements(reqs)).not.toBeNull();
    expect(reqs.map((r) => r.key)).toEqual([
      "accessible_entrance",
      "walking_minutes",
      "noise_level",
    ]);
    expect(reqs[1].expected).toBe(15);
    const back = selectionFromRequirements(reqs);
    expect(back.filter((n) => n.on).map((n) => n.id)).toEqual([
      "step_free",
      "short_walk",
      "quiet",
    ]);
    expect(back.find((n) => n.id === "short_walk")?.value).toBe(15);
    expect(back.find((n) => n.id === "quiet")?.required).toBe(false);
  });
  it("starts with nothing selected: no one else's needs are preloaded", () => {
    expect(buildRequirements(NEED_DEFAULTS)).toEqual([]);
  });
});

// Margaret is a labelled example. She must never be a fallback for a real
// person, so the real-user surfaces may not even import her.
const REAL_USER_FILES = [
  "src/features/home",
  "src/features/onboarding",
  "src/features/product",
  "src/lib/product",
  "src/features/experience/PersonalExperience.tsx",
  "src/app/dashboard",
  "src/app/onboarding",
  "src/app/experience/page.tsx",
];
function walk(path: string): string[] {
  const s = statSync(path);
  if (!s.isDirectory()) return [path];
  return readdirSync(path).flatMap((f) => walk(join(path, f)));
}
describe("Margaret isolation", () => {
  const files = REAL_USER_FILES.flatMap(walk).filter(
    (f) =>
      /\.(ts|tsx)$/.test(f) &&
      // The marketing landing page lives in src/features/home and is a
      // labelled public story, not a signed-in surface.
      !/HomePage\.tsx$/.test(f),
  );
  it("covers real files", () => expect(files.length).toBeGreaterThan(6));
  it.each(files)("%s has no example-persona fixtures", (f) => {
    // A link to the labelled example route is allowed; naming her is not.
    const text = readFileSync(f, "utf8").replaceAll(
      "/demo/margaret",
      "/demo/example",
    );
    expect(text).not.toMatch(/Margaret/i);
    expect(text).not.toMatch(/MARGARET|SENSORY|LOW_ENERGY/);
  });
});
