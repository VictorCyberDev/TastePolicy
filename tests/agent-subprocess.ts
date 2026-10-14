// SYNTHETIC TEST DATA: dependency injection confined to this subprocess harness.
import { runAgentStdio } from "../scripts/agent-stdio";
import { syntheticReceipt } from "./receipt-presentation-fixture";
const r = syntheticReceipt();
await runAgentStdio(
  () => ({
    async resolve() {
      throw Error("Synthetic fixture does not resolve");
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
              entity: r.candidate,
              rawAffinity: r.qlooEvidence.rawAffinity,
              alignmentScore: r.alignmentScore,
              scale: r.qlooEvidence.scale,
              rank: 1,
              explainability: r.explainability,
            },
          ],
          provenance: r.qlooEvidence.provenance,
        },
      };
    },
  }),
  process.stdin,
  process.stdout,
  "synthetic",
);
