// One trusted local operation. No fixture mode or production fallback.
import { runAgentStdio } from "./agent-stdio.ts";
try {
  await runAgentStdio(async () => {
    const { getQlooProvider } = await import("../src/server/qloo/provider.ts");
    return getQlooProvider();
  });
} catch {
  // Retry-free sanitized failure; do not echo environment/provider errors.
  console.log(JSON.stringify({ status: "error", code: "INTERNAL_ERROR" }));
  process.exitCode = 2;
}
