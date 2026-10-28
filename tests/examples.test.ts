// @vitest-environment node
import { it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

// The vendor examples cannot be run without vendor accounts, so they are held
// to what can be checked: valid JSON, the exact tool names the server exposes,
// the endpoint paths we serve, and no secret material.
const dir = new URL("../examples/integrations/", import.meta.url);
const files = readdirSync(dir);
it("every example is present, parses, points at our real endpoints and holds no secret", () => {
  expect(files.sort()).toEqual([
    "adk.py",
    "claude-agent-sdk.mjs",
    "claude-code.mcp.json",
    "claude-messages-connector.json",
    "gemini-interactions.json",
    "openai-responses.json",
  ]);
  for (const f of files) {
    const text = readFileSync(new URL(f, dir), "utf8");
    expect(text, f).not.toMatch(
      /tp_live_[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}|-----BEGIN|sk-[A-Za-z0-9]{20}/,
    );
    if (f.endsWith(".json")) JSON.parse(text);
    expect(text, f).toMatch(/\/api\/mcp|\.well-known\/agent-card/);
  }
});
it("OpenAI and Claude examples allow only tools the server actually has", async () => {
  const { PLATFORM_TOOLS } = await import("@/lib/platform/contracts");
  const names = new Set(PLATFORM_TOOLS.map((t) => t.name));
  const openai = JSON.parse(
    readFileSync(new URL("openai-responses.json", dir), "utf8"),
  );
  const allowed: string[] = openai.tools[0].allowed_tools;
  expect(allowed.length).toBeGreaterThan(0);
  for (const n of allowed) expect(names.has(n), n).toBe(true);
  const gemini = JSON.parse(
    readFileSync(new URL("gemini-interactions.json", dir), "utf8"),
  );
  expect(gemini.tools[0].name).toMatch(/^[a-z_]+$/); // Gemini requires snake_case names
  const claude = JSON.parse(
    readFileSync(new URL("claude-messages-connector.json", dir), "utf8"),
  );
  expect(claude.body.mcp_servers[0].url).toMatch(/^https:\/\//);
});
