// @vitest-environment node
import { existsSync } from "node:fs";
import { it, expect } from "vitest";
import { CAPABILITIES } from "@/features/policy/status";

it("every capability shown as available names files that exist; unproven integrations are never shown as available", () => {
  for (const c of CAPABILITIES) {
    if (c.status === "AVAILABLE") {
      expect(c.evidence.length, c.name).toBeGreaterThan(0);
      for (const f of c.evidence)
        expect(existsSync(f), `${c.name}: ${f}`).toBe(true);
    }
    if (c.status === "NOT_VERIFIED")
      for (const f of c.evidence) expect(existsSync(f), f).toBe(true);
  }
  // The statements that must stay false until a recorded run says otherwise.
  const vendors = CAPABILITIES.find((c) =>
    /ChatGPT, Claude or Gemini/.test(c.name),
  );
  expect(vendors?.status).toBe("NOT_VERIFIED");
  expect(
    CAPABILITIES.some(
      (c) =>
        c.status === "AVAILABLE" && /payment|booking|purchase/i.test(c.name),
    ),
  ).toBe(false);
  expect(new Set(CAPABILITIES.map((c) => c.name)).size).toBe(
    CAPABILITIES.length,
  );
});
