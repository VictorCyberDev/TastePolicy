import {
  base64url,
  calculateJwkThumbprint,
  compactVerify,
  createLocalJWKSet,
  decodeProtectedHeader,
  importJWK,
  type JSONWebKeySet,
  type JWK,
} from "jose";
import { decodeList, getStatus, STATUS_NAMES } from "./status-list";
import { decodeDisclosure, parseCompact, sha256b64 } from "./sdjwt";

// Reference verifier for TastePolicy attestations (profile aligned with
// SD-JWT VC draft-19 over RFC 9901). It trusts only what it is configured with.
export type Reason =
  | "MALFORMED"
  | "ALG_NOT_ALLOWED"
  | "TYP_INVALID"
  | "ISSUER_UNTRUSTED"
  | "ISSUER_REVOKED"
  | "KEY_REVOKED"
  | "KEY_UNKNOWN"
  | "SIGNATURE_INVALID"
  | "EXPIRED"
  | "NOT_YET_VALID"
  | "AUDIENCE_MISMATCH"
  | "VCT_NOT_ACCEPTED"
  | "AUTHORITY_MISSING"
  | "EPOCH_MISSING"
  | "DISCLOSURE_INVALID"
  | "DISCLOSURE_DUPLICATE"
  | "DISCLOSURE_UNREFERENCED"
  | "STATUS_MISSING"
  | "STATUS_FETCH_FAILED"
  | "STATUS_LIST_INVALID"
  | "STATUS_INDEX_OUT_OF_RANGE"
  | "STATUS_INVALID"
  | "STATUS_SUSPENDED"
  | "KB_REQUIRED"
  | "KB_INVALID"
  | "KB_NONCE_MISMATCH"
  | "KB_AUDIENCE_MISMATCH"
  | "KB_SD_HASH_MISMATCH"
  | "CANDIDATE_COMMITMENT_MISMATCH"
  | "CONTEXT_COMMITMENT_MISMATCH"
  | "COMMITMENT_NOT_DISCLOSED"
  | "LIFETIME_TOO_LONG"
  | "REPLAY";
export const ATTESTATION_TYP = "dc+sd-jwt";
export const STATUS_TYP = "statuslist+jwt";
// What a verifier decided about an issuer. Discovery (fetching an issuer's
// metadata) never produces TRUSTED: only an explicit entry does.
export type IssuerTrust = "TRUSTED" | "UNTRUSTED" | "UNKNOWN" | "REVOKED";
export interface TrustedIssuer {
  jwks: JSONWebKeySet;
  vct: string[];
  // Default TRUSTED. UNTRUSTED/REVOKED entries are kept so the verifier can
  // say why, rather than only "unknown".
  state?: "TRUSTED" | "UNTRUSTED" | "REVOKED";
  // Keys that must never verify anything (compromise), by kid.
  revokedKids?: string[];
  // Epoch seconds after which the entry no longer counts as trusted.
  notAfter?: number;
}
export interface VerifierConfig {
  audience: string;
  trustedIssuers: Record<string, TrustedIssuer>;
  now?: () => number; // epoch seconds
  clockSkewSeconds?: number;
  algorithms?: ("ES256" | "Ed25519")[];
  // Returns the compact status list token for a URI. Must be SSRF-safe.
  fetchStatus: (uri: string) => Promise<string>;
  // Verifier-supplied challenge; required when the attestation is key-bound.
  nonce?: string;
  requireKeyBinding?: boolean;
  // true when this (jti, audience) pair was not seen before and is now recorded.
  consumeJti?: (jti: string, audience: string) => Promise<boolean>;
  allowSuspended?: boolean;
  // Longest accepted exp - iat (default 3600). Bounds replay-store retention.
  maxLifetimeSeconds?: number;
  // The commitments this verifier computed itself (taste-commitments-v1) for
  // the choice and situation it is about to act on. When set, the proof must
  // disclose the matching commitment and it must be equal; otherwise the proof
  // says nothing about THIS choice or situation and is refused.
  expect?: { candidateCommitment?: string; contextCommitment?: string };
}
export interface VerifyResult {
  valid: boolean;
  reasons: Reason[];
  issuer?: string;
  claims?: Record<string, unknown>;
  issuerTrust?: IssuerTrust;
  status?: (typeof STATUS_NAMES)[number];
  // Cryptographic validity is not authority. A proof can be genuinely signed by
  // an issuer you have not chosen to trust (VALID here, valid:false above), and
  // a trusted issuer's proof can be validly signed yet no longer in force.
  signature?: "VALID" | "INVALID" | "NOT_CHECKED";
  // True only for a valid proof from a TRUSTED issuer.
  trustedAuthority?: boolean;
  // Whether the proof was compared with the verifier's own commitments. A
  // valid proof with NOT_CHECKED speaks for some choice and situation, not
  // necessarily the one in front of the verifier.
  commitments?: {
    candidate: "MATCHED" | "NOT_CHECKED";
    context: "MATCHED" | "NOT_CHECKED";
  };
}
interface Trace {
  signature: NonNullable<VerifyResult["signature"]>;
}
const fail = (
  reasons: Reason[],
  extra: Partial<VerifyResult> = {},
): VerifyResult => ({
  valid: false,
  reasons,
  ...extra,
});
const dec = (s: string) =>
  JSON.parse(new TextDecoder().decode(base64url.decode(s)));
