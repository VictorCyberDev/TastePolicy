// @vitest-environment node
import { it, expect } from "vitest";
import { openApiDocument } from "@/lib/platform/openapi";
import { PLATFORM_TOOLS } from "@/lib/platform/contracts";
import { GET as card } from "@/app/.well-known/agent-card.json/route";
import { GET as prm } from "@/app/.well-known/oauth-protected-resource/api/mcp/route";

it("OpenAPI is generated from the shared contract and covers every REST operation", () => {
  const doc = openApiDocument("https://tastepolicy.test");
  expect(doc.openapi).toBe("3.1.0");
  const paths = Object.keys(doc.paths).sort();
  expect(paths).toEqual(
    [
      "attestation",
      "attestation-verify",
      "capabilities",
      "evaluate",
      "lease",
      "lease-checkpoint",
      "lease-release",
      "lease-resume",
      "lease-verify",
      "passport",
      "policy",
      "receipt",
      "status",
    ].map((o) => `/api/v1/${o}`),
  );
  const evalBody = JSON.stringify(doc.paths["/api/v1/evaluate"].post);
  expect(evalBody).toContain("idempotencyKey");
  expect(evalBody).toContain("TASTE_EVALUATE");
  expect(evalBody).toContain("never grants purchase");
  expect(new Set(PLATFORM_TOOLS.map((t) => t.op))).toEqual(
    new Set([
      "attestation",
      "attestation-verify",
      "capabilities",
      "evaluate",
      "lease",
      "lease-checkpoint",
      "lease-release",
      "lease-resume",
      "lease-verify",
      "passport",
      "policy",
      "receipt",
      "status",
    ]),
  );
});
it("discovery documents are public, cacheable and contain no credentials or user data", async () => {
  for (const r of [
    card(new Request("https://tastepolicy.test/.well-known/agent-card.json")),
    prm(
      new Request(
        "https://tastepolicy.test/.well-known/oauth-protected-resource/api/mcp",
      ),
    ),
  ]) {
    const text = JSON.stringify(await r.json());
    expect(r.headers.get("cache-control")).toContain("public");
    expect(text).not.toMatch(/tp_live_|tps_|passportRef":"tp_[a-f0-9]/);
  }
});
