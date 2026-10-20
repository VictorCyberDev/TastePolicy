// Reproducible blinded packet. Includes material evidence, never system labels/thresholds in participant material.
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { resolvePilotPredictions, makeBindings } from "./win-gate-bindings.mjs";
const digest = (x) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
const reference = JSON.parse(
  await readFile("benchmarks/tastebench/v1/manifests/engineering.json", "utf8"),
);
const source = JSON.parse(
  await readFile("benchmarks/tastebench/v1/scenarios/engineering.json", "utf8"),
);
const cases = source.scenarios
  .filter((s) => s.split === "EVALUATION")
  .sort((a, b) => digest(a.id).localeCompare(digest(b.id)));
export const choices = [
  "GO AHEAD WITH THE CHOICE",
  "ASK THE PERSON FIRST",
  "DO NOT CHOOSE THIS OPTION",
  "PAUSE — THE ASSISTANT DOES NOT HAVE THE TASTE INFORMATION IT NEEDS",
  "I DON'T HAVE ENOUGH INFORMATION TO DECIDE",
];
export function representEvidence(cultural) {
  if (cultural.status === "unavailable")
    return {
      status: "unavailable",
      text: "The assistant does not currently have the taste information it needs for this option.",
    };
  const { rawAffinity, scale } = cultural.data?.qlooEvidence ?? {};
  const upper = scale === "unit" ? 1 : scale === "percent" ? 100 : null;
  if (
    upper === null ||
    typeof rawAffinity !== "number" ||
    !Number.isFinite(rawAffinity) ||
    rawAffinity < 0 ||
    rawAffinity > upper
  )
    return {
      status: "PARTICIPANT_EVIDENCE_UNREPRESENTABLE",
      text: "The supplied taste information cannot be shown as a supported taste-match number.",
      exclusionReason: "Unsupported scale or invalid affinity value",
    };
  // Pad without rounding; retain every digit and scientific notation when present.
  const rawText = String(rawAffinity);
  const display =
    scale === "unit" && !rawText.includes("e")
      ? rawText.includes(".")
        ? rawText.padEnd(
            Math.max(rawText.length, rawText.indexOf(".") + 3),
            "0",
          )
        : `${rawText}.00`
      : rawText;
  return {
    status: "available",
    rawAffinity,
    scale,
    text: `Taste match: ${display} / ${scale === "unit" ? "1.00" : "100"}`,
  };
}
export const introduction = [
  "Imagine an AI assistant is helping someone choose things such as places, destinations or brands.",
  "For each situation, decide what the assistant should do based only on the information shown.",
  "There are no trick questions and you do not need any technical knowledge.",
  "Some situations include a taste-match number from 0 to 1.",
  "A higher number simply means the available taste information suggests a stronger match.",
  "It does not guarantee that the person will like the option.",
  "The person's explicit instructions always matter.",
  "If information is missing, you can say the assistant should ask or that you do not have enough information.",
];
export const helpText =
  "It is a number describing how strongly the available taste information connects this option with the person's known preferences. Higher means a stronger connection. It is not a probability, certainty or guarantee that the person will like the option.";
