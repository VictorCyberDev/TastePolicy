import { execute } from "../benchmarks/tastebench/lib/execute";
import type { Scenario } from "../benchmarks/tastebench/lib/types";
// SYNTHETIC TEST RESPONSES ONLY — no genuine pilot participation or outcome claims.
import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import {
  makePacket,
  validateResponses,
  summarizeLabels,
  representEvidence,
  choices,
  labelMap,
} from "../scripts/win-gate-pilot.mjs";
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const packet = makePacket();
const pub = read("public/win-gate/pilot.json");
const selection = read("docs/evaluation/win-gate-pilot-selection.json");
const source = read("benchmarks/tastebench/v1/scenarios/engineering.json");
// Frozen pre-recruitment v1 selection checkpoint; works in shallow CI checkouts.
const previous = {
  schemaVersion: "win-gate-pilot-selection-v1",
  status: "PREDECLARED_NOT_RUN",
  sourceVersion: "engineering-v1",
  datasetHash:
    "0d30276bce61ba67158f305bf5340acc51f53ec58cc041159db6b774970bc11d",
  packetHash:
    "9930ee948ccb9b75ceb9b61086f9aa1287e3523ec6e45f85ed59afe685af1eeb",
  selection: [
    {
      caseId: "case-01",
      sourceScenarioId: "multi-currency-termination",
      contentHash:
        "8684a40b948f043176c9839b929480e2fc825a533ef6f302e739811367c7d689",
      domain: "brand",
    },
    {
      caseId: "case-02",
      sourceScenarioId: "not-configured",
      contentHash:
        "0569ded2ddee353e44f29d769c5f064b97f16f89edb601a571c8f47924db1a46",
      domain: "destination",
    },
    {
      caseId: "case-03",
      sourceScenarioId: "price-violation",
      contentHash:
        "49b304243c6ea2c81ce7bfc11ac24ca5ef802d8fb605a123e091cf32343fed83",
      domain: "place",
    },
    {
      caseId: "case-04",
      sourceScenarioId: "clarification-still_unsure",
      contentHash:
        "9234a81dba53e2f8b880d99d38cf49a5e0d861a1fa25897274ad1299864bcda4",
      domain: "brand",
    },
    {
      caseId: "case-05",
      sourceScenarioId: "clarification-price-40",
      contentHash:
        "0c4fdcc49818209b84b979837cbdf74e1480532f9c34345ffb5fe3cfd832b615",
      domain: "place",
    },
    {
      caseId: "case-06",
      sourceScenarioId: "cultural-ask",
      contentHash:
        "47c75d1f088c628dcfcb8c3293a1e40359ba20c976945504a63a707fd7ebd063",
      domain: "brand",
    },
    {
      caseId: "case-07",
      sourceScenarioId: "exact-exclusion",
      contentHash:
        "d36a2291d4faa2f35e49cd76307018199669e7e465df84f087f07e7654e91f0a",
      domain: "brand",
    },
    {
      caseId: "case-08",
      sourceScenarioId: "cultural-reject",
      contentHash:
        "7a7e3a48ad52e0f9dd54f67769ea41d128396e43e1f7ebee1901a949e4e76e69",
      domain: "place",
    },
    {
      caseId: "case-09",
      sourceScenarioId: "repair-unavailable",
      contentHash:
        "c9e6a036a0c1d11c19b5ab20ffd8456b72df1db8c137b59329b0224ad85bcfe8",
      domain: "place",
    },
    {
      caseId: "case-10",
      sourceScenarioId: "hard-block-outage",
      contentHash:
        "0849150b6024c6d26057fda9a4a3af462bfcea15f00701fa424cb889d3b117c5",
      domain: "place",
    },
    {
      caseId: "case-11",
      sourceScenarioId: "unknown-price",
      contentHash:
        "63791f9d48532320f28acabb2d911c934ae33ffa6dbd89b97fd19e68b34c757a",
      domain: "destination",
    },
    {
      caseId: "case-12",
      sourceScenarioId: "clarification-unacceptable",
      contentHash:
        "4636e453fd0a24d03fa00238183e9acff1bdec268a1230aea2461919336f4ab8",
      domain: "destination",
    },
    {
      caseId: "case-13",
      sourceScenarioId: "applicable-feedback-transition",
      contentHash:
        "c311c0ad55f5ba1102eb08843fe28ab8c9bd630787554d4c883c536904603f31",
      domain: "destination",
    },
    {
      caseId: "case-14",
      sourceScenarioId: "repair-allow",
      contentHash:
        "101817cd41f2635eb91a7158d04efca81d07a113a21006630b2ea771bb170597",
      domain: "brand",
    },
    {
      caseId: "case-15",
      sourceScenarioId: "cultural-allow",
      contentHash:
        "58f4f8a725eddab7518ccc0a771c2c4065854dacac34a10361c37ca21cabf4cb",
      domain: "destination",
    },
    {
      caseId: "case-16",
      sourceScenarioId: "repair-ask",
      contentHash:
        "5ba76d109b9c4d576c993ba271983dc10dd88ec1d5cba53e3b1c6366c8bc9155",
      domain: "place",
    },
    {
      caseId: "case-17",
      sourceScenarioId: "repair-miss",
      contentHash:
        "8285b8a5fb68f9b62b98f48e3969f82ebf00869d5e093ba37094e6717bcaba26",
      domain: "destination",
    },
    {
      caseId: "case-18",
      sourceScenarioId: "score-boundaries",
      contentHash:
        "b746c151dcfe8aa91d1912d37b0d6de060ffe7710e9d674d1c9881ddf3b9b192",
      domain: "brand",
    },
  ],
  rationale:
    "All held-out EVALUATION scenarios, six per domain. No post-result selection. Cultural-fit cases may be unscorable without numeric/system evidence; do not infer labels.",
};
const response = () => ({
  schemaVersion: "win-gate-human-response-v3",
  packetHash: pub.packetHash,
  participantId: randomUUID(),
  answeredAt: new Date().toISOString(),
  answers: packet.cases.map((c) => ({ caseId: c.caseId, choice: choices[4] })),
});
it("retains all 18 held-out source cases and dataset hash, invalidates unrun v1", () => {
  expect(selection.selection).toEqual(previous.selection);
  expect(selection.datasetHash).toBe(previous.datasetHash);
  expect(packet.cases).toHaveLength(18);
  expect(packet.schemaVersion).toBe("win-gate-blinded-pilot-v3");
  expect(pub.packetHash).not.toBe(previous.packetHash);
  expect(pub.packetHash).not.toBe(
    "3a34ce283af7f51c6d4fd40bf76f7f80480cd24f1541e69a3433b1c7badad538",
  );
  expect(pub.packetHash).toBe(
    createHash("sha256").update(JSON.stringify(packet)).digest("hex"),
  );
  expect(selection.participantCount).toBe(0);
  expect(selection.status).toBe(
    "PARTICIPANT_UX_REPAIRED_READY_FOR_GUIDE_REVIEW",
  );
});
for (const [i, c] of packet.cases.entries())
  it(`evidence and material input coverage ${c.caseId}`, () => {
    const s = source.scenarios.find(
      (s: { id: string }) => s.id === selection.selection[i].sourceScenarioId,
    );
    expect(c.proposal).toContain(s.input.candidate.type);
    expect(c.context.domain).toBe(s.input.context.domain);
    expect(c.context.price).toEqual(s.input.context.price ?? "NOT PROVIDED");
    expect(c.facts).toHaveLength(
      s.input.state.entries.filter(
        (e: { kind: string }) => e.kind !== "EXPLICIT_LIKE",
      ).length,
    );
    for (const e of s.input.state.entries.filter(
      (e: { kind: string }) => e.kind !== "EXPLICIT_LIKE",
    )) {
      if (e.constraint?.kind === "MAX_PRICE")
        expect(c.facts.join(" ")).toContain(
          `${e.constraint.currency} ${e.constraint.amount}`,
        );
      if (e.constraint?.kind === "EXCLUDE_CANDIDATE")
        expect(c.facts.join(" ")).toContain(
          e.candidateId === s.input.candidate.id
            ? "said not to choose this option"
            : "said not to choose a different option",
        );
      if (e.expiresAt) expect(c.facts.join(" ")).toContain(e.expiresAt);
    }
    if (s.input.cultural.status === "available") {
      const e = s.input.cultural.data.qlooEvidence;
      expect(c.evidence.rawAffinity).toBe(e.rawAffinity);
      expect(c.evidence.scale).toBe(e.scale);
      expect(c.evidence.text).toContain(String(e.rawAffinity));
      expect(Number(c.evidence.text.split(": ")[1].split(" / ")[0])).toBe(
        e.rawAffinity,
      );
      expect(c.evidence.text).toContain(" / 1.00");
    } else
      expect(c.evidence.text).toBe(
        "The assistant does not currently have the taste information it needs for this option.",
      );
    expect(c.choices).toEqual(choices);
    expect(c.choices).toHaveLength(5);
  });
