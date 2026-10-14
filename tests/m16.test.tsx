import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { spawn, spawnSync } from "node:child_process";
import { syntheticReceipt } from "./receipt-presentation-fixture";
import {
  checkDecisionStability,
  explainTasteDecision,
  readCapturedReceipt,
} from "@/lib/proof/receipt";
import {
  createAgentGateway,
  validateAgentProposal,
} from "@/server/agent/gateway";
import ProofView from "@/features/demo/ProofView";
import SignatureReceipt from "@/features/demo/SignatureReceipt";
import type { QlooProvider } from "@/server/qloo/contracts";
afterEach(cleanup);
const r = syntheticReceipt();
const proposal = {
  identitiesReviewed: true,
  signalIds: r.inputSignals.map((s) => s.id),
  action: {
    kind: "SELECT_ENTITY",
    candidate: { id: r.candidate.id, type: r.candidate.type },
  },
};
const flags = [
  "--experimental-transform-types",
  "--conditions=react-server",
  "--import",
  "./scripts/source-imports.mjs",
];
function child(file: string, input: unknown) {
  const env = {
    ...process.env,
    QLOO_API_KEY: "",
    QLOO_API_BASE_URL: "",
    QLOO_AFFINITY_SCALE: "",
  };
  const c = spawnSync(process.execPath, [...flags, file], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    env,
    timeout: 7000,
  });
  expect(c.error).toBeUndefined();
  expect(c.status).toBe(0);
  return JSON.parse(c.stdout);
}
describe("captured semantic replay", () => {
  it.each([0, 0.2, 0.49, 0.5, 0.7, 0.8, 0.8000000000000002, 0.9233, 1])(
    "replays %s exactly without rounding or mutation",
    (score) => {
      const receipt = syntheticReceipt(score),
        before = JSON.stringify(receipt),
        result = checkDecisionStability(receipt);
      expect(result.status).toBe("available");
      if (result.status !== "available") throw Error("proof failed");
      expect(result.data.replay).toEqual({
        runs: 3,
        identical: 3,
        stable: true,
      });
      expect(result.data.score).toBe(score);
      expect(result.data.boundary.outcome).toBe(receipt.decision.outcome);
      expect(JSON.stringify(receipt)).toBe(before);
    },
  );
  it.each([
    [0.9233, "ALLOW", 0.9233 - 0.8, "down", true],
    [0.2, "REJECT", 0.5 - 0.2, "up", true],
    [0.5, "ASK", 0, "down", false],
    [0.8, "ASK", 0, "up", false],
  ] as const)(
    "preserves boundary membership at %s",
    (score, outcome, margin, direction, touch) => {
      const result = checkDecisionStability(syntheticReceipt(score));
      if (result.status !== "available") throw Error("proof failed");
      expect(result.data.boundary).toMatchObject({
        outcome,
        margin,
        direction,
        touchChangesOutcome: touch,
      });
    },
  );
  it("returns both ASK margins with strict crossings", () => {
    const result = checkDecisionStability(syntheticReceipt(0.7));
    if (result.status !== "available") throw Error("proof failed");
    expect(result.data.boundary.transitions).toEqual([
      {
        to: "ALLOW",
        boundary: 0.8,
        margin: 0.8 - 0.7,
        direction: "up",
        touchChangesOutcome: false,
      },
      {
        to: "REJECT",
        boundary: 0.5,
        margin: 0.7 - 0.5,
        direction: "down",
        touchChangesOutcome: false,
      },
    ]);
  });
  it.each(["score", "policy", "candidate", "decision", "explanation"])(
    "rejects corrupted %s instead of inventing proof",
    (field) => {
      const value = structuredClone(r);
      if (field === "score") value.alignmentScore = NaN;
      if (field === "policy") value.policyVersion = "unknown";
      if (field === "candidate") value.candidate.id = value.inputSignals[0].id;
      if (field === "decision") value.decision.outcome = "ALLOW";
      if (field === "explanation")
        value.explainability = {
          status: "partial",
          contributions: [],
          missingSignalIds: [],
          omittedSignalIds: [],
          omission: "none",
          issues: [],
        };
      expect(readCapturedReceipt(value)).toEqual({
        status: "unavailable",
        reason: "invalid_response",
      });
    },
  );
  it("does not instantiate a provider for explain/stability and preserves missing contributions", () => {
    const factory = vi.fn(() => {
        throw Error("must not call");
      }),
      gateway = createAgentGateway(factory);
    const missing = structuredClone(r);
    missing.explainability = { status: "unavailable", reason: "not_returned" };
    expect(gateway.checkDecisionStability(missing).status).toBe("available");
    expect(gateway.explainTasteDecision(missing)).toMatchObject({
      status: "available",
      data: {
        explainability: { status: "unavailable", reason: "not_returned" },
      },
    });
    expect(factory).not.toHaveBeenCalled();
  });
});
describe("semantic agent gateway", () => {
  it.each([
    {},
    { ...proposal, identitiesReviewed: false },
    { ...proposal, signalIds: proposal.signalIds.slice(1) },
    { ...proposal, signalIds: Array(5).fill(proposal.signalIds[0]) },
    {
      ...proposal,
      action: {
        ...proposal.action,
        candidate: { id: proposal.signalIds[0], type: "place" },
      },
    },
    { ...proposal, url: "https://evil.invalid" },
    { ...proposal, action: { ...proposal.action, kind: "purchase" } },
    { ...proposal, action: { ...proposal.action, context: "x".repeat(161) } },
  ])("rejects invalid structure without dispatch %#", async (value) => {
    const factory = vi.fn(() => {
      throw Error("must not call");
    });
    expect(validateAgentProposal(value)).toBeNull();
    expect(
      await createAgentGateway(factory).evaluateTasteAction(value),
    ).toEqual({ status: "error", code: "INVALID_INPUT" });
    expect(factory).not.toHaveBeenCalled();
  });
  it("rejects target inconsistency before Insights", async () => {
    const infer = vi.fn();
    const provider = {
      entities: async () => ({
        status: "available",
        data: [...r.inputSignals, r.candidate],
      }),
      infer,
    } as unknown as QlooProvider;
    const result = await createAgentGateway(() => provider).evaluateTasteAction(
      {
        ...proposal,
        action: {
          ...proposal.action,
          candidate: { id: r.candidate.id, type: "place" },
        },
      },
    );
    expect(result).toEqual({
      status: "unavailable",
      reason: "unsupported_entity",
    });
    expect(infer).not.toHaveBeenCalled();
  });
  it("preserves timeout as unavailable without policy outcome", async () => {
    const provider = {
      entities: async () => ({ status: "unavailable", reason: "timeout" }),
    } as unknown as QlooProvider;
    expect(
      await createAgentGateway(() => provider).evaluateTasteAction(proposal),
    ).toEqual({ status: "unavailable", reason: "timeout" });
  });
  it("sanitizes unexpected private errors", async () => {
    const result = await createAgentGateway(() => {
      throw Error("private credential diagnostic");
    }).evaluateTasteAction(proposal);
    expect(result).toEqual({ status: "error", code: "INTERNAL_ERROR" });
  });
  it("completes synthetic evaluation in a second process over the existing services", () => {
    const result = child("tests/agent-subprocess.ts", {
      operation: "evaluateTasteAction",
      request: proposal,
    });
    expect(result).toMatchObject({
      status: "available",
      evidenceSource: "synthetic",
      data: {
        candidate: r.candidate,
        decision: r.decision,
        schemaVersion: r.schemaVersion,
      },
    });
    expect(Object.keys(result.data)).not.toContain("headers");
  });
  it("round-trips captured explanation/stability without any configured provider", () => {
    expect(
      child("scripts/agent.mjs", {
        operation: "explainTasteDecision",
        receipt: r,
        evidenceSource: "synthetic",
      }),
    ).toMatchObject({
      status: "available",
      evidenceSource: "synthetic",
      data: { decision: r.decision },
    });
    expect(
      child("scripts/agent.mjs", {
        operation: "checkDecisionStability",
        receipt: r,
        evidenceSource: "recorded",
      }),
    ).toMatchObject({
      status: "available",
      evidenceSource: "recorded",
      data: { replay: { stable: true } },
    });
  });
  it("rejects raw methods, bad JSON, oversized bodies and false live attestation", () => {
    for (const value of [
      { operation: "qloo_insights" },
      "not json",
      '"' + "x".repeat(17000) + '"',
      {
        operation: "checkDecisionStability",
        receipt: r,
        evidenceSource: "live",
      },
    ])
      expect(child("scripts/agent.mjs", value).status).toBe("error");
  });
  it("production adapter with no key fails safely; no fixture fallback", () => {
    expect(
      child("scripts/agent.mjs", {
        operation: "evaluateTasteAction",
        request: proposal,
      }),
    ).toEqual({ status: "unavailable", reason: "not_configured" });
  });
});
describe("signature and capability presentation", () => {
  it("signature uses the receipt identity/outcome with visible authority boundary", () => {
    render(<SignatureReceipt receipt={r} source="synthetic" />);
    expect(screen.getByText(r.receiptId)).toBeVisible();
    expect(screen.getByText("SYNTHETIC TEST DATA")).toBeVisible();
    expect(screen.getByText(r.candidate.name)).toBeVisible();
    expect(screen.getByText(/No spending/)).toBeVisible();
    expect(screen.getByRole("article").textContent).not.toMatch(
      /signed|tamper-proof|confidence|probability/i,
    );
  });
  it.each(["synthetic", "recorded"] as const)(
    "comparison inherits %s and refers to one candidate across all layers",
    (source) => {
      render(<ProofView receipt={r} source={source} />);
      const proposalLayer = screen.getByRole("article", {
          name: "Agent proposal only",
          hidden: true,
        }),
        qloo = screen.getByRole("article", {
          name: "Qloo cultural evidence",
          hidden: true,
        }),
        taste = screen.getByRole("article", {
          name: "TastePolicy authorization",
          hidden: true,
        });
      for (const layer of [proposalLayer, qloo, taste])
        expect(within(layer).getByText(r.candidate.id)).toBeInTheDocument();
      expect(proposalLayer.textContent).not.toContain("0.7000");
      expect(qloo.textContent).not.toContain("Cultural policy: ASK");
      expect(taste.textContent).toContain("Cultural policy: ASK");
      expect(screen.queryByText("LIVE QLOO")).toBeNull();
    },
  );
});

