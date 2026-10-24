# Google ADK. Server-side only. pip install "google-adk[mcp,a2a]"
import os
from google.adk.agents import Agent
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams
from google.adk.agents.remote_a2a_agent import AGENT_CARD_WELL_KNOWN_PATH, RemoteA2aAgent

HOST = "https://<your-host>"
tastepolicy_tools = McpToolset(
    connection_params=StreamableHTTPConnectionParams(
        url=f"{HOST}/api/mcp",
        headers={"Authorization": f"Bearer {os.environ['TASTEPOLICY_API_KEY']}"},
    ),
)
tastepolicy_agent = RemoteA2aAgent(
    name="tastepolicy",
    description="Preference authority.",
    agent_card=f"{HOST}{AGENT_CARD_WELL_KNOWN_PATH}",
)
root_agent = Agent(
    name="concierge",
    model="<your-model>",
    instruction="Before recommending a place, ask TastePolicy. UNAVAILABLE is not a rejection.",
    tools=[tastepolicy_tools],
)