it("participant material contains evidence but no outcome interpretation or internal identity", () => {
  const encoded = JSON.stringify(pub);
  expect(encoded).not.toMatch(
    /reasonCode|policyVersion|allowAbove|rejectBelow|FULL_TASTEPOLICY|QLOO_POLICY|STRONG_ALIGNMENT|alignmentScore|contentHash|\bALLOW\b|\bREJECT\b/,
  );
  // UNAVAILABLE is legitimate only inside the behavioral answer choice.
  for (const c of packet.cases) {
    const facts = JSON.stringify({ ...c, choices: [] });
    expect(facts).not.toMatch(/\bALLOW\b|\bASK\b|\bREJECT\b|\bUNAVAILABLE\b/);
  }
  for (const s of source.scenarios) {
    expect(encoded).not.toContain(s.id + '"');
    expect(encoded).not.toContain(s.input.candidate.name);
    expect(encoded).not.toContain(s.input.candidate.id);
  }
  expect(encoded).not.toMatch(/above 0\.8|below 0\.5|threshold/i);
});
it("preserves exact exclusions and all currency ceilings without interpreting them", () => {
  const text = packet.cases.flatMap((c) => c.facts).join(" ");
  expect(text).toContain("explicitly said not to choose this option");
  expect(text).toContain("USD 50");
  expect(text).toContain("EUR");
});
it("supports declared percent scale and excludes unknown/invalid evidence explicitly", () => {
  for (const [rawAffinity, scale] of [
    [90, "percent"],
    [0.9, "unit"],
  ] as const) {
    const e = representEvidence({
      status: "available",
      data: { qlooEvidence: { rawAffinity, scale } },
    });
    expect(e.rawAffinity).toBe(rawAffinity);
    expect(e.scale).toBe(scale);
    expect(e.text).toContain(scale === "percent" ? "90 / 100" : "0.90 / 1.00");
  }
  for (const [rawAffinity, scale] of [
    [9, "unknown"],
    [101, "percent"],
    [NaN, "unit"],
    ["0.9", "unit"],
  ])
    expect(
      representEvidence({
        status: "available",
        data: { qlooEvidence: { rawAffinity, scale } },
      }).status,
    ).toBe("PARTICIPANT_EVIDENCE_UNREPRESENTABLE");
});
it("rejects v1, wrong hashes, duplicates and permits only five behavioral labels", () => {
  const r = response();
  expect(validateResponses(packet, [r]).size).toBe(1);
  for (const invalid of [
    { ...r, schemaVersion: "win-gate-human-response-v1" },
    {
      ...r,
      schemaVersion: "win-gate-human-response-v2",
      packetHash:
        "3a34ce283af7f51c6d4fd40bf76f7f80480cd24f1541e69a3433b1c7badad538",
    },
    { ...r, schemaVersion: "win-gate-human-response-v2" },
    { ...r, packetHash: previous.packetHash },
    { ...r, answers: r.answers.map((a) => ({ ...a, choice: "ALLOW" })) },
  ])
    expect(() => validateResponses(packet, [invalid])).toThrow();
  expect(() => validateResponses(packet, [r, r])).toThrow();
  expect(choices.map((c) => labelMap[c])).toEqual([
    "ALLOW",
    "ASK",
    "REJECT",
    "UNAVAILABLE",
    "UNSCORABLE",
  ]);
});
it("reports four-outcome agreement and unfavorable answers with correct denominators", () => {
  const r = response();
  const predictions = new Map<string, ReturnType<typeof execute>>(
    selection.selection.map((s: { sourceScenarioId: string }) => [
      s.sourceScenarioId,
      {
        ...execute(
          source.scenarios.find((x: Scenario) => x.id === s.sourceScenarioId),
          "FULL_TASTEPOLICY",
        ),
        decision: "ALLOW",
      },
    ]),
  );
  const human = [1, 1, 1, 0, 3, 2];
  const systems = [
    "ALLOW",
    "REJECT",
    "UNAVAILABLE",
    "REJECT",
    "UNAVAILABLE",
    "ALLOW",
  ];
  human.forEach((x, i) => {
    r.answers[i].choice = choices[x];
    predictions.set(selection.selection[i].sourceScenarioId, {
      ...predictions.get(selection.selection[i].sourceScenarioId)!,
      decision: systems[i] as "ALLOW" | "ASK" | "REJECT" | "UNAVAILABLE",
    });
  });
  const stats = summarizeLabels(packet, [r], [...predictions.values()]);
  expect(stats.exactDecisionAgreement).toEqual({
    numerator: 1,
    denominator: 6,
  });
  expect(stats.unsafeAutonomy).toEqual({ numerator: 2, denominator: 5 });
  expect(stats.missedAsk).toEqual({
    numerator: 3,
    denominator: 3,
    bySystemResult: { ALLOW: 1, REJECT: 1, UNAVAILABLE: 1 },
  });
  const unavailableToAllow = new Map(predictions);
  unavailableToAllow.set(selection.selection[4].sourceScenarioId, {
    ...predictions.get(selection.selection[4].sourceScenarioId)!,
    decision: "ALLOW",
  });
  expect(
    summarizeLabels(packet, [r], [...unavailableToAllow.values()])
      .unsafeAutonomy,
  ).toEqual({ numerator: 3, denominator: 5 });
  expect(stats.incorrectReject).toEqual({ numerator: 1, denominator: 1 });
  expect(stats.unavailableAgreement).toEqual({ numerator: 1, denominator: 1 });
  expect(stats.cannotJudge.count).toBe(12);
  expect(stats.disagreementCases).toHaveLength(5);
  expect(Object.keys(stats.subgroups)).toEqual(
    expect.arrayContaining([
      "cultural-evidence-only",
      "explicit-constraint",
      "missing-context",
      "provider-unavailable",
    ]),
  );
  const altered = structuredClone(packet);
  altered.cases[0].evidence.status = "PARTICIPANT_EVIDENCE_UNREPRESENTABLE";
  expect(() =>
    summarizeLabels(altered, [r], [...predictions.values()]),
  ).toThrow("PACKET_BINDING_MISMATCH");
});