it("sanitized explanation drops arbitrary receipt/provider baggage", () => {
  const input = {
    ...r,
    unexpectedPrivateField: "do-not-return",
    qlooEvidence: {
      ...r.qlooEvidence,
      headers: { "X-Api-Key": "do-not-return" },
    },
  };
  const result = explainTasteDecision(input);
  expect(result.status).toBe("available");
  expect(JSON.stringify(result)).not.toContain("do-not-return");
});
it("stdio has a total read deadline for incomplete input", async () => {
  const child = spawn(process.execPath, [...flags, "scripts/agent.mjs"], {
    env: { ...process.env, QLOO_API_KEY: "" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  child.stdout.on("data", (data) => {
    stdout += data.toString();
  });
  child.stdin.write('{"operation":');
  const status = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("deadline did not stop input"));
    }, 4500);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  expect(status).toBe(0);
  expect(JSON.parse(stdout)).toEqual({
    status: "error",
    code: "BODY_READ_TIMEOUT",
  });
}, 5000);

it("gateway preserves candidate/evidence identity consistency", async () => {
  const provider: QlooProvider = {
    async resolve() {
      throw Error("unused");
    },
    async entities() {
      return { status: "available", data: [...r.inputSignals, r.candidate] };
    },
    async infer() {
      return {
        status: "available",
        data: {
          candidates: [
            {
              entity: r.inputSignals[0],
              rawAffinity: 0.7,
              alignmentScore: 0.7,
              scale: "unit",
              rank: 1,
              explainability: r.explainability,
            },
          ],
          provenance: r.qlooEvidence.provenance,
        },
      };
    },
  };
  expect(
    await createAgentGateway(() => provider).evaluateTasteAction(proposal),
  ).toEqual({ status: "unavailable", reason: "invalid_response" });
});
