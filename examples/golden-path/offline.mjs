import assert from "node:assert/strict";
import { TastePolicyClient } from "@victorcyberdev/tastepolicy-sdk";
import {
  createSandbox,
  SANDBOX_PASSPORTS,
} from "@victorcyberdev/tastepolicy-sdk/sandbox";
import { authorityTool } from "./authority-tool.mjs";
const sandbox = createSandbox();
const client = new TastePolicyClient(sandbox.origin, sandbox.credential, {
  fetch: sandbox.fetch,
});
for (const outcome of ["ALLOW", "ASK", "REJECT", "UNAVAILABLE"]) {
  const t = authorityTool({
    client,
    passportRef: SANDBOX_PASSPORTS.own,
    agentId: "synthetic-demo",
    candidate: {
      id: "d0000000-0000-4000-8000-000000000001",
      name: "Sandbox " + outcome,
      type: "place",
    },
    context: { key: "offline", domain: "place" },
    operationId: "offline-" + outcome,
  });
  const r = await t.execute(
    {},
    { toolCallId: "offline-" + outcome, messages: [] },
  );
  assert.equal(r.decision, outcome);
  console.log(
    JSON.stringify({
      source: "SYNTHETIC_OFFLINE",
      decision: r.decision,
      continuation: r.continuation,
    }),
  );
}
