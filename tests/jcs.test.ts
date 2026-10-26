// @vitest-environment node
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import { canonicalize, isWellFormed } from "@/lib/commit/jcs";
import { candidateMaterial, contextMaterial } from "@/lib/commit/commitments";

const vectors = JSON.parse(
  readFileSync("conformance/jcs-vectors-v1.json", "utf8"),
);
const fromHex = (h: string) => {
  const b = Buffer.from(h, "hex");
  return b.readDoubleBE(0);
};

it("RFC 8785 Appendix B: every IEEE-754 vector serializes to the published string", () => {
  expect(vectors.numbers.length).toBeGreaterThanOrEqual(20);
  for (const v of vectors.numbers)
    expect(canonicalize(fromHex(v.ieee754)), v.ieee754).toBe(v.canonical);
});
it("RFC 8785 Appendix B rows with no JSON form (NaN, Infinity) are refused", () => {
  for (const h of ["7fffffffffffffff", "7ff0000000000000", "fff0000000000000"])
    expect(() => canonicalize(fromHex(h)), h).toThrow("NOT_I_JSON");
});
it("RFC 8785 section 3.2.3: members sort by UTF-16 code units, not by code point or locale", () => {
  const out = canonicalize(vectors.sorting.input);
  const keys = [...(JSON.parse(out) && Object.keys(JSON.parse(out)))];
  // JSON.parse/Object.keys reorder integer-like keys, so check the text itself
  const positions = vectors.sorting.memberOrder.map((k: string) =>
    out.indexOf(JSON.stringify(k) + ":"),
  );
  expect(positions.every((p: number) => p >= 0)).toBe(true);
  expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  expect(keys).toHaveLength(7);
});
it("string serialization follows RFC 8785 section 3.2.2.2", () => {
  for (const s of vectors.strings)
    expect(canonicalize(s.value)).toBe(s.canonical);
});
it("input that is not I-JSON is refused with NOT_I_JSON, never dropped, repaired or guessed", () => {
  const cyc: Record<string, unknown> = {};
  cyc.self = cyc;
  // eslint-disable-next-line no-sparse-arrays -- the point of the case
  const sparse = [1, , 3];
  const cases: Record<string, unknown> = {
    J01: { a: undefined, b: 1 },
    J02: [1, undefined],
    J03: { a: NaN },
    J04: Infinity,
    J05: { a: -Infinity },
    J06: { a: BigInt(1) },
    J07: { a: () => 1 },
    J08: { a: Symbol("x") },
    J09: sparse,
    J10: "a\ud800b",
    J11: "a\udc00b",
    J12: { ["k\ud800"]: 1 },
    J13: { when: new Date(0) },
    J14: cyc,
  };
  expect(Object.keys(cases)).toEqual(
    vectors.refused.map((r: { id: string }) => r.id),
  );
  for (const [id, input] of Object.entries(cases))
    expect(() => canonicalize(input), id).toThrow(vectors.error);
  expect(() => canonicalize(undefined)).toThrow("NOT_I_JSON");
  expect(() => canonicalize(Object.create({ inherited: 1 }))).toThrow(
    "NOT_I_JSON",
  );
  expect(() => canonicalize({ [Symbol("s")]: 1 })).toThrow("NOT_I_JSON");
  // the refusal is not an accident of one path: well-formed neighbours pass
  expect(canonicalize({ a: null, b: [], c: {} })).toBe(
    '{"a":null,"b":[],"c":{}}',
  );
  expect(canonicalize(Object.create(null))).toBe("{}");
  expect(canonicalize("😀")).toBe('"😀"');
  expect(canonicalize(-0)).toBe("0");
});
it("well-formedness check agrees with String.prototype.isWellFormed where available", () => {
  for (const s of ["", "abc", "😀", "\ud83d", "\ude00", "\ude00\ud83d"])
    expect(isWellFormed(s)).toBe(
      typeof s.isWellFormed === "function" ? s.isWellFormed() : isWellFormed(s),
    );
});
it("commitment material with a lone surrogate is not committable (rejected, not hashed)", () => {
  const ok = { id: "c-1", name: "Hotel", type: "destination" };
  expect(candidateMaterial(ok)).not.toBeNull();
  expect(candidateMaterial({ ...ok, name: "Hot\ud800el" })).toBeNull();
  expect(candidateMaterial({ ...ok, address: "x\udc00" })).toBeNull();
  expect(
    contextMaterial({ key: "trip", domain: "destination" }),
  ).not.toBeNull();
  expect(
    contextMaterial({ key: "tr\ud800ip", domain: "destination" }),
  ).toBeNull();
});
