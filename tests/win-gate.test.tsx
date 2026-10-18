import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { boundedContinuation } from "@/lib/agent/continuation";
import Outcome from "@/features/arena/Outcome";
import { ids, signalIds } from "./qloo-fixtures";
const root = process.cwd();
const request = {
  signalIds,
  identitiesReviewed: true,
  action: {
    kind: "SELECT_ENTITY",
    candidate: { id: ids[5], type: "destination" },
  },
};
const nodeArgs = [
  "--experimental-transform-types",
  "--conditions=react-server",
  "--import",
  "./scripts/source-imports.mjs",
];
describe("Win Gate external process proof — SYNTHETIC TEST DATA", () => {
  for (const decision of ["ALLOW", "ASK", "REJECT", "UNAVAILABLE"] as const)
    it(`${decision} obeys captured authority in a separate caller process`, () => {
      const raw = execFileSync(
        process.execPath,
        [...nodeArgs, "tests/win-gate-agent-child.ts", decision],
        {
          cwd: root,
          input: JSON.stringify({
            operation: "evaluateTasteAction",
            includeContinuation: true,
            request,
          }),
          encoding: "utf8",
          timeout: 15000,
        },
      );
      const result = JSON.parse(raw);
      const trace = JSON.parse(
        execFileSync(
          process.execPath,
          [
            "--input-type=module",
            "-e",
            `import {obey} from './examples/win-gate/obey.mjs'; let s=''; for await(const c of process.stdin)s+=c; console.log(JSON.stringify(obey(JSON.parse(s))));`,
          ],
          {
            cwd: root,
            input: JSON.stringify(result),
            encoding: "utf8",
            timeout: 5000,
          },
        ),
      );
      expect(trace.decision).toBe(decision);
      expect(trace.transactionPerformed).toBe(false);
      expect(trace.automaticRetry).toBe(false);
      expect(trace.actions).toEqual(boundedContinuation(decision).permitted);
      expect(trace.status).toBe(
        decision === "ALLOW" ? "DEMO_CONTINUED" : "STOPPED",
      );
      if (decision !== "ALLOW") expect(trace.draft).toBeNull();
      if (decision === "ASK") expect(trace.message).toContain("new evaluation");
      if (decision === "UNAVAILABLE")
        expect(trace.message).toContain("not dislike");
    });
  it("external caller has no policy/provider/state imports and no retry loop", () => {
    const source =
      readFileSync("examples/win-gate/agent.mjs", "utf8") +
      readFileSync("examples/win-gate/obey.mjs", "utf8");
    expect(source).not.toMatch(
      /from ["'][^"']*(?:src\/|policy|qloo|tastebench|state\/)/,
    );
    expect(source).not.toMatch(
      /alignmentScore|rawAffinity|allowAbove|rejectBelow/,
    );
    expect(source.match(/spawn\(/g)).toHaveLength(1);
  });
});
for (const decision of ["ALLOW", "ASK", "REJECT", "UNAVAILABLE"] as const)
  it(`Arena ${decision} has non-color meaning and no transaction authority`, () => {
    cleanup();
    render(
      <Outcome
        decision={decision}
        label="SYNTHETIC TEST DATA"
        reason="Test evidence"
      />,
    );
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(
      decision,
    );
    expect(screen.getByText(/Not granted/)).toBeTruthy();
    expect(screen.getByText(/Automatic retry: off/)).toBeTruthy();
    cleanup();
  });
