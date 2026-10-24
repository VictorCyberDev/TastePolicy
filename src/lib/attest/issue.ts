import { CompactSign, base64url, type JWK } from "jose";
import { issueSdJwt, type Signer } from "./sdjwt";
import { ATTESTATION_TYP, STATUS_TYP } from "./verify";
import { encodeList } from "./status-list";

export const VCT = "https://tastepolicy.dev/vct/preference-authority/v1";
export const ATTESTATION_TTL_MAX = 900;
export interface AttestationFacts {
  issuer: string;
  audience: string;
  now: number; // epoch seconds
  // Latest time anything the proof relied on is known to hold (epoch seconds).
  leaseExpiresAt: number;
  jti: string;
  statusUri: string;
  statusIdx: number;
  holderKey?: JWK;
  // Deliberately no lease or Passport identifiers: they would link presentations
  // made to different relying parties.
  disclosable: {
    decision: "ALLOW";
    permitted: string[];
    candidate_id: string;
    candidate_name: string;
    context_key: string;
    agent_id: string;
    policy?: { version: number | null };
    // Set only on a handoff: the agent the holder key was issued to.
    delegate_agent_id?: string;
  };
}
// Build the attestation. The visible set is fixed by the profile; everything
// about the choice and the agent is selectively disclosable.
export async function issueAttestation(f: AttestationFacts, signer: Signer) {
  const exp = Math.min(f.leaseExpiresAt, f.now + ATTESTATION_TTL_MAX);
  if (exp <= f.now) throw Error("LEASE_EXPIRED");
  return {
    exp,
    ...(await issueSdJwt({
      signer,
      typ: ATTESTATION_TYP,
      visible: {
        iss: f.issuer,
        aud: f.audience,
        iat: f.now,
        exp,
        jti: f.jti,
        vct: VCT,
        authority: "CULTURAL_ONLY",
        status: { status_list: { idx: f.statusIdx, uri: f.statusUri } },
        ...(f.holderKey ? { cnf: { jwk: f.holderKey } } : {}),
      },
      disclosable: { ...f.disclosable },
    })),
  };
}
export async function signStatusList(
  o: {
    issuer: string;
    uri: string;
    now: number;
    ttlSeconds: number;
    bits: 1 | 2 | 4 | 8;
    list: Uint8Array;
  },
  signer: Signer,
) {
  return new CompactSign(
    new TextEncoder().encode(
      JSON.stringify({
        iss: o.issuer,
        sub: o.uri,
        iat: o.now,
        exp: o.now + o.ttlSeconds * 2,
        ttl: o.ttlSeconds,
        status_list: { bits: o.bits, lst: encodeList(o.list) },
      }),
    ),
  )
    .setProtectedHeader({ alg: signer.alg, typ: STATUS_TYP, kid: signer.kid })
    .sign(signer.key as Parameters<CompactSign["sign"]>[0]);
}
export const newJti = () =>
  base64url.encode(crypto.getRandomValues(new Uint8Array(18)));
