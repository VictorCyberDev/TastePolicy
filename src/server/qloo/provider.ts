import { measuredProvider } from "@/server/operations/metrics";
import "server-only";
import { serverEnvironment } from "@/lib/env/server";
import { createQlooTransport } from "./client";
import { createQlooAdapter } from "./adapter";
export function getQlooProvider(): import("./contracts").QlooProvider {
  const adapter = createQlooAdapter(
    createQlooTransport({
      apiKey: serverEnvironment.qlooApiKey,
      host: serverEnvironment.qlooHost,
    }),
    {
      host: serverEnvironment.qlooHost,
      scale: serverEnvironment.affinityScale,
    },
  );
  return {
    resolve: (q) => measuredProvider(() => adapter.resolve(q)),
    entities: (ids) => measuredProvider(() => adapter.entities(ids)),
    infer: (q) => measuredProvider(() => adapter.infer(q)),
  };
}
