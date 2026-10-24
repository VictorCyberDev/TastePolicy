import "server-only";
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
  // This issuer plus any operator-configured co-issuers. Nothing is discovered.
  trusted: Record<string, TrustedIssuer>;
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
      const issuer = origin.origin,
        jwks: JSONWebKeySet = {
          keys: [{ ...pub, kid, alg: "ES256", use: "sig" }, ...previous],
        };
      const trusted: Record<string, TrustedIssuer> = {
        [issuer]: { jwks, vct: [VCT] },
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
          trusted[iss] = t;
        }
      }
      value = { issuer, signer: { key, alg: "ES256", kid }, jwks, trusted };
    }
  } catch {
    value = null;
  }
  cache = { key: raw, value };
  return value;
}
