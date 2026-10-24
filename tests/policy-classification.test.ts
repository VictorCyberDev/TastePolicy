// @vitest-environment node
import { it, expect } from "vitest";
import {
  classifyPolicyChange as classify,
  widensAuthority,
} from "@/lib/policy/composition";
import { DEFAULT_POLICY, type PolicyDocument } from "@/lib/policy/types";

const doc = (
  autonomy: Partial<PolicyDocument["autonomy"]>,
  freshness: PolicyDocument["freshness"] = {},
): PolicyDocument => ({
  ...DEFAULT_POLICY,
  freshness,
  autonomy: { default: "AUTONOMOUS", byDomain: {}, byAgent: {}, ...autonomy },
});
const limit = (amount: number, currency = "USD") => ({ amount, currency });
const confirm = (l?: { amount: number; currency: string }) =>
  doc({ default: "CONFIRM_ABOVE_LIMIT", ...(l ? { limit: l } : {}) });

it("default, domain and per-agent autonomy are compared by effective behaviour", () => {
  const open = doc({}),
    strict = doc({ default: "OBSERVE" });
  expect(classify(open, strict)).toBe("TIGHTEN");
  expect(classify(strict, open)).toBe("LOOSEN");
  expect(classify(strict, strict)).toBe("NONE");
  // an exception for one kind of choice
  expect(
    classify(
      strict,
      doc({ default: "OBSERVE", byDomain: { place: "AUTONOMOUS" } }),
    ),
  ).toBe("LOOSEN");
  expect(classify(open, doc({ byDomain: { place: "OBSERVE" } }))).toBe(
    "TIGHTEN",
  );
  // an exception for one agent
  expect(
    classify(strict, doc({ default: "OBSERVE", byAgent: { a: "AUTONOMOUS" } })),
  ).toBe("LOOSEN");
  expect(classify(open, doc({ byAgent: { a: "OBSERVE" } }))).toBe("TIGHTEN");
  // an agent rule overrides the domain rule: tightening the domain does not tighten that agent
  const agentOpen = doc({ default: "OBSERVE", byAgent: { a: "AUTONOMOUS" } });
  expect(
    classify(
      agentOpen,
      doc({
        default: "OBSERVE",
        byDomain: { place: "OBSERVE" },
        byAgent: { a: "AUTONOMOUS" },
      }),
    ),
  ).toBe("NONE");
  // removing an agent exception tightens
  expect(classify(agentOpen, doc({ default: "OBSERVE" }))).toBe("TIGHTEN");
});
it("limits and currencies", () => {
  expect(classify(confirm(limit(100)), confirm(limit(50)))).toBe("TIGHTEN");
  expect(classify(confirm(limit(100)), confirm(limit(500)))).toBe("LOOSEN");
  // adding a limit lets some prices act without asking; removing one makes every price ask
  expect(classify(confirm(), confirm(limit(100)))).toBe("LOOSEN");
  expect(classify(confirm(limit(100)), confirm())).toBe("TIGHTEN");
  // a currency change both admits and excludes: never safe
  expect(classify(confirm(limit(100)), confirm(limit(100, "EUR")))).toBe(
    "MIXED",
  );
});
it("freshness windows: longer or removed is looser, shorter or added is tighter", () => {
  const f = (days?: number) =>
    doc({}, days === undefined ? {} : { EXPLICIT_POSITIVE: days });
  expect(classify(f(30), f(90))).toBe("LOOSEN");
  expect(classify(f(30), f())).toBe("LOOSEN");
  expect(classify(f(90), f(30))).toBe("TIGHTEN");
  expect(classify(f(), f(30))).toBe("TIGHTEN");
  expect(classify(f(30), f(30))).toBe("NONE");
});
it("a mix of tightening and loosening is MIXED and counts as widening; no earlier policy is the open default", () => {
  const before = doc({ default: "OBSERVE" }, { EXPLICIT_POSITIVE: 30 });
  const after = doc({ default: "AUTONOMOUS" }, { EXPLICIT_POSITIVE: 7 });
  expect(classify(before, after)).toBe("MIXED");
  expect(widensAuthority("MIXED")).toBe(true);
  expect(widensAuthority("LOOSEN")).toBe(true);
  expect(widensAuthority("TIGHTEN")).toBe(false);
  expect(widensAuthority("NONE")).toBe(false);
  expect(classify(null, doc({ default: "OBSERVE" }))).toBe("TIGHTEN");
  expect(classify(null, doc({}))).toBe("NONE");
});