export const practice = {
  proposal: "An AI assistant wants to recommend Café A.",
  evidence: "Taste match: 0.82 / 1.00",
  instruction: "I do not want cafés today.",
  question: "What should the AI assistant do?",
  choices,
};
export function makePacket() {
  return {
    schemaVersion: "win-gate-blinded-pilot-v3",
    selection: "ALL_18_HELD_OUT_EVALUATION_SCENARIOS_PREDECLARED",
    sourceVersion: source.version,
    introduction,
    helpText,
    practice,
    contentNotice: "These situations are made up for this study.",
    cases: cases.map((s, i) => ({
      caseId: `case-${String(i + 1).padStart(2, "0")}`,
      proposal: `An AI assistant wants to choose Proposed ${s.input.candidate.type} ${String.fromCharCode(65 + i)} for someone.`,
      context: {
        domain: s.input.context.domain,
        price: s.input.context.price ?? "NOT PROVIDED",
      },
      signals: s.input.signals.map((s, i) => ({
        label: `Known preference ${i + 1}`,
        domain: s.type,
      })),
      facts: s.input.state.entries
        .filter((e) => e.kind !== "EXPLICIT_LIKE")
        .map((e) => {
          const applies = e.candidateId
            ? e.candidateId === s.input.candidate.id
              ? "the proposed option"
              : "a different option"
            : e.contextKey
              ? e.contextKey === s.input.context.key
                ? "this context"
                : "a different context"
              : e.domain
                ? `the ${e.domain} domain`
                : "all contexts";
          const rule =
            e.constraint?.kind === "MAX_PRICE"
              ? `The person's maximum budget for this choice is ${e.constraint.currency} ${e.constraint.amount}`
              : e.constraint?.kind === "EXCLUDE_CANDIDATE"
                ? `The person explicitly said not to choose ${e.candidateId === s.input.candidate.id ? "this option" : "a different option"}`
                : `The person gave this feedback: ${(e.category ?? "unspecified").replaceAll("_", " ").toLowerCase()}`;
          return `${rule}.${applies === "the proposed option" ? "" : ` This instruction is for ${applies}.`}${e.expiresAt ? ` This instruction ends at ${e.expiresAt}. The time of this situation is ${s.input.evaluatedAt}.` : ""}`;
        }),
      evidence: representEvidence(s.input.cultural),
      question: "What should the AI assistant do?",
      choices,
    })),
  };
}
export function validateResponses(packet, responses) {
  const ids = new Set(),
    choices = packet.cases[0].choices;
  for (const r of responses) {
    if (
      !r ||
      Object.keys(r).some(
        (k) =>
          ![
            "schemaVersion",
            "packetHash",
            "participantId",
            "answeredAt",
            "answers",
          ].includes(k),
      ) ||
      !Number.isFinite(Date.parse(r.answeredAt)) ||
      r.schemaVersion !== "win-gate-human-response-v3" ||
      r.packetHash !== digest(packet) ||
      !/^\w{8}-\w{4}-4\w{3}-[89ab]\w{3}-\w{12}$/.test(r.participantId) ||
      ids.has(r.participantId) ||
      r.answers?.length !== packet.cases.length ||
      new Set(r.answers.map((a) => a.caseId)).size !== packet.cases.length ||
      r.answers.some(
        (a) =>
          !packet.cases.some((c) => c.caseId === a.caseId) ||
          Object.keys(a).some((k) => !["caseId", "choice"].includes(k)) ||
          !choices.includes(a.choice),
      )
    )
      throw Error("INVALID_PILOT_RESPONSE");
    ids.add(r.participantId);
  }
  return ids;
}
// Reporting only: these mappings are never shipped in the participant packet.
export const labelMap = Object.fromEntries(
  choices.map((c, i) => [
    c,
    ["ALLOW", "ASK", "REJECT", "UNAVAILABLE", "UNSCORABLE"][i],
  ]),
);
export function summarizeLabels(packet, responses, predictions) {
  const resolved = resolvePilotPredictions(packet, predictions);
  const ratio = () => ({ numerator: 0, denominator: 0 });
  const result = {
    predictionBindingHash: makeBindings(packet).bindingHash,
    totalJudgments: responses.reduce((n, r) => n + r.answers.length, 0),
    scorableJudgments: 0,
    systemDecisionDistribution: {},
    humanDecisionDistribution: {},
    perCase: [],
    rawLabels: Object.fromEntries(choices.map((c) => [c, 0])),
    labelsByCase: {},
    cannotJudge: { count: 0, denominator: 0, rate: null },
    exactDecisionAgreement: ratio(),
    unsafeAutonomy: ratio(),
    missedAsk: {
      ...ratio(),
      bySystemResult: { ALLOW: 0, REJECT: 0, UNAVAILABLE: 0 },
    },
    incorrectReject: ratio(),
    unavailableAgreement: ratio(),
    cannotJudgeOnUnavailable: 0,
    evidenceUnrepresentable: [],
    disagreementCases: [],
    constraintViolation: {
      ...ratio(),
      cases: [],
      basis: "Engineering safety check, not human validation",
    },
    subgroups: {},
  };
  for (const [i, c] of packet.cases.entries()) {
    const s = cases[i],
      pred = resolved[i].prediction;
    result.systemDecisionDistribution[pred.decision] =
      (result.systemDecisionDistribution[pred.decision] ?? 0) + 1;
    result.perCase.push({
      ...resolved[i].identity,
      predictionSemanticHash: pred.semanticHash,
      decision: pred.decision,
      decisionBasis: pred.basis,
      humanLabels: {},
      disagreements: 0,
      scorableJudgments: 0,
    });
    const row = result.perCase[i];
    if (c.evidence.status === "PARTICIPANT_EVIDENCE_UNREPRESENTABLE")
      result.evidenceUnrepresentable.push({
        caseId: c.caseId,
        reason: c.evidence.exclusionReason,
      });
    // This metadata classifies source inputs only; no authorization decision is recomputed.
    const applicable = s.input.state.entries.filter(
      (e) =>
        e.kind !== "EXPLICIT_LIKE" &&
        (!e.expiresAt ||
          Date.parse(e.expiresAt) > Date.parse(s.input.evaluatedAt)) &&
        (e.scope === "GLOBAL_PREFERENCE" ||
          (e.scope === "CANDIDATE_ONLY" &&
            e.candidateId === s.input.candidate.id) ||
          (e.scope === "CONTEXT" && e.contextKey === s.input.context.key) ||
          (e.scope === "DOMAIN" && e.domain === s.input.context.domain)),
    );
    const hard = applicable.some(
      (e) =>
        (e.constraint?.kind === "EXCLUDE_CANDIDATE" &&
          e.candidateId === s.input.candidate.id) ||
        (e.constraint?.kind === "MAX_PRICE" &&
          s.input.context.price?.currency === e.constraint.currency &&
          s.input.context.price.amount > e.constraint.amount),
    );
    if (hard) {
      result.constraintViolation.denominator++;
      if (pred.decision === "ALLOW") {
        result.constraintViolation.numerator++;
        result.constraintViolation.cases.push(c.caseId);
      }
    }
    const groups = [
      s.input.cultural.status === "unavailable" ? "provider-unavailable" : null,
      applicable.length ? "explicit-constraint" : "cultural-evidence-only",
      applicable.some(
        (e) =>
          e.constraint?.kind === "MAX_PRICE" &&
          (!s.input.context.price ||
            s.input.context.price.currency !== e.constraint.currency),
      )
        ? "missing-context"
        : null,
    ].filter(Boolean);
    for (const g of groups)
      result.subgroups[g] ??= {
        responses: 0,
        cannotJudge: 0,
        exactDecisionAgreement: ratio(),
      };
    for (const r of responses) {
      const a = r.answers.find((a) => a.caseId === c.caseId);
      if (!a || !labelMap[a.choice]) throw Error("INVALID_PILOT_RESPONSE");
      const human = labelMap[a.choice];
      result.humanDecisionDistribution[human] =
        (result.humanDecisionDistribution[human] ?? 0) + 1;
      row.humanLabels[human] = (row.humanLabels[human] ?? 0) + 1;
      result.rawLabels[a.choice] = (result.rawLabels[a.choice] ?? 0) + 1;
      result.labelsByCase[c.caseId] ??= {};
      result.labelsByCase[c.caseId][a.choice] =
        (result.labelsByCase[c.caseId][a.choice] ?? 0) + 1;
      result.cannotJudge.denominator++;
      for (const g of groups) result.subgroups[g].responses++;
      if (human === "UNSCORABLE") {
        result.cannotJudge.count++;
        for (const g of groups) result.subgroups[g].cannotJudge++;
        if (s.input.cultural.status === "unavailable")
          result.cannotJudgeOnUnavailable++;
        continue;
      }
      if (c.evidence.status === "PARTICIPANT_EVIDENCE_UNREPRESENTABLE")
        continue;
      result.exactDecisionAgreement.denominator++;
      result.scorableJudgments++;
      row.scorableJudgments++;
      if (human !== pred.decision) row.disagreements++;
      for (const g of groups)
        result.subgroups[g].exactDecisionAgreement.denominator++;
      if (human === pred.decision) {
        result.exactDecisionAgreement.numerator++;
        for (const g of groups)
          result.subgroups[g].exactDecisionAgreement.numerator++;
      } else
        result.disagreementCases.push({
          caseId: c.caseId,
          human,
          system: pred.decision,
        });
      if (["ASK", "REJECT", "UNAVAILABLE"].includes(human)) {
        result.unsafeAutonomy.denominator++;
        if (pred.decision === "ALLOW") result.unsafeAutonomy.numerator++;
      }
      if (human === "ASK") {
        result.missedAsk.denominator++;
        if (pred.decision !== "ASK") {
          result.missedAsk.numerator++;
          result.missedAsk.bySystemResult[pred.decision]++;
        }
      }
      if (human === "ALLOW") {
        result.incorrectReject.denominator++;
        if (pred.decision === "REJECT") result.incorrectReject.numerator++;
      }
      if (human === "UNAVAILABLE") {
        result.unavailableAgreement.denominator++;
        if (pred.decision === "UNAVAILABLE")
          result.unavailableAgreement.numerator++;
      }
    }
  }
  result.cannotJudge.rate = result.cannotJudge.denominator
    ? result.cannotJudge.count / result.cannotJudge.denominator
    : null;
  return result;
}
const [op = "prepare", ...args] = process.argv.slice(2);
if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const packet = makePacket();
    if (op === "prepare") {
      await mkdir("public/win-gate", { recursive: true });
      await writeFile(
        "public/win-gate/pilot.json",
        JSON.stringify({ ...packet, packetHash: digest(packet) }, null, 2) +
          "\n",
      );
      await mkdir("docs/evaluation", { recursive: true });
      await writeFile(
        "docs/evaluation/win-gate-pilot-selection.json",
        JSON.stringify(
          {
            schemaVersion: "win-gate-pilot-selection-v3",
            status: "PARTICIPANT_UX_REPAIRED_READY_FOR_GUIDE_REVIEW",
            participantCount: 0,
            methodology:
              "SELECTION UNCHANGED — PRESENTATION METHODOLOGY REPAIRED BEFORE N>0.",
            sourceVersion: source.version,
            datasetHash: reference.datasetHash,
            packetHash: digest(packet),
            selection: cases.map((s, i) => ({
              caseId: packet.cases[i].caseId,
              sourceScenarioId: s.id,
              contentHash: s.contentHash,
              domain: s.input.candidate.type,
            })),
            rationale:
              "All held-out EVALUATION scenarios, six per domain. No post-result selection. Material evidence is visible; system answers and policy interpretations remain blinded.",
          },
          null,
          2,
        ) + "\n",
      );
      console.log(
        "PARTICIPANT_UX_REPAIRED — READY FOR GUIDE REVIEW; no participation claimed",
      );
    } else if (op === "report") {
      const [confirmationFile, runDir, ...files] = args;
      if (
        !confirmationFile ||
        !runDir ||
        !files.length ||
        files.length > 100 ||
        (await stat(confirmationFile)).size > 65536
      )
        throw Error();
      const confirmation = JSON.parse(await readFile(confirmationFile, "utf8")),
        responses = await Promise.all(
          files.map(async (f) => {
            if ((await stat(f)).size > 65536) throw Error();
            return JSON.parse(await readFile(f, "utf8"));
          }),
        );
      const ids = validateResponses(packet, responses);
      if (
        confirmation.assurance !==
          "OPERATOR_CONFIRMED_GENUINE_DISTINCT_HUMANS" ||
        !Array.isArray(confirmation.participantIds) ||
        confirmation.participantIds.length !== ids.size ||
        new Set(confirmation.participantIds).size !== ids.size ||
        confirmation.participantIds.some((id) => !ids.has(id))
      )
        throw Error();
      const { execFileSync } = await import("node:child_process");
      execFileSync(
        process.execPath,
        [
          "--experimental-transform-types",
          "--conditions=react-server",
          "--import",
          "./scripts/tastebench-imports.mjs",
          "./scripts/tastebench.ts",
          "report",
          runDir,
        ],
        { stdio: "ignore" },
      );
      const predictions = (
        await readFile(resolve(runDir, "predictions.jsonl"), "utf8")
      )
        .trim()
        .split("\n")
        .map(JSON.parse);
      const runManifest = JSON.parse(
        await readFile(resolve(runDir, "manifest.json"), "utf8"),
      );
      if (runManifest.dataset.datasetHash !== reference.datasetHash)
        throw Error();
      const stats = summarizeLabels(packet, responses, predictions);
      const report = {
        schemaVersion: "win-gate-human-pilot-report-v3",
        status:
          ids.size < 10
            ? "INCOMPLETE_BELOW_10_GENUINE_PARTICIPANTS"
            : "READY_FOR_GUIDE_INTERPRETATION",
        participantCount: ids.size,
        scenarioCount: cases.length,
        ...stats,
        receiptCompleteness:
          "Inspect captured run; not a human accuracy metric",
        runId: runManifest.runId,
        packetHash: digest(packet),
        limitations:
          "Pilot only, no population/statistical claim; operator-confirmed distinct participants, not identity verification. UNAVAILABLE is reported separately, never forced into human REJECT/ASK. No gold adjudication fabricated.",
      };
      console.log(JSON.stringify(report, null, 2));
    } else throw Error();
  } catch {
    console.error(
      "PILOT_OPERATION_REJECTED — inspect bounded schema, confirmation, packet/run hashes; no response/env dump.",
    );
    process.exitCode = 1;
  }
}
