// Generates conformance/attestation-vectors-v1.json. Keys are test-only and
// regenerated each run; the committed file is the artefact verifiers test against.
import { writeFile } from "node:fs/promises";
import {
  CompactSign,
  base64url,
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  type JWK,
} from "jose";
import { issueAttestation, signStatusList, VCT } from "@/lib/attest/issue";
import {
  issueSdJwt,
  parseCompact,
  present,
  type Signer,
} from "@/lib/attest/sdjwt";
import {
  emptyList,
  encodeList,
  setStatus,
  STATUS,
} from "@/lib/attest/status-list";

const ISS = "https://issuer.conformance.test",
  ISS2 = "https://untrusted.conformance.test",
  AUD = "https://verifier.conformance.test",
  NOW = 1_800_000_000,
  STATUS_BASE = `${ISS}/status/`;
async function keys(): Promise<{ signer: Signer; jwk: JWK }> {
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const jwk = await exportJWK(publicKey),
    kid = await calculateJwkThumbprint(jwk);
  return {
    signer: { key: privateKey, alg: "ES256", kid },
    jwk: { ...jwk, kid, alg: "ES256", use: "sig" },
  };
}
const issuer = await keys(),
  other = await keys(),
  holder = await keys(),
  thief = await keys();
const statusLists: Record<string, string> = {};
async function list(
  name: string,
  statuses: Record<number, number> = {},
  over: { signer?: Signer; sub?: string; now?: number; ttl?: number } = {},
) {
  const l = emptyList(1024, 2);
  for (const [i, v] of Object.entries(statuses)) setStatus(l, Number(i), 2, v);
  const uri = STATUS_BASE + name;
  statusLists[uri] = await signStatusList(
    {
      issuer: ISS,
      uri: over.sub ?? uri,
      now: over.now ?? NOW,
      ttlSeconds: over.ttl ?? 60,
      bits: 2,
      list: l,
    },
    over.signer ?? issuer.signer,
  );
  return uri;
}
const base = (
  statusUri: string,
  idx: number,
  extra: Record<string, unknown> = {},
) => ({
  issuer: ISS,
  audience: AUD,
  now: NOW,
  leaseExpiresAt: NOW + 3600,
  jti: base64url.encode(crypto.getRandomValues(new Uint8Array(12))),
  epochRef: base64url.encode(crypto.getRandomValues(new Uint8Array(16))),
  statusUri,
  statusIdx: idx,
  disclosable: {
    decision: "ALLOW" as const,
    permitted: ["recommend", "add_to_draft"],
    candidate_id: "candidate-1",
    candidate_name: "Example Cafe",
    context_key: "dinner",
    agent_id: "agent-a",
    lease_ref: "tl_" + "a".repeat(48),
    subject_ref: "tps_" + "b".repeat(48),
    policy: { version: 1 },
  },
  ...extra,
});
const okList = await list("ok", {}),
  invalidList = await list("invalid", { 5: STATUS.INVALID }),
  suspendedList = await list("suspended", { 5: STATUS.SUSPENDED });
type V = {
  id: string;
  description: string;
  presentation: string;
  options?: Record<string, unknown>;
  expect: { valid: boolean; reason?: string };
};
const vectors: V[] = [];
const add = (
  id: string,
  description: string,
  presentation: string,
  expect: V["expect"],
  options?: V["options"],
) =>
  vectors.push({
    id,
    description,
    presentation,
    expect,
    ...(options ? { options } : {}),
  });
const full = (await issueAttestation(base(okList, 5), issuer.signer)).compact;
const parts = parseCompact(full);

add("V01-valid-full", "All claims disclosed", full, { valid: true });
add(
  "V02-valid-minimal",
  "Only decision and candidate disclosed",
  await present(full, ["decision", "candidate_id"]),
  { valid: true },
);
add(
  "V03-valid-none",
  "No selective claims disclosed",
  await present(full, []),
  { valid: true },
);
const bound = (
  await issueAttestation(
    base(okList, 6, { holderKey: holder.jwk }),
    issuer.signer,
  )
).compact;
add(
  "V04-valid-key-bound",
  "Holder key bound with a correct key-binding JWT",
  await present(bound, ["decision"], {
    signer: holder.signer,
    nonce: "nonce-1",
    aud: AUD,
    iat: NOW + 5,
  }),
  { valid: true },
  { nonce: "nonce-1" },
);

