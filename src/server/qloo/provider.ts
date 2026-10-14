import "server-only";
import { serverEnvironment } from "@/lib/env/server";
import { createQlooTransport } from "./client";
import { createQlooAdapter } from "./adapter";
export function getQlooProvider() {
  return createQlooAdapter(
    createQlooTransport({
      apiKey: serverEnvironment.qlooApiKey,
      host: serverEnvironment.qlooHost,
    }),
    {
      host: serverEnvironment.qlooHost,
      scale: serverEnvironment.affinityScale,
    },
  );
}
