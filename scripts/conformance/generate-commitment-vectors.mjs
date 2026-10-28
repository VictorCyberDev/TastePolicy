// Writes conformance/commitment-vectors-v1.json. The canonical strings below are
// written BY HAND from RFC 8785 (sorted members, no whitespace, shortest number
// form); only the SHA-256 is computed here, with node:crypto, never with the
// product code. The runner then checks the product against these independent
// expectations.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const digest = (kind, canonical) =>
  "sha-256:" +
  createHash("sha256")
    .update(`tastepolicy/${kind}/v1\n${canonical}`, "utf8")
    .digest("base64url");
const v = (id, kind, input, canonical) => ({
  id,
  kind,
  input,
  canonical,
  preimage: `tastepolicy/${kind}/v1\n${canonical}`,
  commitment: digest(kind, canonical),
});
const cand = { id: "c-1", name: "Hotel Lisboa", type: "destination" };
const ctx = { key: "trip", domain: "destination" };
const out = {
  version: "tastepolicy-commitment-vectors-v1",
  description:
    "taste-commitments-v1: SHA-256 over the domain-separated RFC 8785 canonical form of the material candidate / context. `preimage` is the exact byte string hashed; `commitment` is `sha-256:` + base64url (no padding) of its digest.",
  vectors: [
    v(
      "C01",
      "candidate",
      cand,
      '{"id":"c-1","name":"Hotel Lisboa","type":"destination"}',
    ),
    v(
      "C02",
      "candidate",
      { ...cand, address: "Rua 1" },
      '{"address":"Rua 1","id":"c-1","name":"Hotel Lisboa","type":"destination"}',
    ),
    v(
      "C03",
      "candidate",
      { ...cand, releaseYear: 2001 },
      '{"id":"c-1","name":"Hotel Lisboa","releaseYear":2001,"type":"destination"}',
    ),
    v("X01", "context", ctx, '{"domain":"destination","key":"trip"}'),
    v(
      "X02",
      "context",
      { ...ctx, price: { amount: 120, currency: "USD" } },
      '{"domain":"destination","key":"trip","price":{"amount":120,"currency":"USD"}}',
    ),
    v(
      "X03",
      "context",
      { ...ctx, price: { amount: 99.5, currency: "EUR" } },
      '{"domain":"destination","key":"trip","price":{"amount":99.5,"currency":"EUR"}}',
    ),
  ],
  // Different spellings of the same material must give the same commitment
  // as the named vector (presentation fields are ignored; member order and
  // number spelling do not matter).
  equivalent: [
    {
      as: "C01",
      input: {
        type: "destination",
        name: "Hotel Lisboa",
        id: "c-1",
        imageUrl: "https://cdn.example/x.png",
        displayRank: 3,
      },
    },
    {
      as: "X02",
      input: {
        price: { currency: "USD", amount: 120.0 },
        domain: "destination",
        key: "trip",
        cardLayout: "wide",
      },
    },
    {
      as: "X02",
      rawJson:
        '{"key":"trip","domain":"destination","price":{"amount":1.2e2,"currency":"USD"}}',
    },
  ],
  // Each of these changes the material, so it must give a different commitment.
  different: [
    { from: "C01", input: { ...cand, id: "c-2" } },
    { from: "C01", input: { ...cand, name: "Hotel Porto" } },
    { from: "C01", input: { ...cand, type: "place" } },
    { from: "X02", input: { ...ctx, price: { amount: 121, currency: "USD" } } },
    { from: "X02", input: { ...ctx, price: { amount: 120, currency: "EUR" } } },
    {
      from: "X02",
      input: { ...ctx, key: "trip2", price: { amount: 120, currency: "USD" } },
    },
  ],
  // Not material: must be refused, never guessed.
  malformed: [
    { kind: "candidate", input: { ...cand, type: "movie" } },
    { kind: "candidate", input: { ...cand, id: "" } },
    { kind: "candidate", input: { ...cand, releaseYear: 1.5 } },
    { kind: "context", input: { key: "a b", domain: "place" } },
    {
      kind: "context",
      input: { ...ctx, price: { amount: -1, currency: "USD" } },
    },
    {
      kind: "context",
      input: { ...ctx, price: { amount: 1, currency: "usd" } },
    },
  ],
};
writeFileSync(
  new URL("../../conformance/commitment-vectors-v1.json", import.meta.url),
  JSON.stringify(out, null, 2) + "\n",
);
console.log("wrote conformance/commitment-vectors-v1.json");