add(
  "N01-expired",
  "exp in the past",
  (
    await issueAttestation(
      base(okList, 7, { leaseExpiresAt: NOW + 30 }),
      issuer.signer,
    )
  ).compact,
  { valid: false, reason: "EXPIRED" },
  { now: NOW + 1000 },
);
add(
  "N02-not-yet-valid",
  "iat far in the future",
  full,
  { valid: false, reason: "NOT_YET_VALID" },
  { now: NOW - 3600 },
);
add(
  "N03-wrong-audience",
  "Presented to a different audience",
  full,
  { valid: false, reason: "AUDIENCE_MISMATCH" },
  { audience: "https://other.conformance.test" },
);
add(
  "N04-untrusted-issuer",
  "Valid signature from an issuer not in the trust list",
  (await issueAttestation(base(okList, 8, { issuer: ISS2 }), other.signer))
    .compact,
  { valid: false, reason: "ISSUER_UNTRUSTED" },
);
add(
  "N05-bad-signature",
  "Payload altered after signing",
  `${parts.jwt.split(".")[0]}.${base64url.encode(JSON.stringify({ ...JSON.parse(Buffer.from(parts.jwt.split(".")[1], "base64url").toString()), exp: NOW + 99999 }))}.${parts.jwt.split(".")[2]}~${parts.disclosures.join("~")}~`,
  { valid: false, reason: "SIGNATURE_INVALID" },
);
add(
  "N06-alg-none",
  "alg none",
  `${base64url.encode(JSON.stringify({ alg: "none", typ: "dc+sd-jwt" }))}.${parts.jwt.split(".")[1]}.~`,
  { valid: false, reason: "ALG_NOT_ALLOWED" },
);
add(
  "N07-alg-hs256",
  "Symmetric algorithm",
  `${base64url.encode(JSON.stringify({ alg: "HS256", typ: "dc+sd-jwt", kid: issuer.signer.kid }))}.${parts.jwt.split(".")[1]}.${base64url.encode("x")}~`,
  { valid: false, reason: "ALG_NOT_ALLOWED" },
);
add(
  "N08-wrong-typ",
  "typ is JWT instead of dc+sd-jwt",
  `${await new CompactSign(Buffer.from(Buffer.from(parts.jwt.split(".")[1], "base64url"))).setProtectedHeader({ alg: "ES256", typ: "JWT", kid: issuer.signer.kid }).sign(issuer.signer.key as never)}~`,
  { valid: false, reason: "TYP_INVALID" },
);
add(
  "N09-wrong-vct",
  "vct not accepted",
  full,
  { valid: false, reason: "VCT_NOT_ACCEPTED" },
  { acceptedVct: ["urn:other"] },
);
const noAuthority = await issueSdJwt({
  signer: issuer.signer,
  typ: "dc+sd-jwt",
  visible: {
    iss: ISS,
    aud: AUD,
    iat: NOW,
    exp: NOW + 600,
    jti: "no-authority-1",
    vct: VCT,
    status: { status_list: { idx: 9, uri: okList } },
  },
  disclosable: { decision: "ALLOW" },
});
const noEpoch = await issueSdJwt({
  signer: issuer.signer,
  typ: "dc+sd-jwt",
  visible: {
    iss: ISS,
    aud: AUD,
    iat: NOW,
    exp: NOW + 600,
    jti: "no-epoch-1",
    vct: VCT,
    authority: "CULTURAL_ONLY",
    status: { status_list: { idx: 9, uri: okList } },
  },
  disclosable: { decision: "ALLOW" },
});
add(
  "N36-epoch-missing",
  "Authority epoch reference absent: a proof must belong to exactly one epoch",
  noEpoch.compact,
  { valid: false, reason: "EPOCH_MISSING" },
);
add(
  "N10-authority-missing",
  "Cultural-only authority statement absent",
  noAuthority.compact,
  { valid: false, reason: "AUTHORITY_MISSING" },
);
add(
  "N11-disclosure-tampered",
  "A disclosure value was altered",
  `${parts.jwt}~${base64url.encode(Buffer.from(base64url.decode(parts.disclosures[0])).toString().replace("ALLOW", "BLOCK"))}~`,
  { valid: false, reason: "DISCLOSURE_UNREFERENCED" },
);
add(
  "N12-disclosure-duplicate",
  "The same disclosure presented twice",
  `${parts.jwt}~${parts.disclosures[0]}~${parts.disclosures[0]}~`,
  { valid: false, reason: "DISCLOSURE_DUPLICATE" },
);
add(
  "N13-disclosure-unreferenced",
  "A disclosure the issuer never signed",
  `${parts.jwt}~${base64url.encode(JSON.stringify(["salt", "extra", 1]))}~`,
  { valid: false, reason: "DISCLOSURE_UNREFERENCED" },
);
add(
  "N14-status-invalid",
  "Status list says INVALID",
  (await issueAttestation(base(invalidList, 5), issuer.signer)).compact,
  { valid: false, reason: "STATUS_INVALID" },
);
add(
  "N15-status-suspended",
  "Status list says SUSPENDED",
  (await issueAttestation(base(suspendedList, 5), issuer.signer)).compact,
  { valid: false, reason: "STATUS_SUSPENDED" },
);
add(
  "N16-status-index-out-of-range",
  "Index beyond the list",
  (await issueAttestation(base(okList, 5000), issuer.signer)).compact,
  { valid: false, reason: "STATUS_INDEX_OUT_OF_RANGE" },
);
const forgedList = await list("forged", {}, { signer: other.signer });
add(
  "N17-status-list-forged",
  "Status list signed by a different key",
  (await issueAttestation(base(forgedList, 5), issuer.signer)).compact,
  { valid: false, reason: "STATUS_LIST_INVALID" },
);
const wrongSub = await list(
  "wrongsub",
  {},
  { sub: STATUS_BASE + "something-else" },
);
add(
  "N18-status-list-wrong-sub",
  "Status list sub does not equal the referenced uri",
  (await issueAttestation(base(wrongSub, 5), issuer.signer)).compact,
  { valid: false, reason: "STATUS_LIST_INVALID" },
);
const staleList = await list("stale", {}, { now: NOW - 100000, ttl: 1 });
add(
  "N19-status-list-expired",
  "Status list token expired",
  (await issueAttestation(base(staleList, 5), issuer.signer)).compact,
  { valid: false, reason: "STATUS_LIST_INVALID" },
);
const noStatus = await issueSdJwt({
  signer: issuer.signer,
  typ: "dc+sd-jwt",
  visible: {
    iss: ISS,
    aud: AUD,
    iat: NOW,
    exp: NOW + 600,
    jti: "no-status-001",
    vct: VCT,
    authority: "CULTURAL_ONLY",
    authority_epoch: "E".repeat(22),
  },
  disclosable: { decision: "ALLOW" },
});
add("N20-status-missing", "No status reference", noStatus.compact, {
  valid: false,
  reason: "STATUS_MISSING",
});
add(
  "N21-kb-missing",
  "Key-bound attestation presented without a key-binding JWT",
  await present(bound, ["decision"]),
  { valid: false, reason: "KB_REQUIRED" },
  { nonce: "nonce-1" },
);
add(
  "N22-kb-wrong-nonce",
  "Key-binding nonce differs from the verifier's challenge",
  await present(bound, ["decision"], {
    signer: holder.signer,
    nonce: "nonce-2",
    aud: AUD,
    iat: NOW + 5,
  }),
  { valid: false, reason: "KB_NONCE_MISMATCH" },
  { nonce: "nonce-1" },
);
add(
  "N23-kb-wrong-audience",
  "Key-binding audience differs",
  await present(bound, ["decision"], {
    signer: holder.signer,
    nonce: "nonce-1",
    aud: "https://other.conformance.test",
    iat: NOW + 5,
  }),
  { valid: false, reason: "KB_AUDIENCE_MISMATCH" },
  { nonce: "nonce-1" },
);
const kbPres = await present(bound, ["decision", "candidate_id"], {
  signer: holder.signer,
  nonce: "nonce-1",
  aud: AUD,
  iat: NOW + 5,
});
const kbParts = parseCompact(kbPres);
add(
  "N24-kb-sd-hash-mismatch",
  "Disclosures changed after the key-binding JWT was made",
  `${kbParts.jwt}~${kbParts.disclosures[0]}~${kbParts.kb}`,
  { valid: false, reason: "KB_SD_HASH_MISMATCH" },
  { nonce: "nonce-1" },
);
add(
  "N25-kb-wrong-holder",
  "Key-binding JWT signed by a different key",
  await present(bound, ["decision"], {
    signer: thief.signer,
    nonce: "nonce-1",
    aud: AUD,
    iat: NOW + 5,
  }),
  { valid: false, reason: "KB_INVALID" },
  { nonce: "nonce-1" },
);
const replayed = await issueAttestation(base(okList, 10), issuer.signer);
const replayJti = JSON.parse(
  Buffer.from(replayed.compact.split(".")[1], "base64url").toString(),
).jti;
add(
  "N26-replay",
  "The jti was already accepted for this audience",
  replayed.compact,
  { valid: false, reason: "REPLAY" },
  { seenJtis: [replayJti] },
);
add(
  "N27-header-jwk-injection",
  "Attacker supplies a jwk header",
  `${await new CompactSign(Buffer.from(parts.jwt.split(".")[1], "base64url")).setProtectedHeader({ alg: "ES256", typ: "dc+sd-jwt", kid: other.signer.kid, jwk: other.jwk }).sign(other.signer.key as never)}~`,
  { valid: false, reason: "ALG_NOT_ALLOWED" },
);
const bomb = new CompactSign(
  new TextEncoder().encode(
    JSON.stringify({
      iss: ISS,
      sub: STATUS_BASE + "bomb",
      iat: NOW,
      exp: NOW + 600,
      status_list: {
        bits: 2,
        lst: encodeList(new Uint8Array(8 * 1024 * 1024)),
      },
    }),
  ),
);
statusLists[STATUS_BASE + "bomb"] = await bomb
  .setProtectedHeader({
    alg: "ES256",
    typ: "statuslist+jwt",
    kid: issuer.signer.kid,
  })
  .sign(issuer.signer.key as never);
