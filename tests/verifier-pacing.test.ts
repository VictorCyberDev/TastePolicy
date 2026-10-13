import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("live verifier event pacing", () => {
  it("leaves a full per-second rate-limit window between app operations", () => {
    const source = readFileSync("scripts/verify-qloo.mjs", "utf8");
    expect(source).toContain("VERIFY_INTER_OPERATION_DELAY_MS = 1_100");
    expect(source).toContain("if (calls > 1)");
    expect(source).toContain("there are still no retries");
  });
});
