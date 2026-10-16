import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { execFileSync } from "node:child_process";
import type {
  Dataset,
  AnnotationSet,
  DatasetManifest,
  Run,
} from "../benchmarks/tastebench/lib/types";
import {
  manifest,
  requireThat,
  validateAnnotations,
} from "../benchmarks/tastebench/lib/validate";
import {
  run,
  report,
  validateRun,
  validateStoredManifest,
} from "../benchmarks/tastebench/lib/run";
import {
  packet,
  annotationPacket,
  calibrationPacket,
  thresholdSensitivity,
} from "../benchmarks/tastebench/lib/packets";
const readBounded = async (p: string) => {
  requireThat(
    (await stat(p)).size <= 10 * 1024 * 1024,
    "TASTEBENCH_INPUT_TOO_LARGE",
  );
  return readFile(p, "utf8");
};
const json = async (p: string) => JSON.parse(await readBounded(p));
const jsonl = async (p: string) =>
  (await readBounded(p))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
async function main() {
  const [op = "validate", ...args] = process.argv.slice(2);
  const di = args.indexOf("--dataset");
  const root = resolve(
    di < 0 ? "benchmarks/tastebench/v1" : args.splice(di, 2)[1],
  );
  let dataset = (await json(root + "/scenarios/engineering.json")) as Dataset,
    annotations = (await json(
      root + "/annotations/empty.json",
    )) as AnnotationSet;
  const reference = (await json(
    root + "/manifests/engineering.json",
  )) as DatasetManifest;
  validateStoredManifest(reference, dataset, annotations);
  const ai = args.indexOf("--annotations");
  if (ai >= 0) {
    annotations = (await json(args.splice(ai, 2)[1])) as AnnotationSet;
    dataset = { ...dataset, annotationVersion: annotations.version };
    validateAnnotations(annotations, dataset.scenarios);
  }
  const m = manifest(dataset, annotations);
  if (op === "validate") {
    console.log(
      JSON.stringify({
        status: "VALID",
        datasetHash: m.datasetHash,
        scenarios: m.scenarioCount,
      }),
    );
    return;
  }
  const output = args[0];
  requireThat(output, "TASTEBENCH_OUTPUT_DIRECTORY_REQUIRED");
  const dest = resolve(output);
  requireThat(
    relative(resolve(".tastebench"), dest) !== "" &&
      !relative(resolve(".tastebench"), dest).startsWith("..") &&
      !relative(resolve(".tastebench"), dest).startsWith("/"),
    "TASTEBENCH_OUTPUT_MUST_BE_IGNORED_DIRECTORY",
  );
  const write = async (name: string, value: unknown) =>
    writeFile(dest + "/" + name, JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
    });
  if (op === "report") {
    const r: Run = {
      manifest: await json(dest + "/manifest.json"),
      predictions: await jsonl(dest + "/predictions.jsonl"),
      results: await jsonl(dest + "/scenario-results.jsonl"),
      metrics: await json(dest + "/metrics.json"),
    };
    const a =
      r.manifest.dataset.annotationHash === m.annotationHash
        ? annotations
        : ((await json(dest + "/annotations.json")) as AnnotationSet);
    validateRun({ ...dataset, annotationVersion: a.version }, a, r);
    requireThat(
      (await readFile(dest + "/summary.md", "utf8")) === report(r),
      "TASTEBENCH_REPORT_MISMATCH",
    );
    console.log("REPORT_RECONCILED");
    return;
  }
  await mkdir(resolve(".tastebench"), { recursive: true });
  await mkdir(dest, { recursive: false });
  if (op === "export") {
    await writeFile(
      dest + "/generic-ai.jsonl",
      dataset.scenarios
        .map((s) => JSON.stringify(packet(s, "GENERIC_AI")))
        .join("\n") + "\n",
      { flag: "wx" },
    );
    await writeFile(
      dest + "/llm-qloo.jsonl",
      dataset.scenarios
        .map((s) => JSON.stringify(packet(s, "LLM_QLOO")))
        .join("\n") + "\n",
      { flag: "wx" },
    );
    await writeFile(
      dest + "/annotation-packet.jsonl",
      dataset.scenarios
        .filter((s) => s.kind === "HUMAN")
        .map((s) => JSON.stringify(annotationPacket(s)))
        .join("\n") + "\n",
      { flag: "wx" },
    );
    console.log(
      "BLINDED_PACKETS_EXPORTED; engineering cases are not human annotation targets",
    );
    return;
  }
  if (op === "import-annotations") {
    const a = (await json(args[1])) as AnnotationSet;
    validateAnnotations(a, dataset.scenarios);
    await write("annotations.json", a);
    await write(
      "annotation-manifest.json",
      manifest({ ...dataset, annotationVersion: a.version }, a),
    );
    console.log("ANNOTATIONS_VALIDATED; operator must verify human provenance");
    return;
  }
  if (op === "calibration") {
    await write(
      "sensitivity.json",
      thresholdSensitivity(calibrationPacket(dataset.scenarios, annotations), {
        allowAbove: 0.8,
        rejectBelow: 0.5,
      }),
    );
    return;
  }
  requireThat(op === "run" || op === "contract", "TASTEBENCH_UNKNOWN_COMMAND");
  const external: Parameters<typeof run>[3] = {};
  if (args[1]) external.GENERIC_AI = await jsonl(args[1]);
  if (args[2]) external.LLM_QLOO = await jsonl(args[2]);
  const r = await run(
    dataset,
    annotations,
    {
      sha: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      dirty: !!execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
      }).trim(),
    },
    external,
  );
  await write("annotations.json", annotations);
  await write("manifest.json", r.manifest);
  await write("metrics.json", r.metrics);
  await writeFile(
    dest + "/predictions.jsonl",
    r.predictions.map((p) => JSON.stringify(p)).join("\n") + "\n",
    { flag: "wx" },
  );
  await writeFile(
    dest + "/scenario-results.jsonl",
    r.results.map((p) => JSON.stringify(p)).join("\n") + "\n",
    { flag: "wx" },
  );
  await writeFile(dest + "/summary.md", report(r), { flag: "wx" });
  if (op === "contract")
    requireThat(
      r.results.every(
        (v) =>
          v.contractMatch !== false &&
          v.replay.mismatches === 0 &&
          v.stability.every((p) => p.matches) &&
          (!v.interaction || v.interaction.matches) &&
          (!v.feedback || v.feedback.matches),
      ),
      "TASTEBENCH_CONTRACT_FAILED",
    );
  console.log(
    JSON.stringify({
      status: "COMPLETE",
      runId: r.manifest.runId,
      semanticHash: r.manifest.semanticHash,
      artifactHashes: r.manifest.artifactHashes,
      blocked: r.manifest.blocked,
    }),
  );
}
main().catch(() => {
  console.error(
    "TASTEBENCH_OPERATION_FAILED — check schema, file hashes, split isolation and command arguments. No input/env dump.",
  );
  process.exitCode = 1;
});