it("keeps CANNOT JUDGE unscored, including on unavailable cases, and has no invented N=0 results", () => {
  const predictions = new Map<string, ReturnType<typeof execute>>(
    selection.selection.map((s: { sourceScenarioId: string }) => [
      s.sourceScenarioId,
      {
        ...execute(
          source.scenarios.find((x: Scenario) => x.id === s.sourceScenarioId),
          "FULL_TASTEPOLICY",
        ),
        decision: "UNAVAILABLE",
      },
    ]),
  );
  const stats = summarizeLabels(
    packet,
    [response()],
    [...predictions.values()],
  );
  expect(stats.exactDecisionAgreement).toEqual({
    numerator: 0,
    denominator: 0,
  });
  expect(stats.unavailableAgreement).toEqual({ numerator: 0, denominator: 0 });
  expect(stats.cannotJudge.count).toBe(18);
  expect(stats.cannotJudgeOnUnavailable).toBe(
    packet.cases.filter((c) => c.evidence.status === "unavailable").length,
  );
  const empty = summarizeLabels(packet, [], [...predictions.values()]);
  expect(empty.cannotJudge.rate).toBeNull();
  expect(empty.exactDecisionAgreement.denominator).toBe(0);
});

it("keeps the worked example out of the 18 cases and every response", () => {
  expect(pub.practice.proposal).toBe(
    "An AI assistant wants to recommend Café A.",
  );
  expect(pub.practice).not.toHaveProperty("answer");
  expect(
    pub.cases.some((c: { proposal: string }) => c.proposal.includes("Café A")),
  ).toBe(false);
  const r = response();
  expect(r.answers).toHaveLength(18);
  expect(() =>
    validateResponses(packet, [
      {
        ...r,
        answers: [...r.answers, { caseId: "practice", choice: choices[0] }],
      },
    ]),
  ).toThrow();
});
it("never rounds source affinity, including close boundary numbers", () => {
  for (const rawAffinity of [0.80000001, 0.49999999, 0.1, 0.0000001, 0, 1]) {
    const e = representEvidence({
      status: "available",
      data: { qlooEvidence: { rawAffinity, scale: "unit" } },
    });
    expect(Number(e.text.split(": ")[1].split(" / ")[0])).toBe(rawAffinity);
  }
});
it("does not fabricate participation from a packet or practice example", () => {
  expect(selection.participantCount).toBe(0);
  expect(pub).not.toHaveProperty("participantCount");
  expect(validateResponses(packet, []).size).toBe(0);
});
