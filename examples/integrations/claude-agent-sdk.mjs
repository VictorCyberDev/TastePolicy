// Server-side only. Requires the Claude Agent SDK and an Anthropic credential.
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Ask TastePolicy whether this place fits my reviewed preferences.",
  options: {
    mcpServers: {
      tastepolicy: {
        type: "http",
        url: "https://<your-host>/api/mcp",
        headers: { Authorization: `Bearer ${process.env.TASTEPOLICY_API_KEY}` },
      },
    },
    allowedTools: ["mcp__tastepolicy__*"],
  },
})) {
  if (message.type === "result") console.log(message);
}