const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

async function verifySigned(
  token: string,
  jwks: JSONWebKeySet,
  algorithms: string[],
  typ: string,
): Promise<
  | { ok: true; payload: Record<string, unknown>; kid?: string }
  | { ok: false; reason: Reason }
> {
  let header;
  try {
    header = decodeProtectedHeader(token);
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }
  if (!header.alg || !algorithms.includes(header.alg))
    return { ok: false, reason: "ALG_NOT_ALLOWED" };
  if (header.typ !== typ) return { ok: false, reason: "TYP_INVALID" };
  // Key-bearing header parameters are never trusted.
  if ("jwk" in header || "jku" in header || "x5u" in header || "x5c" in header)
    return { ok: false, reason: "ALG_NOT_ALLOWED" };
  const keys = jwks.keys.filter(
    (k) =>
      (!header.kid || k.kid === header.kid) && (!k.alg || k.alg === header.alg),
  );
  if (!keys.length) return { ok: false, reason: "KEY_UNKNOWN" };
  try {
    const set = createLocalJWKSet({ keys });
    const { payload } = await compactVerify(token, set, { algorithms });
    const parsed = JSON.parse(new TextDecoder().decode(payload));
    if (!isObj(parsed)) return { ok: false, reason: "MALFORMED" };
    return { ok: true, payload: parsed, kid: header.kid };
  } catch {
    return { ok: false, reason: "SIGNATURE_INVALID" };
  }
}
function timeChecks(
  p: Record<string, unknown>,
  now: number,
  skew: number,
): Reason | null {
  if (typeof p.iat !== "number" || typeof p.exp !== "number")
    return "MALFORMED";
  if (p.exp + skew <= now) return "EXPIRED";
  if (p.iat - skew > now) return "NOT_YET_VALID";
  if (typeof p.nbf === "number" && p.nbf - skew > now) return "NOT_YET_VALID";
  return null;
}
async function verifyInner(
  presentation: string,
  cfg: VerifierConfig,
  trace: Trace,
): Promise<VerifyResult> {
  const algorithms = cfg.algorithms ?? ["ES256", "Ed25519"],
    now = (cfg.now ?? (() => Math.floor(Date.now() / 1000)))(),
    skew = cfg.clockSkewSeconds ?? 60;
  let parsed;
  try {
    parsed = parseCompact(presentation);
  } catch {
    return fail(["MALFORMED"]);
  }
  // Issuer is read unverified only to choose which configured key set to try.
  let unverified: Record<string, unknown>;
  try {
    unverified = dec(parsed.jwt.split(".")[1]);
  } catch {
    return fail(["MALFORMED"]);
  }
  const iss = unverified.iss;
  if (typeof iss !== "string" || !Object.hasOwn(cfg.trustedIssuers, iss))
    return fail(["ISSUER_UNTRUSTED"], { issuerTrust: "UNKNOWN" });
  const entry = cfg.trustedIssuers[iss];
  if (entry.state === "REVOKED")
    return fail(["ISSUER_REVOKED"], { issuer: iss, issuerTrust: "REVOKED" });
  if (
    entry.state === "UNTRUSTED" ||
    (entry.notAfter !== undefined && entry.notAfter <= now)
  ) {
    // Report whether the proof is genuinely signed by the keys this verifier
    // holds for the issuer, without ever treating that as authority.
    const peek = await verifySigned(
      parsed.jwt,
      entry.jwks,
      algorithms,
      ATTESTATION_TYP,
    );
    trace.signature = peek.ok
      ? "VALID"
      : peek.reason === "SIGNATURE_INVALID"
        ? "INVALID"
        : "NOT_CHECKED";
    return fail(["ISSUER_UNTRUSTED"], {
      issuer: iss,
      issuerTrust: "UNTRUSTED",
    });
  }
  // A compromised key verifies nothing, even if it is still published.
  const revoked = new Set(entry.revokedKids ?? []);
  try {
    const kid = decodeProtectedHeader(parsed.jwt).kid;
    if (kid && revoked.has(kid))
      return fail(["KEY_REVOKED"], { issuer: iss, issuerTrust: "TRUSTED" });
  } catch {
    return fail(["MALFORMED"]);
  }
  const issuer: TrustedIssuer = {
    ...entry,
    jwks: {
      keys: entry.jwks.keys.filter((k) => !k.kid || !revoked.has(k.kid)),
    },
  };
  const sig = await verifySigned(
    parsed.jwt,
    issuer.jwks,
    algorithms,
    ATTESTATION_TYP,
  );
  if (!sig.ok) {
    trace.signature =
      sig.reason === "SIGNATURE_INVALID" ? "INVALID" : "NOT_CHECKED";
    return fail([sig.reason], { issuer: iss });
  }
  trace.signature = "VALID";
  const p = sig.payload;
  if (p.iss !== iss) return fail(["ISSUER_UNTRUSTED"]);
  const t = timeChecks(p, now, skew);
  if (t) return fail([t], { issuer: iss });
  if ((p.exp as number) - (p.iat as number) > (cfg.maxLifetimeSeconds ?? 3600))
    return fail(["LIFETIME_TOO_LONG"], { issuer: iss });
  const audOk = Array.isArray(p.aud)
    ? p.aud.includes(cfg.audience)
    : p.aud === cfg.audience;
  if (!audOk) return fail(["AUDIENCE_MISMATCH"], { issuer: iss });
  if (typeof p.vct !== "string" || !issuer.vct.includes(p.vct))
    return fail(["VCT_NOT_ACCEPTED"], { issuer: iss });
  if (p.authority !== "CULTURAL_ONLY")
    return fail(["AUTHORITY_MISSING"], { issuer: iss });
  // Every proof belongs to exactly one authority epoch.
  if (
    typeof p.authority_epoch !== "string" ||
    !/^[A-Za-z0-9_-]{22,64}$/.test(p.authority_epoch)
  )
    return fail(["EPOCH_MISSING"], { issuer: iss });
  if (typeof p.jti !== "string" || !p.jti)
    return fail(["MALFORMED"], { issuer: iss });
  if (p._sd_alg !== undefined && p._sd_alg !== "sha-256")
    return fail(["DISCLOSURE_INVALID"], { issuer: iss });

  // Disclosures: digest must be listed, unique and every one must be used.
  const claims: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p))
    if (k !== "_sd" && k !== "_sd_alg") claims[k] = v;
  const listed = Array.isArray(p._sd) ? (p._sd as unknown[]) : [];
  if (listed.some((d) => typeof d !== "string"))
    return fail(["DISCLOSURE_INVALID"], { issuer: iss });
  if (new Set(listed).size !== listed.length)
    return fail(["DISCLOSURE_DUPLICATE"], { issuer: iss });
  const seen = new Set<string>();
  for (const d of parsed.disclosures) {
    const digest = sha256b64(d);
    if (seen.has(digest))
      return fail(["DISCLOSURE_DUPLICATE"], { issuer: iss });
    seen.add(digest);
    if (!listed.includes(digest))
      return fail(["DISCLOSURE_UNREFERENCED"], { issuer: iss });
    let name: string, value: unknown;
    try {
      [, name, value] = decodeDisclosure(d);
    } catch {
      return fail(["DISCLOSURE_INVALID"], { issuer: iss });
    }
    if (name.startsWith("_") || Object.hasOwn(claims, name))
      return fail(["DISCLOSURE_INVALID"], { issuer: iss });
    claims[name] = value;
  }

  // Commitments: compared with what the verifier computed itself.
  const commitments: NonNullable<VerifyResult["commitments"]> = {
    candidate: "NOT_CHECKED",
    context: "NOT_CHECKED",
  };
  for (const [want, claim, mismatch, slot] of [
    [
      cfg.expect?.candidateCommitment,
      claims.candidate_commitment,
      "CANDIDATE_COMMITMENT_MISMATCH",
      "candidate",
    ],
    [
      cfg.expect?.contextCommitment,
      claims.context_commitment,
      "CONTEXT_COMMITMENT_MISMATCH",
      "context",
    ],
  ] as const) {
    if (want === undefined) continue;
    if (typeof claim !== "string")
      return fail(["COMMITMENT_NOT_DISCLOSED"], { issuer: iss });
    if (claim !== want) return fail([mismatch], { issuer: iss });
    commitments[slot] = "MATCHED";
  }

  // Key binding.
  const cnf = isObj(p.cnf) ? p.cnf : null;
  if ((cnf || cfg.requireKeyBinding) && !parsed.kb)
    return fail(["KB_REQUIRED"], { issuer: iss });
  if (parsed.kb && cnf) {
    const holder = cnf.jwk;
    if (!isObj(holder)) return fail(["KB_INVALID"], { issuer: iss });
    const body = presentation.slice(0, presentation.length - parsed.kb.length);
    try {
      const h = decodeProtectedHeader(parsed.kb);
      if (
        h.typ !== "kb+jwt" ||
        !h.alg ||
        !(algorithms as string[]).includes(h.alg)
      )
        return fail(["KB_INVALID"], { issuer: iss });
      const key = await importJWK(holder as JWK, h.alg as "ES256" | "Ed25519");
      const { payload } = await compactVerify(parsed.kb, key, { algorithms });
      const kb = JSON.parse(new TextDecoder().decode(payload));
      if (!isObj(kb) || typeof kb.iat !== "number")
        return fail(["KB_INVALID"], { issuer: iss });
      if (Math.abs(kb.iat - now) > 300 + skew)
        return fail(["KB_INVALID"], { issuer: iss });
      if (kb.aud !== cfg.audience)
        return fail(["KB_AUDIENCE_MISMATCH"], { issuer: iss });
      if (cfg.nonce === undefined || kb.nonce !== cfg.nonce)
        return fail(["KB_NONCE_MISMATCH"], { issuer: iss });
      if (kb.sd_hash !== sha256b64(body))
        return fail(["KB_SD_HASH_MISMATCH"], { issuer: iss });
    } catch {
      return fail(["KB_INVALID"], { issuer: iss });
    }
  } else if (parsed.kb) return fail(["KB_INVALID"], { issuer: iss });

  // Status.
  const status =
    isObj(p.status) && isObj(p.status.status_list)
      ? p.status.status_list
      : null;
  if (
    !status ||
    typeof status.uri !== "string" ||
    !Number.isInteger(status.idx)
  )
    return fail(["STATUS_MISSING"], { issuer: iss });
  let listToken: string;
  try {
    listToken = await cfg.fetchStatus(status.uri);
  } catch {
    return fail(["STATUS_FETCH_FAILED"], { issuer: iss });
  }
  const ls = await verifySigned(listToken, issuer.jwks, algorithms, STATUS_TYP);
  if (!ls.ok) return fail(["STATUS_LIST_INVALID"], { issuer: iss });
  const lp = ls.payload;
  const sl = isObj(lp.status_list) ? lp.status_list : null;
  if (
    lp.sub !== status.uri ||
    lp.iss !== iss ||
    !sl ||
    ![1, 2, 4, 8].includes(sl.bits as number) ||
    typeof sl.lst !== "string" ||
    typeof lp.iat !== "number" ||
    // a list signed a moment after `now` was read is fine; one from the future is not
    lp.iat - Math.max(skew, 5) > now ||
    // A list must say how long it may be reused; without that a stale copy
    // served by a cache or intermediary would look current forever.
    typeof lp.ttl !== "number" ||
    now > lp.iat + lp.ttl + skew ||
    (lp.exp !== undefined &&
      (typeof lp.exp !== "number" || lp.exp + skew <= now))
  )
    return fail(["STATUS_LIST_INVALID"], { issuer: iss });
  let value: number | null;
  try {
    value = getStatus(
      decodeList(sl.lst),
      status.idx as number,
      sl.bits as number,
    );
  } catch {
    return fail(["STATUS_LIST_INVALID"], { issuer: iss });
  }
  if (value === null)
    return fail(["STATUS_INDEX_OUT_OF_RANGE"], { issuer: iss });
  const name = STATUS_NAMES[value];
  if (name === "INVALID")
    return fail(["STATUS_INVALID"], { issuer: iss, status: name });
  if (name === undefined) return fail(["STATUS_LIST_INVALID"], { issuer: iss });
  if (name === "SUSPENDED" && !cfg.allowSuspended)
    return fail(["STATUS_SUSPENDED"], { issuer: iss, status: name });

  // Replay last, so a rejected presentation never burns a jti.
  if (
    cfg.consumeJti &&
    !(await cfg.consumeJti(`${iss}|${p.jti}`, cfg.audience))
  )
    return fail(["REPLAY"], { issuer: iss, status: name });
  return {
    valid: true,
    reasons: [],
    issuer: iss,
    claims,
    status: name,
    commitments,
  };
}
export async function jwkKid(jwk: JWK) {
  return calculateJwkThumbprint(jwk, "sha256");
}

export async function verifyPresentation(
  presentation: string,
  cfg: VerifierConfig,
): Promise<VerifyResult> {
  const trace: Trace = { signature: "NOT_CHECKED" };
  const r = await verifyInner(presentation, cfg, trace);
  // Past the trust gate every result is about a trusted issuer.
  const out =
    r.issuerTrust || !r.issuer ? r : { ...r, issuerTrust: "TRUSTED" as const };
  return {
    ...out,
    signature: trace.signature,
    trustedAuthority: out.valid && out.issuerTrust === "TRUSTED",
  };
}
