// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles over JSON */
import { it, expect, beforeAll } from "vitest";
import {
  CompactSign,
  base64url,
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  type JWK,
} from "jose";
import {
  type KeyObject,
  createPublicKey,
  sign as nodeSign,
  verify as nodeVerify,
  createHash,
  randomBytes,
} from "node:crypto";
import { SDJwtVcInstance } from "@sd-jwt/sd-jwt-vc";
import {
  decodeList,
  emptyList,
  encodeList,
  getStatus,
  setStatus,
  STATUS,
} from "@/lib/attest/status-list";
import { issueAttestation, signStatusList, VCT } from "@/lib/attest/issue";
import { present, parseCompact, type Signer } from "@/lib/attest/sdjwt";
import { verifyPresentation, type VerifierConfig } from "@/lib/attest/verify";
import { privateAddress, safeFetchText } from "@/lib/attest/safe-fetch";

const ISS = "https://issuer.test",
  AUD = "https://merchant.test",
  URI = "https://issuer.test/api/attest/status/1",
  NOW = 1_800_000_000;
let issuerSigner: Signer,
  issuerJwk: JWK,
  otherSigner: Signer,
  holder: Signer,
  holderJwk: JWK;
async function keys(): Promise<{ signer: Signer; jwk: JWK }> {
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const jwk = await exportJWK(publicKey);
  const kid = await calculateJwkThumbprint(jwk);
  return {
    signer: { key: privateKey, alg: "ES256", kid },
    jwk: { ...jwk, kid, alg: "ES256", use: "sig" },
  };
}
beforeAll(async () => {
  const a = await keys(),
    b = await keys(),
    c = await keys();
  issuerSigner = a.signer;
  issuerJwk = a.jwk;
  otherSigner = b.signer;
  holder = c.signer;
  holderJwk = c.jwk;
});
const facts = (over: Record<string, unknown> = {}) =>
  ({
    issuer: ISS,
    audience: AUD,
    now: NOW,
    leaseExpiresAt: NOW + 3600,
    jti: base64url.encode(randomBytes(12)),
    statusUri: URI,
    statusIdx: 7,
    disclosable: {
      decision: "ALLOW" as const,
      permitted: ["recommend", "add_to_draft"],
      candidate_id: "cand-1",
      candidate_name: "Synthetic Cafe",
      context_key: "dinner",
      agent_id: "Agent-A",
      lease_ref: "tl_" + "a".repeat(48),
      subject_ref: "tps_" + "b".repeat(48),
      policy: { version: 2 },
    },
    ...over,
  }) as any;
async function listToken(
  statuses: Record<number, number> = {},
  signer = issuerSigner,
  uri = URI,
  over: object = {},
) {
  const list = emptyList(1024, 2);
  for (const [i, v] of Object.entries(statuses))
    setStatus(list, Number(i), 2, v);
  return signStatusList(
    {
      issuer: ISS,
      uri,
      now: NOW,
      ttlSeconds: 60,
      bits: 2,
      list,
      ...over,
    } as any,
    signer,
  );
}
const cfg = async (
  over: Partial<VerifierConfig> = {},
  statuses: Record<number, number> = {},
): Promise<VerifierConfig> => {
  const token = await listToken(statuses);
  return {
    audience: AUD,
    now: () => NOW + 10,
    trustedIssuers: { [ISS]: { jwks: { keys: [issuerJwk] }, vct: [VCT] } },
    fetchStatus: async () => token,
    ...over,
  };
};
const issue = async (
  over: Record<string, unknown> = {},
  signer = issuerSigner,
) => (await issueAttestation(facts(over), signer)).compact;
const reasons = async (
  p: string,
  over: Partial<VerifierConfig> = {},
  statuses: Record<number, number> = {},
) => (await verifyPresentation(p, await cfg(over, statuses))).reasons;

