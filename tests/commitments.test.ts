// @vitest-environment node
import { it, expect } from "vitest";
import { canonicalize } from "@/lib/commit/jcs";
import {
  candidateMaterial,
  commitAuthority,
  commitCandidate,
  commitContext,
  contextMaterial,
  evaluationCommitments,
  COMMITMENT_FORMAT,
} from "@/lib/commit/commitments";

const cand = {
  id: "c-1",
  name: "Hotel Lisboa",
  type: "destination",
  address: "Rua 1",
};
const ctx = {
  key: "trip",
  domain: "destination",
  price: { amount: 120, currency: "USD" },
};
const C = (o: unknown) => commitCandidate(candidateMaterial(o)!);
const X = (o: unknown) => commitContext(contextMaterial(o)!);

it("RFC 8785 canonical form: the published example and key ordering", () => {
  const input = JSON.parse(
    '{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001],"string":"\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/","literals":[null,true,false]}',
  );
  expect(canonicalize(input)).toBe(
    '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}',
  );
  expect(canonicalize({ b: 1, a: { d: 1, c: 2 } })).toBe(
    '{"a":{"c":2,"d":1},"b":1}',
  );
  expect(canonicalize({ a: undefined, b: 1 })).toBe('{"b":1}');
  expect(() => canonicalize({ a: NaN })).toThrow();
  expect(() => canonicalize({ a: 1n })).toThrow();
});
it("commitments are stable across equivalent serializations and ignore presentation", () => {
  const a = C(cand);
  expect(a).toMatch(COMMITMENT_FORMAT);
  // key order, extra presentation fields, equivalent number spellings
  expect(
    C({
      address: "Rua 1",
      type: "destination",
      name: "Hotel Lisboa",
      id: "c-1",
      imageUrl: "https://cdn.example/x.png",
      displayRank: 3,
      animation: "fade",
    }),
  ).toBe(a);
  expect(X(ctx)).toBe(
    X({
      price: { currency: "USD", amount: 1.2e2 },
      domain: "destination",
      key: "trip",
      cardLayout: "wide",
    }),
  );
  expect(X(ctx)).toBe(
    X(
      JSON.parse(
        '{"key":"trip","domain":"destination","price":{"amount":120.0,"currency":"USD"}}',
      ),
    ),
  );
});
it("every material field changes the commitment", () => {
  const base = C(cand);
  for (const change of [
    { id: "c-2" },
    { name: "Hotel Porto" },
    { type: "place" },
    { address: "Rua 2" },
    { releaseYear: 2000 },
  ])
    expect(C({ ...cand, ...change })).not.toBe(base);
  const bx = X(ctx);
  for (const change of [
    { key: "trip2" },
    { domain: "place" },
    { price: { amount: 121, currency: "USD" } },
    { price: { amount: 120, currency: "EUR" } },
    { price: undefined },
  ])
    expect(X({ ...ctx, ...change })).not.toBe(bx);
});
it("domain separation: a candidate digest can never equal a context digest of the same bytes", () => {
  const same = { id: "x", name: "x", type: "place" };
  expect(commitCandidate(same)).not.toBe(
    commitContext(same as unknown as Parameters<typeof commitContext>[0]),
  );
});
it("normalization rejects malformed material instead of guessing", () => {
  for (const bad of [
    null,
    [],
    {},
    { ...cand, type: "movie" },
    { ...cand, id: "" },
    { ...cand, releaseYear: 1.5 },
    { ...cand, address: "" },
  ])
    expect(candidateMaterial(bad)).toBeNull();
  for (const bad of [
    null,
    { key: "a b", domain: "place" },
    { key: "a", domain: "x" },
    { ...ctx, price: { amount: -1, currency: "USD" } },
    { ...ctx, price: { amount: 1, currency: "usd" } },
    { ...ctx, price: { amount: NaN, currency: "USD" } },
  ])
    expect(contextMaterial(bad)).toBeNull();
});
it("authority commitment binds decision, state, policy, agent and requested action", () => {
  const base = {
    candidateCommitment: C(cand),
    contextCommitment: X(ctx),
    stateHash: "h",
    outcome: "ALLOW",
    policyVersion: 1,
    agentId: "a",
    requestedAction: null as string | null,
  };
  const a = commitAuthority(base);
  for (const change of [
    { stateHash: "h2" },
    { outcome: "ASK" },
    { policyVersion: 2 },
    { policyVersion: null },
    { agentId: "b" },
    { requestedAction: "RANK" },
  ])
    expect(commitAuthority({ ...base, ...change })).not.toBe(a);
  expect(evaluationCommitments(cand, ctx).candidate).toBe(
    base.candidateCommitment,
  );
  expect(() => evaluationCommitments({}, ctx)).toThrow();
});
