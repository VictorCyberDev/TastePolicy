// "TastePolicy Compatible v1" report: runs every suite against the reference
// adapter and prints one pass/fail table. Third parties run the same data with
// their own adapters (see docs/conformance/tastepolicy-compatible.md).
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { classifyAsk } from "@/lib/lease/ask";
import { reduce } from "@/lib/lease/machine";
import { CONTINUATION_ACTIONS } from "@/lib/platform/continuation-table";
import { validateIssuerMetadata } from "@/lib/attest/issuer-metadata";

const load = async (n) =>
  JSON.parse(
    await readFile(new URL(`../../conformance/${n}`, import.meta.url), "utf8"),
  );
const rows = [];
const record = (suite, id, ok, note = "") => rows.push({ suite, id, ok, note });

// 1. attestation vectors (signature, status, epoch, trust, replay, binding ...)
const att = spawnSync(
  process.execPath,
  [
    "--experimental-transform-types",
    "--import",
    new URL("../source-imports.mjs", import.meta.url).pathname,
    new URL("./run-attest.mjs", import.meta.url).pathname,
    "--strict-reasons",
  ],
  { encoding: "utf8" },
);
for (const line of att.stdout.split("\n")) {
  const m = /^(PASS|FAIL)\s+(\S+)/.exec(line);
  if (m)
    record("attestation", m[2], m[1] === "PASS", m[1] === "FAIL" ? line : "");
}
// 2. authority semantics
const sem = await load("authority-semantics-v1.json");
for (const c of sem.askClassification)
  record("ask-classification", c.id, classifyAsk(c.basis, c.rules) === c.kind);
for (const c of sem.continuation)
  record(
    "continuation",
    c.decision,
    JSON.stringify(CONTINUATION_ACTIONS[c.decision]) ===
      JSON.stringify(c.permitted),
  );
for (const c of sem.leaseSequences) {
  let s = null,
    rejected = false;
  try {
    for (const e of c.events) s = reduce(s, e);
  } catch {
    rejected = true;
  }
  const ok = c.expect.rejected
    ? rejected
    : !rejected && s.status === c.expect.status && s.epoch.n === c.expect.epoch;
  record("lease-semantics", c.id, ok);
}
// 3. issuer metadata
const meta = await load("issuer-metadata-vectors-v1.json");
for (const c of meta.cases) {
  const problems = validateIssuerMetadata(
    { ...meta.base, ...c.patch },
    meta.fetchedFrom,
  );
  record(
    "issuer-metadata",
    c.id,
    JSON.stringify([...problems].sort()) ===
      JSON.stringify([...c.problems].sort()),
    problems.join(","),
  );
}
const bySuite = {};
for (const r of rows) {
  (bySuite[r.suite] ??= { pass: 0, fail: 0 })[r.ok ? "pass" : "fail"]++;
  if (!r.ok) console.log(`FAIL ${r.suite}/${r.id} ${r.note}`);
}
console.log("\ntastepolicy-compatible-v1 (reference adapter)");
for (const [s, v] of Object.entries(bySuite))
  console.log(`  ${s.padEnd(20)} ${v.pass}/${v.pass + v.fail}`);
const failed = rows.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} FAILED` : `\nALL ${rows.length} PASSED`);
process.exit(failed ? 1 : 0);
