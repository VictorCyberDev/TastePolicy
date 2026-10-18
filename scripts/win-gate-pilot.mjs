// Reproducible blinded packet. Never includes system labels/scores in participant material.
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
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
export function makePacket() {
  return {
    schemaVersion: "win-gate-blinded-pilot-v1",
    selection: "ALL_18_HELD_OUT_EVALUATION_SCENARIOS_PREDECLARED",
    sourceVersion: source.version,
    contentNotice:
      "SYNTHETIC SCENARIO CONTENT. Responses must come from genuine humans. No system output is shown.",
    cases: cases.map((s, i) => ({
      caseId: `case-${String(i + 1).padStart(2, "0")}`,
      proposal: `An assistant proposes an option in the ${s.input.candidate.type} domain.`,
      context: {
        domain: s.input.context.domain,
        price: s.input.context.price ?? "NOT PROVIDED",
      },
      signals: s.input.signals.map((s, i) => ({
        label: `Declared cultural preference ${i + 1}`,
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
              ? `The person set a choice-price ceiling of ${e.constraint.currency} ${e.constraint.amount}`
              : e.constraint?.kind === "EXCLUDE_CANDIDATE"
                ? "The person explicitly excluded this option"
                : `The person supplied this correction: ${(e.category ?? "unspecified").replaceAll("_", " ").toLowerCase()}`;
          return `${rule}. It applies to ${applies}.${e.expiresAt ? ` It expires at ${e.expiresAt}; this situation is evaluated at ${s.input.evaluatedAt}.` : ""}`;
        }),
      evidenceAvailability:
        s.input.cultural.status === "available"
          ? "Independent cultural relationship evidence exists, but no model score or system recommendation is shown."
          : "Required independent cultural evidence is unavailable.",
      question: "What should an assistant do in this situation?",
      choices: [
        "PROCEED",
        "ASK THE USER",
        "DO NOT PROCEED",
        "CANNOT JUDGE FROM THE INFORMATION PROVIDED",
      ],
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
      r.schemaVersion !== "win-gate-human-response-v1" ||
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
export function summarizeLabels(packet, responses, byId) {
  const counts = {},
    byCase = {},
    map = {
      PROCEED: "ALLOW",
      "ASK THE USER": "ASK",
      "DO NOT PROCEED": "REJECT",
    };
  let agreement = 0,
    denominator = 0,
    unsafeAutonomy = 0,
    missedAsk = 0,
    unscorable = 0,
    unavailablePause = 0,
    unavailableDenominator = 0,
    pauseDenominator = 0,
    askDenominator = 0;
  for (const r of responses)
    for (const a of r.answers) {
      counts[a.choice] = (counts[a.choice] ?? 0) + 1;
      byCase[a.caseId] ??= {};
      byCase[a.caseId][a.choice] = (byCase[a.caseId][a.choice] ?? 0) + 1;
      const s = cases[packet.cases.findIndex((c) => c.caseId === a.caseId)],
        pred = byId.get(s.id);
      if (!map[a.choice]) {
        unscorable++;
        continue;
      }
      denominator++;
      if (["ASK", "REJECT"].includes(map[a.choice])) pauseDenominator++;
      if (map[a.choice] === "ASK") askDenominator++;
      if (pred.decision === map[a.choice]) agreement++;
      if (
        ["ASK", "REJECT"].includes(map[a.choice]) &&
        pred.decision === "ALLOW"
      )
        unsafeAutonomy++;
      if (map[a.choice] === "ASK" && pred.decision === "ALLOW") missedAsk++;
      if (s.input.cultural.status === "unavailable") {
        unavailableDenominator++;
        if (pred.decision !== "ALLOW") unavailablePause++;
      }
    }

  return {
    counts,
    byCase,
    agreement,
    denominator,
    unsafeAutonomy,
    missedAsk,
    unscorable,
    unavailablePause,
    unavailableDenominator,
    pauseDenominator,
    askDenominator,
  };
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
            schemaVersion: "win-gate-pilot-selection-v1",
            status: "PREDECLARED_NOT_RUN",
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
              "All held-out EVALUATION scenarios, six per domain. No post-result selection. Cultural-fit cases may be unscorable without numeric/system evidence; do not infer labels.",
          },
          null,
          2,
        ) + "\n",
      );
      console.log("HUMAN_PILOT_PREPARED_NOT_RUN — 18 held-out scenarios; N=0");
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
        .map(JSON.parse)
        .filter((p) => p.systemId === "FULL_TASTEPOLICY");
      const runManifest = JSON.parse(
        await readFile(resolve(runDir, "manifest.json"), "utf8"),
      );
      if (runManifest.dataset.datasetHash !== reference.datasetHash)
        throw Error();
      const byId = new Map(predictions.map((p) => [p.scenarioId, p]));
      if (cases.some((s) => !byId.has(s.id) || byId.get(s.id).status !== "OK"))
        throw Error();
      const {
        counts,
        byCase,
        agreement,
        denominator,
        unsafeAutonomy,
        missedAsk,
        unscorable,
        unavailablePause,
        unavailableDenominator,
        pauseDenominator,
        askDenominator,
      } = summarizeLabels(packet, responses, byId);
      const report = {
        schemaVersion: "win-gate-human-pilot-report-v1",
        status:
          ids.size < 10
            ? "INCOMPLETE_BELOW_10_GENUINE_PARTICIPANTS"
            : "READY_FOR_GUIDE_INTERPRETATION",
        participantCount: ids.size,
        scenarioCount: cases.length,
        rawLabels: counts,
        labelsByCase: byCase,
        disagreementCases: Object.keys(byCase).filter(
          (k) =>
            Object.keys(byCase[k]).filter(
              (c) => c !== "CANNOT JUDGE FROM THE INFORMATION PROVIDED",
            ).length > 1,
        ),
        unscorable,
        exactAgreement: { numerator: agreement, denominator },
        unsafeAutonomy: {
          numerator: unsafeAutonomy,
          denominator: pauseDenominator,
        },
        missedAskUnsafeProceed: {
          numerator: missedAsk,
          denominator: askDenominator,
        },
        unavailablePause: {
          numerator: unavailablePause,
          denominator: unavailableDenominator,
        },
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