add(
  "N28-status-list-bomb",
  "Status list inflates beyond the allowed size",
  (await issueAttestation(base(STATUS_BASE + "bomb", 5), issuer.signer))
    .compact,
  { valid: false, reason: "STATUS_LIST_INVALID" },
);
const sameKid = { ...other.signer, kid: issuer.signer.kid };
add(
  "N29-key-confusion",
  "Signed by another key that claims the trusted kid",
  (await issueAttestation(base(okList, 11), sameKid)).compact,
  { valid: false, reason: "SIGNATURE_INVALID" },
);
const tooLong = await issueSdJwt({
  signer: issuer.signer,
  typ: "dc+sd-jwt",
  visible: {
    iss: ISS,
    aud: AUD,
    iat: NOW,
    exp: NOW + 7200,
    jti: "too-long-0001",
    vct: VCT,
    authority: "CULTURAL_ONLY",
    authority_epoch: "E".repeat(22),
    status: { status_list: { idx: 12, uri: okList } },
  },
  disclosable: { decision: "ALLOW" },
});
add(
  "N31-lifetime-too-long",
  "exp - iat exceeds the profile maximum of one hour",
  tooLong.compact,
  { valid: false, reason: "LIFETIME_TOO_LONG" },
);
add("N30-malformed", "Not an SD-JWT", "this-is-not-a-token", {
  valid: false,
  reason: "MALFORMED",
});

await writeFile(
  new URL("../../conformance/attestation-vectors-v1.json", import.meta.url),
  JSON.stringify(
    {
      version: "tastepolicy-attestation-vectors-v1",
      profile:
        "TastePolicy attestation profile v1 (SD-JWT RFC 9901; claims per SD-JWT VC draft-ietf-oauth-sd-jwt-vc-19; status per draft-ietf-oauth-status-list-21)",
      context: {
        issuer: ISS,
        audience: AUD,
        now: NOW,
        vct: VCT,
        jwks: { keys: [issuer.jwk] },
      },
      statusLists,
      vectors,
    },
    null,
    2,
  ) + "\n",
);
console.log(`wrote ${vectors.length} vectors`);
