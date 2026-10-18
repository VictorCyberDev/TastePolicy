// MCP 2025-06-18 local stdio. No remote MCP endpoint; operator-configured server credential only.
import { TastePolicyClient } from "../src/sdk/index.ts";
let client;
try {
  client = new TastePolicyClient(
    process.env.TASTEPOLICY_API_URL,
    process.env.TASTEPOLICY_API_KEY,
  );
} catch {
  process.stderr.write("TASTEPOLICY_MCP_NOT_CONFIGURED\n");
  process.exit(1);
}
const operations = {
  get_taste_passport: "passport",
  evaluate_taste_action: "evaluate",
  evaluate_shared_taste_action: "evaluate",
  get_authorization_receipt: "receipt",
  explain_taste_decision: "receipt",
  inspect_evaluation_status: "status",
};
const ref = { type: "string", pattern: "^tp_[a-f0-9]{48}$" };
const schemas = {
  passport: {
    type: "object",
    properties: {
      passportRef: ref,
      grantId: { type: "string", format: "uuid" },
    },
    required: ["passportRef"],
    additionalProperties: false,
  },
  receipt: {
    type: "object",
    properties: { evaluationRef: ref },
    required: ["evaluationRef"],
    additionalProperties: false,
  },
  status: {
    type: "object",
    properties: { evaluationRef: ref },
    required: ["evaluationRef"],
    additionalProperties: false,
  },
  evaluate: {
    type: "object",
    properties: {
      passportRef: ref,
      grantId: { type: "string", format: "uuid" },
      idempotencyKey: { type: "string", maxLength: 80 },
      proposal: {
        type: "object",
        properties: {
          agentId: { type: "string", maxLength: 64 },
          expectedStateVersion: { type: "integer", minimum: 0 },
          candidate: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              type: { enum: ["brand", "place", "destination"] },
              name: { type: "string", maxLength: 250 },
            },
            required: ["id", "type", "name"],
            additionalProperties: false,
          },
          context: {
            type: "object",
            properties: {
              key: { type: "string", maxLength: 64 },
              domain: { enum: ["brand", "place", "destination"] },
              price: {
                type: "object",
                properties: {
                  amount: { type: "number", minimum: 0 },
                  currency: { type: "string", pattern: "^[A-Z]{3}$" },
                },
                required: ["amount", "currency"],
                additionalProperties: false,
              },
            },
            required: ["key", "domain"],
            additionalProperties: false,
          },
        },
        required: ["agentId", "expectedStateVersion", "candidate", "context"],
        additionalProperties: false,
      },
    },
    required: ["passportRef", "idempotencyKey", "proposal"],
    additionalProperties: false,
  },
};
let initialized = false;
async function processLine(line) {
  let message;
  try {
    message = JSON.parse(line);
    if (message.jsonrpc !== "2.0" || typeof message.method !== "string")
      throw Error();
    if (message.id === undefined) return;
    let result;
    if (message.method === "initialize") {
      initialized = true;
      result = {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "tastepolicy", version: "1.0.0" },
      };
    } else if (!initialized) throw Error();
    else if (message.method === "ping") result = {};
    else if (message.method === "tools/list")
      result = {
        tools: Object.entries(operations).map(([name, op]) => ({
          name,
          description:
            "Cultural-only authorization under an authenticated developer credential; no execution authority.",
          inputSchema: schemas[op],
        })),
      };
    else if (message.method === "tools/call") {
      const name = message.params?.name;
      if (!Object.hasOwn(operations, name)) throw Error();
      try {
        const data = await client.call(
          operations[name],
          message.params.arguments,
        );
        result = { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch {
        result = {
          isError: true,
          content: [
            {
              type: "text",
              text: "TastePolicy access or evidence unavailable. No execution authority.",
            },
          ],
        };
      }
    } else throw Error();
    process.stdout.write(
      JSON.stringify({ jsonrpc: "2.0", id: message.id, result }) + "\n",
    );
  } catch {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: message?.id ?? null,
        error: { code: -32602, message: "Invalid TastePolicy MCP request." },
      }) + "\n",
    );
  }
}
let buffer = Buffer.alloc(0);
for await (const chunk of process.stdin) {
  buffer = Buffer.concat([buffer, chunk]);
  if (buffer.length > 16384) {
    process.exitCode = 1;
    break;
  }
  let end;
  while ((end = buffer.indexOf(10)) >= 0) {
    const line = buffer.subarray(0, end);
    buffer = buffer.subarray(end + 1);
    await processLine(line.toString("utf8"));
  }
}
