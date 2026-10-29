import { tool, generateText } from "ai";
import { z } from "zod";
// The application binds the owner, agent, reviewed candidate and context before
// exposing this tool. The model cannot supply another owner's Passport.
export function authorityTool({
  client,
  passportRef,
  agentId,
  candidate,
  context,
  operationId,
}) {
  return tool({
    description:
      "Check the owner's authority boundary for the application-bound reviewed choice. ALLOW permits only listed subjective actions; ASK requires resolution; REJECT stops; UNAVAILABLE pauses. Never payment, booking, messaging, account or legal authority.",
    inputSchema: z.strictObject({}),
    execute: async () => {
      const passport = await client.passport({ passportRef });
      return client.evaluate({
        passportRef,
        idempotencyKey: operationId,
        requestedAction: "SHORTLIST",
        proposal: {
          agentId,
          expectedStateVersion: passport.stateVersion,
          candidate,
          context,
        },
      });
    },
  });
}
// Supply an enabled model ID from your current AI Gateway catalog. This helper
// is not invoked by the offline example and makes no model call on import.
export async function askModel(boundChoice, model, prompt) {
  return generateText({
    model,
    tools: { tastepolicy: authorityTool(boundChoice) },
    toolApproval: { tastepolicy: "user-approval" },
    prompt,
  });
}
