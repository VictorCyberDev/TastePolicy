import { Readable } from "node:stream";
import { readJsonBody, BodyReadFailure } from "@/server/taste/read-body";
import { record } from "@/lib/validation";
import { createAgentGateway } from "@/server/agent/gateway";
import type { QlooProvider } from "@/server/qloo/contracts";
export async function runAgentStdio(
  providerFactory: () => QlooProvider | Promise<QlooProvider>,
  input = process.stdin,
  output = process.stdout,
  evaluationSource: "live" | "synthetic" = "live",
) {
  let result: unknown;
  try {
    const body = Readable.toWeb(input) as ReadableStream<Uint8Array>;
    const raw = record(
      await readJsonBody(
        new Request("http://localhost/agent", {
          method: "POST",
          body,
          duplex: "half",
        } as RequestInit),
      ),
    );
    if (
      !raw ||
      typeof raw.operation !== "string" ||
      Object.keys(raw).some(
        (k) =>
          !["operation", "request", "receipt", "evidenceSource"].includes(k),
      )
    )
      result = { status: "error", code: "INVALID_INPUT" };
    else {
      const gateway = createAgentGateway(providerFactory);
      if (
        raw.operation === "evaluateTasteAction" &&
        Object.keys(raw).every((k) => ["operation", "request"].includes(k))
      ) {
        const evaluation = await gateway.evaluateTasteAction(raw.request);
        result =
          evaluation.status === "available"
            ? { ...evaluation, evidenceSource: evaluationSource }
            : evaluation;
      } else if (
        ["explainTasteDecision", "checkDecisionStability"].includes(
          raw.operation,
        ) &&
        Object.keys(raw).every((k) =>
          ["operation", "receipt", "evidenceSource"].includes(k),
        ) &&
        ["recorded", "synthetic"].includes(raw.evidenceSource as string)
      ) {
        const proof =
          raw.operation === "explainTasteDecision"
            ? gateway.explainTasteDecision(raw.receipt)
            : gateway.checkDecisionStability(raw.receipt);
        result =
          proof.status === "available"
            ? { ...proof, evidenceSource: raw.evidenceSource }
            : proof;
      } else result = { status: "error", code: "INVALID_INPUT" };
    }
  } catch (error) {
    result = {
      status: "error",
      code: error instanceof BodyReadFailure ? error.code : "INTERNAL_ERROR",
    };
  }
  output.write(JSON.stringify(result) + "\n");
  return result;
}
