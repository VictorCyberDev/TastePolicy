// What TastePolicy can truthfully say about itself. Every "AVAILABLE" entry
// names the code and the test that back it; tests/product-truth.test.ts fails
// if a named file does not exist. Statuses change only with evidence: the
// hosted and vendor-connector entries stay NOT_VERIFIED until a recorded run.
export type Availability =
  "AVAILABLE" | "ROADMAP" | "NOT_IMPLEMENTED" | "NOT_VERIFIED";
export interface Capability {
  name: string;
  status: Availability;
  note: string;
  evidence: string[];
}
export const CAPABILITIES: Capability[] = [
  {
    name: "Decisions: allow, ask, reject, can't tell",
    status: "AVAILABLE",
    note: "One deterministic evaluator behind every door. Missing evidence is never a no.",
    evidence: ["src/server/state/policy.ts", "tests/state.test.ts"],
  },
  {
    name: "REST API, OpenAPI and TypeScript SDK",
    status: "AVAILABLE",
    note: "The SDK is a thin server-side client in this repository; it is not published to npm.",
    evidence: [
      "src/lib/platform/openapi.ts",
      "src/sdk/index.ts",
      "tests/openapi.test.ts",
    ],
  },
  {
    name: "Remote MCP server",
    status: "AVAILABLE",
    note: "Exercised with an MCP client library in tests. Not yet verified inside a hosted assistant.",
    evidence: ["src/server/platform/mcp.ts", "tests/mcp.test.ts"],
  },
  {
    name: "A2A agent card and authority-lifecycle extension",
    status: "AVAILABLE",
    note: "JSON-RPC binding, no streaming or push. Tested agent to agent in the repository; not verified with a third-party A2A product.",
    evidence: ["src/server/platform/a2a.ts", "tests/a2a-authority.test.ts"],
  },
  {
    name: "OAuth account linking for hosted assistants",
    status: "AVAILABLE",
    note: "Authorization code with PKCE, rotating refresh tokens, consent screen.",
    evidence: ["src/server/platform/oauth-service.ts", "tests/oauth.test.ts"],
  },
  {
    name: "Owner rules: freshness, autonomy, temporary permissions",
    status: "AVAILABLE",
    note: "Versioned, simulated before publishing, every answer carries the rule that decided it.",
    evidence: ["src/lib/policy/engine.ts", "tests/policy-engine.test.ts"],
  },
  {
    name: "How far an agent may go: suggest to present as selected",
    status: "AVAILABLE",
    note: "A five-step ladder per agent and kind of choice. Going further than your limit asks you.",
    evidence: ["src/lib/policy/types.ts", "tests/policy-ladder.test.ts"],
  },
  {
    name: "Extra care for sensitive kinds of choice",
    status: "AVAILABLE",
    note: "You mark a kind of choice as sensitive. TastePolicy does not infer sensitivity from content.",
    evidence: ["tests/policy-ladder.test.ts"],
  },
  {
    name: "Short permissions (leases) with owner approval",
    status: "AVAILABLE",
    note: "Event-sourced, expiring, pausing on drift. A missing fact needs a new evaluation, not an approval.",
    evidence: ["src/lib/lease/machine.ts", "tests/lease.test.ts"],
  },
  {
    name: "Choice and situation commitments",
    status: "AVAILABLE",
    note: "Canonical digests of the evaluated choice and situation. A change is noticed only if the agent presents the current one.",
    evidence: [
      "src/lib/commit/commitments.ts",
      "tests/lease-commitments.test.ts",
    ],
  },
  {
    name: "Verifiable proofs with selective disclosure",
    status: "AVAILABLE",
    note: "Signed, short-lived, holder-bindable. A proof from an ended period of authority never becomes valid again.",
    evidence: ["src/lib/attest/verify.ts", "tests/attest-service.test.ts"],
  },
  {
    name: "Third-party issuers",
    status: "AVAILABLE",
    note: "Discover, inspect, then explicitly trust. Discovery never grants trust. There is no web of trust.",
    evidence: ["src/lib/attest/federation.ts", "tests/attest-service.test.ts"],
  },
  {
    name: "One history of what happened",
    status: "AVAILABLE",
    note: "A derived, private timeline of questions, rules, permissions and proofs.",
    evidence: [
      "src/lib/timeline/authority-timeline.ts",
      "tests/timeline.test.ts",
    ],
  },
  {
    name: "Organization ceiling",
    status: "AVAILABLE",
    note: "One organization per deployment, set by the operator. It can only lower what a person allows. No admin console, no SSO or SCIM.",
    evidence: ["src/lib/policy/organization.ts", "tests/policy-ladder.test.ts"],
  },
  {
    name: "Working inside ChatGPT, Claude or Gemini",
    status: "NOT_VERIFIED",
    note: "Not claimed. Standards-based connection points exist; a recorded run in each product is required before this changes.",
    evidence: ["docs/developer/integrations.md"],
  },
  {
    name: "Gemini Enterprise A2A",
    status: "NOT_IMPLEMENTED",
    note: "Not supported.",
    evidence: [],
  },
  {
    name: "Publishing the SDK to npm",
    status: "ROADMAP",
    note: "Not done.",
    evidence: [],
  },
  {
    name: "Organization admin console, SSO, SCIM",
    status: "ROADMAP",
    note: "Not done.",
    evidence: [],
  },
  {
    name: "Payment, booking, purchase or any execution authority",
    status: "NOT_IMPLEMENTED",
    note: "By design. Allowed means preference authority only.",
    evidence: [],
  },
];
export const STATUS_LABEL: Record<Availability, string> = {
  AVAILABLE: "Available now",
  ROADMAP: "Roadmap",
  NOT_IMPLEMENTED: "Not implemented",
  NOT_VERIFIED: "Not yet verified",
};