it("a full or minimal presentation verifies and shows only what was disclosed", async () => {
  const full = await issue();
  const r = await verifyPresentation(full, await cfg());
  expect(r).toMatchObject({ valid: true, status: "VALID", issuer: ISS });
  expect(r.claims).toMatchObject({
    decision: "ALLOW",
    candidate_id: "cand-1",
    authority: "CULTURAL_ONLY",
    aud: AUD,
  });
  const minimal = await present(full, ["decision", "candidate_id"]);
  const m = await verifyPresentation(minimal, await cfg());
  expect(m.valid).toBe(true);
  expect(Object.keys(m.claims!).sort()).toEqual(
    [
      "authority",
      "aud",
      "candidate_id",
      "decision",
      "exp",
      "iat",
      "iss",
      "jti",
      "status",
      "vct",
    ].sort(),
  );
  expect(JSON.stringify(m)).not.toMatch(
    /subject_ref|agent_id|Synthetic Cafe|lease_ref|dinner/,
  );
  const none = await verifyPresentation(await present(full, []), await cfg());
  expect(none.valid).toBe(true);
  expect(none.claims).not.toHaveProperty("decision");
});
it("exp never exceeds the lease or fifteen minutes", async () => {
  const a = await issueAttestation(
      facts({ leaseExpiresAt: NOW + 120 }),
      issuerSigner,
    ),
    b = await issueAttestation(
      facts({ leaseExpiresAt: NOW + 86400 }),
      issuerSigner,
    );
  expect([a.exp, b.exp]).toEqual([NOW + 120, NOW + 900]);
  await expect(
    issueAttestation(facts({ leaseExpiresAt: NOW }), issuerSigner),
  ).rejects.toThrow("LEASE_EXPIRED");
});
it("rejects forged, mistyped and mis-keyed tokens", async () => {
  expect(await reasons(await issue({}, otherSigner))).toEqual(["KEY_UNKNOWN"]); // kid not trusted
  const sameKid = { ...otherSigner, kid: issuerSigner.kid };
  expect(await reasons(await issue({}, sameKid))).toEqual([
    "SIGNATURE_INVALID",
  ]);
  expect(await reasons(await issue({ issuer: "https://evil.test" }))).toEqual([
    "ISSUER_UNTRUSTED",
  ]);
  const hs = new CompactSign(
    new TextEncoder().encode(JSON.stringify({ iss: ISS })),
  );
  const noneJwt = `${base64url.encode(JSON.stringify({ alg: "none", typ: "dc+sd-jwt" }))}.${base64url.encode(JSON.stringify({ iss: ISS }))}.`;
  expect(await reasons(noneJwt + "~")).toEqual(["ALG_NOT_ALLOWED"]);
  const hsJwt = `${base64url.encode(JSON.stringify({ alg: "HS256", typ: "dc+sd-jwt" }))}.${base64url.encode(JSON.stringify({ iss: ISS }))}.x`;
  expect(await reasons(hsJwt + "~")).toEqual(["ALG_NOT_ALLOWED"]);
  void hs;
  const wrongTyp = await new CompactSign(
    new TextEncoder().encode(JSON.stringify({ iss: ISS })),
  )
    .setProtectedHeader({ alg: "ES256", typ: "JWT", kid: issuerSigner.kid })
    .sign(issuerSigner.key as any);
  expect(await reasons(wrongTyp + "~")).toEqual(["TYP_INVALID"]);
  const withJwk = await new CompactSign(
    new TextEncoder().encode(JSON.stringify({ iss: ISS })),
  )
    .setProtectedHeader({
      alg: "ES256",
      typ: "dc+sd-jwt",
      kid: issuerSigner.kid,
      jwk: otherSigner as any,
    })
    .sign(issuerSigner.key as any);
  expect(await reasons(withJwk + "~")).toEqual(["ALG_NOT_ALLOWED"]);
  expect(await reasons("not-a-token")).toEqual(["MALFORMED"]);
  expect(await reasons("a.b.c~x")).not.toEqual([]);
});
it("enforces time, audience, type and the authority boundary", async () => {
  const p = await issue();
  expect(await reasons(p, { now: () => NOW + 900 + 61 })).toEqual(["EXPIRED"]);
  expect(await reasons(p, { now: () => NOW - 120 })).toEqual(["NOT_YET_VALID"]);
  expect(await reasons(p, { audience: "https://other.test" })).toEqual([
    "AUDIENCE_MISMATCH",
  ]);
  expect(
    await reasons(p, {
      trustedIssuers: {
        [ISS]: { jwks: { keys: [issuerJwk] }, vct: ["urn:other"] },
      },
    }),
  ).toEqual(["VCT_NOT_ACCEPTED"]);
});
it("rejects tampered, duplicated and unreferenced disclosures", async () => {
  const full = await issue(),
    { jwt, disclosures } = parseCompact(full);
  const tampered = Buffer.from(base64url.decode(disclosures[0]))
    .toString()
    .replace("ALLOW", "BLOCK");
  expect(await reasons(`${jwt}~${base64url.encode(tampered)}~`)).toEqual([
    "DISCLOSURE_UNREFERENCED",
  ]);
  expect(await reasons(`${jwt}~${disclosures[0]}~${disclosures[0]}~`)).toEqual([
    "DISCLOSURE_DUPLICATE",
  ]);
  const extra = base64url.encode(JSON.stringify(["salt", "extra", 1]));
  expect(await reasons(`${jwt}~${extra}~`)).toEqual([
    "DISCLOSURE_UNREFERENCED",
  ]);
  expect(await reasons(`${jwt}~~`)).toEqual(["MALFORMED"]);
});
it("status: invalid and suspended fail, out-of-range fails, hostile or foreign lists fail, fetch failure fails closed", async () => {
  const p = await issue();
  expect(await reasons(p, {}, { 7: STATUS.INVALID })).toEqual([
    "STATUS_INVALID",
  ]);
  expect(await reasons(p, {}, { 7: STATUS.SUSPENDED })).toEqual([
    "STATUS_SUSPENDED",
  ]);
  expect(
    (
      await verifyPresentation(
        p,
        await cfg({ allowSuspended: true }, { 7: STATUS.SUSPENDED }),
      )
    ).valid,
  ).toBe(true);
  expect(await reasons(await issue({ statusIdx: 5000 }))).toEqual([
    "STATUS_INDEX_OUT_OF_RANGE",
  ]);
  expect(await reasons(await issue({ statusIdx: -1 }))).toEqual([
    "STATUS_INDEX_OUT_OF_RANGE",
  ]);
  expect(
    await reasons(p, {
      fetchStatus: async () => {
        throw new Error("x");
      },
    }),
  ).toEqual(["STATUS_FETCH_FAILED"]);
  expect(
    await reasons(p, { fetchStatus: async () => listToken({}, otherSigner) }),
  ).toEqual(["STATUS_LIST_INVALID"]);
  expect(
    await reasons(p, {
      fetchStatus: async () =>
        listToken({}, issuerSigner, "https://issuer.test/other"),
    }),
  ).toEqual(["STATUS_LIST_INVALID"]);
  const bomb = new CompactSign(
    new TextEncoder().encode(
      JSON.stringify({
        iss: ISS,
        sub: URI,
        iat: NOW,
        status_list: {
          bits: 2,
          lst: encodeList(new Uint8Array(8 * 1024 * 1024)),
        },
      }),
    ),
  )
    .setProtectedHeader({
      alg: "ES256",
      typ: "statuslist+jwt",
      kid: issuerSigner.kid,
    })
    .sign(issuerSigner.key as any);
  expect(await reasons(p, { fetchStatus: async () => bomb })).toEqual([
    "STATUS_LIST_INVALID",
  ]);
  const expired = await listToken({}, issuerSigner, URI, {
    now: NOW - 100000,
    ttlSeconds: 1,
  });
  expect(await reasons(p, { fetchStatus: async () => expired })).toEqual([
    "STATUS_LIST_INVALID",
  ]);
});
it("key binding: required when bound, bound to nonce, audience and the exact presentation", async () => {
  const full = await issue({ holderKey: holderJwk });
  const kb = (nonce: string, aud = AUD) => ({
    signer: holder,
    nonce,
    aud,
    iat: NOW + 5,
  });
  const ok = await present(full, ["decision"], kb("n-1"));
  expect(
    (await verifyPresentation(ok, await cfg({ nonce: "n-1" }))).valid,
  ).toBe(true);
  expect(
    await reasons(await present(full, ["decision"]), { nonce: "n-1" }),
  ).toEqual(["KB_REQUIRED"]);
  expect(await reasons(ok, { nonce: "n-2" })).toEqual(["KB_NONCE_MISMATCH"]);
  expect(await reasons(ok, {})).toEqual(["KB_NONCE_MISMATCH"]);
  expect(
    await reasons(
      await present(full, ["decision"], kb("n-1", "https://other.test")),
      { nonce: "n-1" },
    ),
  ).toEqual(["KB_AUDIENCE_MISMATCH"]);
  // swapping which disclosures accompany a signed key-binding breaks sd_hash
  const swapped = (
    await present(full, ["decision", "candidate_id"], kb("n-1"))
  ).replace(/~[^~]+~([^~]+)$/, "~$1");
  expect(await reasons(swapped, { nonce: "n-1" })).not.toEqual([]);
  // a key-binding JWT signed by someone else
  const forged = await present(full, ["decision"], {
    signer: otherSigner,
    nonce: "n-1",
    aud: AUD,
    iat: NOW,
  });
  expect(await reasons(forged, { nonce: "n-1" })).toEqual(["KB_INVALID"]);
  // unbound attestation with a key-binding JWT appended is rejected
  expect(
    await reasons(await present(await issue(), ["decision"], kb("n-1")), {
      nonce: "n-1",
    }),
  ).toEqual(["KB_INVALID"]);
  expect(await reasons(await issue(), { requireKeyBinding: true })).toEqual([
    "KB_REQUIRED",
  ]);
});
it("replay: a jti is accepted once per audience; rejected presentations never burn a jti", async () => {
  const seen = new Set<string>(),
    consumeJti = async (j: string, a: string) =>
      !seen.has(j + a) && !!seen.add(j + a);
  const p = await issue();
  expect((await verifyPresentation(p, await cfg({ consumeJti }))).valid).toBe(
    true,
  );
  expect(await reasons(p, { consumeJti })).toEqual(["REPLAY"]);
  const q = await issue();
  expect(await reasons(q, { consumeJti }, { 7: STATUS.INVALID })).toEqual([
    "STATUS_INVALID",
  ]);
  expect(seen.size).toBe(1);
  expect((await verifyPresentation(q, await cfg({ consumeJti }))).valid).toBe(
    true,
  );
});
it("federation: a second independent issuer verifies only when explicitly trusted", async () => {
  const b = await keys(),
    ISS2 = "https://issuer-two.test",
    uri2 = "https://issuer-two.test/status/1";
  const p = (
    await issueAttestation(facts({ issuer: ISS2, statusUri: uri2 }), b.signer)
  ).compact;
  const list = await signStatusList(
    {
      issuer: ISS2,
      uri: uri2,
      now: NOW,
      ttlSeconds: 60,
      bits: 2,
      list: emptyList(1024, 2),
    },
    b.signer,
  );
  const base = await cfg({ fetchStatus: async () => list });
  expect(await reasons(p, { fetchStatus: async () => list })).toEqual([
    "ISSUER_UNTRUSTED",
  ]);
  const both = {
    ...base,
    trustedIssuers: {
      ...base.trustedIssuers,
      [ISS2]: { jwks: { keys: [b.jwk] }, vct: [VCT] },
    },
  };
  expect((await verifyPresentation(p, both)).valid).toBe(true);
  // issuer one's key cannot vouch for issuer two's name
  const swappedKeys = {
    ...both,
    trustedIssuers: {
      ...both.trustedIssuers,
      [ISS2]: { jwks: { keys: [issuerJwk] }, vct: [VCT] },
    },
  };
  expect((await verifyPresentation(p, swappedKeys)).valid).toBe(false);
});
it("status list encoding matches the Token Status List specification example", () => {
  const bits1 = [1, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 1, 0, 1];
  const list = emptyList(16, 1);
  bits1.forEach((v, i) => setStatus(list, i, 1, v));
  expect([...list]).toEqual([0xb9, 0xa3]);
  const spec = Buffer.from("78dadbb918000217015d", "hex");
  expect(decodeList(base64url.encode(spec))).toEqual(list);
  expect(bits1.every((v, i) => getStatus(list, i, 1) === v)).toBe(true);
  expect(getStatus(list, 16, 1)).toBeNull();
  expect(() => setStatus(list, 0, 1, 2)).toThrow();
});
it("SSRF guard blocks private, link-local, loopback and non-https targets", async () => {
  for (const a of [
    "10.0.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "172.16.0.1",
    "100.64.0.1",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:10.0.0.1",
    "0.0.0.0",
  ])
    expect(privateAddress(a)).toBe(true);
  for (const a of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])
    expect(privateAddress(a)).toBe(false);
  for (const u of [
    "http://example.com/x",
    "https://127.0.0.1/x",
    "https://[::1]/x",
    "https://u:p@example.com/",
    "ftp://example.com",
    "not a url",
  ])
    await expect(safeFetchText(u, "application/json")).rejects.toMatchObject({
      name: "Error",
    });
  await expect(
    safeFetchText("https://localhost/x", "*/*"),
  ).rejects.toBeDefined();
});
it("interop: the independent @sd-jwt/sd-jwt-vc implementation verifies what we issue, and we verify what it issues", async () => {
  const priv = issuerSigner.key as KeyObject,
    pub = createPublicKey(priv);
  const hasher = (d: string | ArrayBuffer, alg: string) => {
    if (alg !== "sha-256") throw Error("alg");
    return new Uint8Array(
      createHash("sha256")
        .update(typeof d === "string" ? d : Buffer.from(d))
        .digest(),
    );
  };
  const lib = new SDJwtVcInstance({
    hasher,
    hashAlg: "sha-256",
    saltGenerator: (n: number) => base64url.encode(randomBytes(n)),
    signAlg: "ES256",
    signer: (data: string) =>
      base64url.encode(
        nodeSign("sha256", Buffer.from(data), {
          key: priv,
          dsaEncoding: "ieee-p1363",
        }),
      ),
    verifier: (data: string, sig: string) =>
      nodeVerify(
        "sha256",
        Buffer.from(data),
        { key: pub, dsaEncoding: "ieee-p1363" },
        Buffer.from(base64url.decode(sig)),
      ),
    statusListFetcher: async () => await listToken(),
    statusValidator: async () => undefined,
  } as any);
  // theirs verifies ours (their library implements draft-15 claim handling; we compare cryptography and disclosure handling)
  const ours = await issue();
  const theirs = await lib.verify(ours, { currentDate: NOW + 10 } as never);
  expect(theirs.payload.authority).toBe("CULTURAL_ONLY");
  expect((theirs as any).payload.decision).toBe("ALLOW");
  const minimal = await present(ours, ["decision"]);
  expect(
    ((await lib.verify(minimal, { currentDate: NOW + 10 } as never)) as any)
      .payload.candidate_id,
  ).toBeUndefined();
  // ours verifies theirs
  const issued = await lib.issue(
    {
      iss: ISS,
      aud: AUD,
      iat: NOW,
      exp: NOW + 600,
      jti: "their-jti",
      vct: VCT,
      authority: "CULTURAL_ONLY",
      status: { status_list: { idx: 9, uri: URI } },
      decision: "ALLOW",
      candidate_id: "c",
    },
    { _sd: ["decision", "candidate_id"] } as any,
    { header: { kid: issuerSigner.kid } } as any,
  );
  const r = await verifyPresentation(issued, await cfg());
  expect(r).toMatchObject({ valid: true });
  expect(r.claims).toMatchObject({ decision: "ALLOW", candidate_id: "c" });
});
