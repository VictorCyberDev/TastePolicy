// Fixed local M1.6 interface; one bounded child call, no Qloo/policy imports or retry.
import { readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { obey } from "./obey.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
try {
  const file = process.argv[2];
  if (!file || (await stat(file)).size > 16384) throw Error();
  const request = JSON.parse(await readFile(file, "utf8"));
  const child = spawn(
    process.execPath,
    [
      "--experimental-transform-types",
      "--conditions=react-server",
      "--import",
      "./scripts/source-imports.mjs",
      "./scripts/agent.mjs",
    ],
    { cwd: root, stdio: ["pipe", "pipe", "pipe"] },
  );
  let output = "";
  const deadline = setTimeout(() => child.kill(), 55000);
  child.stdout.on("data", (c) => {
    output += c;
    if (Buffer.byteLength(output) > 65536) child.kill();
  });
  child.stderr.resume();
  child.stdin.end(
    JSON.stringify({
      operation: "evaluateTasteAction",
      includeContinuation: true,
      request,
    }),
  );
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  clearTimeout(deadline);
  if (code !== 0 || output.length > 65536) throw Error();
  const result = JSON.parse(output);
  const trace = obey({
    status: result.status,
    data:
      result.status === "available"
        ? {
            decision: { outcome: result.data.decision.outcome },
            candidate: { name: result.data.candidate.name },
          }
        : undefined,
    continuation: result.continuation,
  });
  console.log(
    JSON.stringify({
      ...trace,
      evidenceSource: result.evidenceSource ?? "unavailable",
      receiptRef: result.status === "available" ? result.data.receiptId : null,
    }),
  );
} catch {
  console.log(
    JSON.stringify({
      status: "STOPPED_UNAVAILABLE",
      actions: [],
      automaticRetry: false,
      transactionPerformed: false,
    }),
  );
  process.exitCode = 1;
}
