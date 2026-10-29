import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
const key = process.env.TASTEPOLICY_API_KEY;
if (!key)
  throw new Error("Configure a private server-side TastePolicy credential.");
const client = new Client({
  name: "tastepolicy-golden-path",
  version: "0.1.0",
});
try {
  await client.connect(
    new StreamableHTTPClientTransport(
      new URL("https://tastepolicy.vercel.app/api/mcp"),
      { requestInit: { headers: { Authorization: `Bearer ${key}` } } },
    ),
  );
  const tools = await client.listTools();
  const result = await client.callTool({
    name: "tastepolicy_capabilities",
    arguments: {},
  });
  if (result.isError)
    throw new Error("TastePolicy capability invocation failed");
  console.log(
    JSON.stringify({
      toolNames: tools.tools.map((t) => t.name),
      capabilityInvocation: "PASS",
    }),
  );
} finally {
  await client.close();
}
