// SYNTHETIC TEST DATA — provider injection exists only in this subprocess test harness.
import { runAgentStdio } from "../scripts/agent-stdio";
import { syntheticReceipt } from "./receipt-presentation-fixture";
const mode = process.argv[2];
const r = syntheticReceipt(
  mode === "ALLOW" ? 0.9 : mode === "REJECT" ? 0.2 : 0.7,
);
await runAgentStdio(
  () => ({
    resolve: async () => {
      throw Error();
    },
    entities: async () =>
      mode === "UNAVAILABLE"
        ? { status: "unavailable", reason: "timeout" }
        : { status: "available", data: [...r.inputSignals, r.candidate] },
    infer: async () => ({
      status: "available",
      data: {
        candidates: [
          {
            entity: r.candidate,
            rawAffinity: r.qlooEvidence.rawAffinity,
            alignmentScore: r.alignmentScore,
            scale: "unit",
            rank: 1,
            explainability: r.explainability,
          },
        ],
        provenance: r.qlooEvidence.provenance,
      },
    }),
  }),
  process.stdin,
  process.stdout,
  "synthetic",
);
