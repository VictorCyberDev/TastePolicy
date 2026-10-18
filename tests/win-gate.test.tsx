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
it("blinded pilot contains all held-out scenarios, no system outputs/IDs/scores and rejects duplicate respondents", async () => {
  const { makePacket, validateResponses } =
    await import("../scripts/win-gate-pilot.mjs");
  const packet = makePacket();
  expect(packet.cases).toHaveLength(18);
  const encoded = JSON.stringify(packet);
  expect(encoded).not.toMatch(
    /alignmentScore|rawAffinity|allowAbove|rejectBelow|FULL_TASTEPOLICY|cultural-allow|contentHash/,
  );
  const pub = JSON.parse(readFileSync("public/win-gate/pilot.json", "utf8"));
  const r = {
    schemaVersion: "win-gate-human-response-v1",
    answeredAt: new Date().toISOString(),
    packetHash: pub.packetHash,
    participantId: crypto.randomUUID(),
    answers: packet.cases.map((c: { caseId: string }) => ({
      caseId: c.caseId,
      choice: "CANNOT JUDGE FROM THE INFORMATION PROVIDED",
    })),
  };
  expect(validateResponses(packet, [r]).size).toBe(1);
  expect(() => validateResponses(packet, [r, r])).toThrow();
  expect(() =>
    validateResponses(packet, [{ ...r, packetHash: "wrong" }]),
  ).toThrow();
});

it("SYNTHETIC metric unit check preserves uncertain labels and correct pause denominators", async () => {
  const { makePacket, summarizeLabels } =
    await import("../scripts/win-gate-pilot.mjs");
  const packet = makePacket(),
    selection = JSON.parse(
      readFileSync("docs/evaluation/win-gate-pilot-selection.json", "utf8"),
    ).selection as { sourceScenarioId: string }[];
  const predictions = new Map(
    selection.map((s) => [s.sourceScenarioId, { decision: "UNAVAILABLE" }]),
  );
  predictions.set(selection[0].sourceScenarioId, { decision: "ALLOW" });
  predictions.set(selection[1].sourceScenarioId, { decision: "REJECT" });
  predictions.set(selection[2].sourceScenarioId, { decision: "ASK" });
  const choices = ["ASK THE USER", "DO NOT PROCEED", "PROCEED"];
  const stats = summarizeLabels(
    packet,
    [
      {
        answers: packet.cases.map((c, i) => ({
          caseId: c.caseId,
          choice: choices[i] ?? "CANNOT JUDGE FROM THE INFORMATION PROVIDED",
        })),
      },
    ],
    predictions,
  );
  expect(stats.denominator).toBe(3);
  expect(stats.agreement).toBe(1);
  expect(stats.unsafeAutonomy).toBe(1);
  expect(stats.pauseDenominator).toBe(2);
  expect(stats.askDenominator).toBe(1);
  expect(stats.missedAsk).toBe(1);
  expect(stats.unscorable).toBe(15);
});
