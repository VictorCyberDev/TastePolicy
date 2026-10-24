import "server-only";
import { hkdfSync } from "node:crypto";
import {
  calculateJwkThumbprint,
  importJWK,
  type JSONWebKeySet,
  type JWK,
} from "jose";
import type { Signer } from "@/lib/attest/sdjwt";
import { VCT } from "@/lib/attest/issue";
import type { TrustedIssuer } from "@/lib/attest/verify";

export interface AttestationConfig {
  issuer: string;
  signer: Signer;
  jwks: JSONWebKeySet;
  // Keys the per-audience epoch references; derived from the signing key.
  epochKey: Uint8Array;
  // This issuer plus any operator-configured co-issuers. Nothing is discovered.
  trusted: Record<string, TrustedIssuer>;
  // Lifecycle facts published in the issuer metadata document.
  keys: {
    active: string;
    next: string[];
    retired: string[];
    revoked: string[];
  };
}
let cache: { key: string; value: AttestationConfig | null } | null = null;
// Environment: TASTEPOLICY_PUBLIC_ORIGIN (https origin = issuer id),
// TASTEPOLICY_ATTESTATION_KEY (private ES256 JWK), optional
// TASTEPOLICY_ATTESTATION_PREVIOUS_PUBLIC_KEYS (JWKS) and
// TASTEPOLICY_TRUSTED_ISSUERS ({"https://other":{"jwks":{...},"vct":[...]}}).
// Missing configuration means NOT_CONFIGURED; no key is ever generated.
export async function attestationConfig(): Promise<AttestationConfig | null> {
  const env = process.env,
    raw = [
      env.TASTEPOLICY_PUBLIC_ORIGIN,
      env.TASTEPOLICY_ATTESTATION_KEY,
      env.TASTEPOLICY_ATTESTATION_PREVIOUS_PUBLIC_KEYS,
      env.TASTEPOLICY_TRUSTED_ISSUERS,
      env.TASTEPOLICY_ATTESTATION_NEXT_PUBLIC_KEY,
      env.TASTEPOLICY_ATTESTATION_REVOKED_KIDS,
    ].join("\u0000");
  if (cache?.key === raw) return cache.value;
  let value: AttestationConfig | null = null;
  try {
    if (env.TASTEPOLICY_PUBLIC_ORIGIN && env.TASTEPOLICY_ATTESTATION_KEY) {
      const origin = new URL(env.TASTEPOLICY_PUBLIC_ORIGIN);
      if (origin.protocol !== "https:" && origin.hostname !== "localhost")
        throw Error("origin");
      const jwk = JSON.parse(env.TASTEPOLICY_ATTESTATION_KEY) as JWK;
      if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.d) throw Error("key");
      const key = await importJWK(jwk, "ES256"),
        { d, ...rest } = jwk;
      void d;
      const pub: JWK = { kty: rest.kty, crv: rest.crv, x: rest.x, y: rest.y };
      const kid = await calculateJwkThumbprint(pub);
      const previous = env.TASTEPOLICY_ATTESTATION_PREVIOUS_PUBLIC_KEYS
        ? (
            JSON.parse(
              env.TASTEPOLICY_ATTESTATION_PREVIOUS_PUBLIC_KEYS,
            ) as JSONWebKeySet
          ).keys
        : [];
      if (previous.some((k) => "d" in k))
        throw Error("previous keys must be public");
      // Key lifecycle: active signs; next is published ahead of the switch so
      // verifiers can cache it; retired keys stay published for the historical
      // window; revoked (compromised) kids are removed and announced.
      const next: JWK[] = [];
      if (env.TASTEPOLICY_ATTESTATION_NEXT_PUBLIC_KEY) {
        const n = JSON.parse(
          env.TASTEPOLICY_ATTESTATION_NEXT_PUBLIC_KEY,
        ) as JWK;
        if (n.kty !== "EC" || n.crv !== "P-256" || "d" in n)
          throw Error("next key must be a public P-256 JWK");
        const pubN: JWK = { kty: n.kty, crv: n.crv, x: n.x, y: n.y };
        next.push({
          ...pubN,
          kid: await calculateJwkThumbprint(pubN),
          alg: "ES256",
          use: "sig",
        });
      }
      const revokedKids = (env.TASTEPOLICY_ATTESTATION_REVOKED_KIDS ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      if (revokedKids.includes(kid)) throw Error("the signing key is revoked");
      const issuer = origin.origin,
        jwks: JSONWebKeySet = {
          keys: [
            { ...pub, kid, alg: "ES256", use: "sig" },
            ...next,
            ...previous,
          ].filter((k) => !k.kid || !revokedKids.includes(k.kid)),
        };
      const trusted: Record<string, TrustedIssuer> = {
        [issuer]: { jwks, vct: [VCT], revokedKids },
      };
      if (env.TASTEPOLICY_TRUSTED_ISSUERS) {
        const extra = JSON.parse(env.TASTEPOLICY_TRUSTED_ISSUERS) as Record<
          string,
          TrustedIssuer
        >;
        for (const [iss, t] of Object.entries(extra)) {
          if (
            iss === issuer ||
            !/^https:\/\//.test(iss) ||
            !t.jwks?.keys?.length ||
            !t.vct?.length
          )
            throw Error("trusted issuer");
          if (t.jwks.keys.some((k) => "d" in k))
            throw Error("trusted issuer key");
          if (
            (t.state !== undefined &&
              !["TRUSTED", "UNTRUSTED", "REVOKED"].includes(t.state)) ||
            (t.revokedKids !== undefined &&
              !(
                Array.isArray(t.revokedKids) &&
                t.revokedKids.every((x) => typeof x === "string")
              )) ||
            (t.notAfter !== undefined && typeof t.notAfter !== "number")
          )
            throw Error("trusted issuer state");
          trusted[iss] = t;
        }
      }
      const epochKey = new Uint8Array(
        hkdfSync(
          "sha256",
          Buffer.from(jwk.d, "base64url"),
          Buffer.alloc(0),
          "tastepolicy-epoch-ref-v1",
          32,
        ),
      );
      value = {
        issuer,
        signer: { key, alg: "ES256", kid },
        jwks,
        epochKey,
        trusted,
        keys: {
          active: kid,
          next: next.map((k) => k.kid!),
          retired: previous.map((k) => k.kid ?? "").filter(Boolean),
          revoked: revokedKids,
        },
      };
    }
  } catch {
    value = null;
  }
  cache = { key: raw, value };
  return value;
}
