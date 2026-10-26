// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- assertions over loosely typed JSON responses */
// Regression tests for defects found by the independent security review.
import { afterEach, it, expect } from "vitest";
import { syntheticReceipt } from "./receipt-presentation-fixture";
import { evaluateWithPolicy } from "@/lib/policy/engine";
import { policyDocument } from "@/lib/policy/validation";
import { clientKey } from "@/server/platform/client-key";
import {
  DEFAULT_POLICY,
  type PolicyDocument,
  type SubjectiveAction,
} from "@/lib/policy/types";
import type { Context, StateEntry, StateVersion } from "@/lib/state/types";

const now = "2026-10-20T12:00:00.000Z",
  allow = syntheticReceipt(0.9),
  candidate = allow.candidate,
  ctx: Context = { key: "trip", domain: "destination" };
const state = (...entries: StateEntry[]): StateVersion => ({
  profileId: crypto.randomUUID(),
  stateVersion: 1,
  parentVersion: null,
  createdAt: now,
  mutationId: null,
  stateHash: "t",
  entries,
});
const run = (
  policy: PolicyDocument | null,
  requestedAction?: SubjectiveAction,
  agentId = "agent-a",
  overrides: Parameters<typeof evaluateWithPolicy>[0]["overrides"] = [],
) =>
  evaluateWithPolicy({
    state: state(),
    candidate,
    context: ctx,
    cultural: { status: "available", data: allow },
    agentId,
    now,
    policy,
    policyVersion: policy ? 1 : null,
    overrides,
    requestedAction,
    organization: { organizationId: "acme", maxAction: "SUGGEST" },
  });
const observe: PolicyDocument = {
  ...DEFAULT_POLICY,
  autonomy: { default: "OBSERVE", byDomain: {}, byAgent: {} },
};
afterEach(() => {
  delete process.env.VERCEL;
  delete process.env.TASTEPOLICY_TRUSTED_IP_HEADER;
});

it("the organization ceiling wins even when an earlier rule already made the answer ASK, so the owner cannot confirm past it", () => {
  const r = run(observe, "PRESENT_AS_SELECTED");
  expect([r.outcome, r.basis]).toEqual(["REJECT", "ACTION_CEILING"]);
  expect(r.rules[0]).toMatch(/^ORG_ACTION_CEILING:/);
  // and an override that would have turned that ASK into ALLOW does nothing
  const o = {
    overrideId: crypto.randomUUID(),
    effect: "ALLOW_THROUGH_ASK" as const,
    scope: { candidateId: candidate.id },
    createdAt: "2026-10-19T00:00:00.000Z",
    expiresAt: "2026-10-27T00:00:00.000Z",
  };
  expect(run(observe, "PRESENT_AS_SELECTED", "agent-a", [o]).outcome).toBe(
    "REJECT",
  );
  // within the organization ceiling the owner's own ASK is unchanged
  expect(run(observe, "SUGGEST").outcome).toBe("ASK");
});
it("agent-chosen names that collide with object prototype keys never resolve to inherited values", () => {
  const doc: PolicyDocument = {
    ...DEFAULT_POLICY,
    actions: { default: "SUGGEST", byDomain: {}, byAgent: {} },
  };
  for (const name of ["constructor", "toString", "hasOwnProperty"]) {
    const r = evaluateWithPolicy({
      state: state(),
      candidate,
      context: ctx,
      cultural: { status: "available", data: allow },
      agentId: name,
      now,
      policy: doc,
      policyVersion: 1,
      overrides: [],
      requestedAction: "RANK",
    });
    expect(r.action?.ceiling).toBe("SUGGEST");
    expect(r.action?.ceilingSource).toBe("DEFAULT");
  }
  expect(() =>
    policyDocument({
      schemaVersion: "taste-policy-v1",
      freshness: {},
      autonomy: JSON.parse(
        '{"default":"OBSERVE","byDomain":{},"byAgent":{"__proto__":"AUTONOMOUS"}}',
      ),
    }),
  ).toThrow();
});
it("client address keys: IPv6 callers share their /64, so rotating addresses inside it buys nothing", () => {
  process.env.VERCEL = "1";
  const k = (ip: string) =>
    clientKey(new Request("https://x.test", { headers: { "x-real-ip": ip } }));
  expect(k("2001:db8:aaaa:bbbb::1")).toBe(k("2001:db8:aaaa:bbbb:ffff:1:2:3"));
  expect(k("2001:db8:aaaa:bbbb::1")).not.toBe(k("2001:db8:aaaa:cccc::1"));
  expect(k("198.51.100.4")).toBe("198.51.100.4");
});
