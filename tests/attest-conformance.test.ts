// @vitest-environment node
import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import verify from "../scripts/conformance/reference-adapter";

const file = JSON.parse(
  readFileSync(
    new URL("../conformance/attestation-vectors-v1.json", import.meta.url),
    "utf8",
  ),
);
it("the committed conformance vectors pass the reference verifier, with the stated reasons", async () => {
  expect(file.version).toBe("tastepolicy-attestation-vectors-v1");
  expect(file.vectors.length).toBeGreaterThanOrEqual(35);
  const failures: string[] = [];
  for (const v of file.vectors) {
    const o = v.options ?? {};
    const out = await verify({
      presentation: v.presentation,
      audience: o.audience ?? file.context.audience,
      now: o.now ?? file.context.now + 10,
      nonce: o.nonce,
      trustedIssuers: {
        [file.context.issuer]: {
          jwks: file.context.jwks,
          vct: o.acceptedVct ?? [file.context.vct],
        },
      },
      statusLists: file.statusLists,
      seenJtis: o.seenJtis ?? [],
    });
    if (
      out.valid !== v.expect.valid ||
      (!v.expect.valid && out.reason !== v.expect.reason)
    )
      failures.push(`${v.id}: got ${out.valid}/${out.reason}`);
  }
  expect(failures).toEqual([]);
});
it("vector ids are unique, valid ones come first, and no private key material is committed", () => {
  const ids = file.vectors.map((v: { id: string }) => v.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(JSON.stringify(file)).not.toMatch(/"d":/);
  expect(
    file.vectors.filter((v: { expect: { valid: boolean } }) => v.expect.valid)
      .length,
  ).toBe(4);
});
