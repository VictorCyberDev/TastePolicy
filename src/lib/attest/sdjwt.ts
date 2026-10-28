import { createHash, randomBytes } from "node:crypto";
import {
  CompactSign,
  base64url,
  type CryptoKey,
  type JWK,
  type KeyObject,
} from "jose";

// Minimal SD-JWT (RFC 9901): SHA-256 digests, no decoys. Reading is lenient
// about nothing; verification lives in verify.ts.
export type SigningKey = CryptoKey | KeyObject | JWK | Uint8Array;
export interface Signer {
  key: SigningKey;
  alg: "ES256" | "Ed25519";
  kid: string;
}
export const sha256b64 = (s: string) =>
  base64url.encode(createHash("sha256").update(s, "ascii").digest());
const json = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));

export interface IssuedSdJwt {
  compact: string; // issuance form: jwt~d1~d2~...~
  disclosures: { name: string; disclosure: string; digest: string }[];
}
export async function issueSdJwt(opts: {
  signer: Signer;
  typ: string;
  visible: Record<string, unknown>;
  disclosable: Record<string, unknown>;
}): Promise<IssuedSdJwt> {
  const disclosures = Object.entries(opts.disclosable).map(([name, value]) => {
    const disclosure = base64url.encode(
      json([base64url.encode(randomBytes(16)), name, value]),
    );
    return { name, disclosure, digest: sha256b64(disclosure) };
  });
  const payload = {
    ...opts.visible,
    ...(disclosures.length
      ? { _sd: disclosures.map((d) => d.digest).sort(), _sd_alg: "sha-256" }
      : {}),
  };
  const jwt = await new CompactSign(json(payload))
    .setProtectedHeader({
      alg: opts.signer.alg,
      typ: opts.typ,
      kid: opts.signer.kid,
    })
    .sign(opts.signer.key as CryptoKey);
  return {
    compact: `${jwt}~${disclosures.map((d) => d.disclosure).join("~")}${disclosures.length ? "~" : ""}`,
    disclosures,
  };
}
export function parseCompact(compact: string) {
  const parts = compact.split("~");
  if (parts.length < 2 || !parts[0]) throw Error("MALFORMED");
  const last = parts[parts.length - 1],
    disclosures = parts.slice(1, -1);
  // Ends with "~" (no key binding) or with a key-binding JWT.
  if (disclosures.some((d) => d === "")) throw Error("MALFORMED");
  return { jwt: parts[0], disclosures, kb: last === "" ? null : last };
}
export function decodeDisclosure(d: string): [string, string, unknown] {
  const v = JSON.parse(new TextDecoder().decode(base64url.decode(d)));
  if (
    !Array.isArray(v) ||
    v.length !== 3 ||
    typeof v[0] !== "string" ||
    typeof v[1] !== "string"
  )
    throw Error("DISCLOSURE_INVALID");
  return v as [string, string, unknown];
}
// Select disclosures by claim name and optionally add a key-binding JWT.
export async function present(
  issued: string,
  reveal: string[],
  kb?: {
    signer: Signer;
    nonce: string;
    aud: string;
    iat: number;
  },
): Promise<string> {
  const { jwt, disclosures } = parseCompact(issued);
  const chosen = disclosures.filter((d) =>
    reveal.includes(decodeDisclosure(d)[1]),
  );
  const body = `${jwt}~${chosen.join("~")}${chosen.length ? "~" : ""}`;
  if (!kb) return body;
  const kbJwt = await new CompactSign(
    json({
      nonce: kb.nonce,
      aud: kb.aud,
      iat: kb.iat,
      sd_hash: sha256b64(body),
    }),
  )
    .setProtectedHeader({ alg: kb.signer.alg, typ: "kb+jwt" })
    .sign(kb.signer.key as CryptoKey);
  return body + kbJwt;
}
