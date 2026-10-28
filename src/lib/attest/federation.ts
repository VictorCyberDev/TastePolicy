// Federation-compatible issuer onboarding. The only supported path is
//   discover -> inspect -> explicitly trust -> verify
// Discovery fetches an issuer's public documents and reports what they say;
// the result is always trust UNKNOWN. A verifier becomes willing to accept an
// issuer's proofs only through admitIssuer(), which needs a deliberate
// confirmation (the issuer origin and the active key id, obtained out of band)
// and refuses documents with problems. There is no web of trust, no automatic
// admission, and nothing here writes configuration: the caller decides where
// the admitted entry is stored.
import { calculateJwkThumbprint, type JSONWebKeySet, type JWK } from "jose";
import { validateIssuerMetadata, type IssuerMetadata } from "./issuer-metadata";
import type { TrustedIssuer } from "./verify";

export type FetchJson = (url: string) => Promise<string>;
export type KeyState = "ACTIVE" | "NEXT" | "RETIRED" | "REVOKED" | "UNLISTED";
export interface IssuerInspection {
  schemaVersion: "tastepolicy-issuer-inspection-v1";
  issuer: string;
  // Always UNKNOWN: reading documents is not a trust decision.
  trust: "UNKNOWN";
  problems: string[];
  metadata: IssuerMetadata | null;
  keys: { kid: string; state: KeyState; alg?: string }[];
  // The keys' public parameters, kept so an admission can pin exactly them.
  jwks: JSONWebKeySet | null;
  admission: { explicitConfirmationRequired: true; how: string };
}
const ORIGIN = /^https:\/\/[a-z0-9.-]{1,190}(:\d{1,5})?$/;

export async function inspectIssuer(
  origin: string,
  fetchText: FetchJson,
): Promise<IssuerInspection> {
  const base = {
    schemaVersion: "tastepolicy-issuer-inspection-v1" as const,
    issuer: origin,
    trust: "UNKNOWN" as const,
    admission: {
      explicitConfirmationRequired: true as const,
      how: "Compare the active key id with one you obtained from the issuer out of band, then call admitIssuer with that confirmation.",
    },
  };
  const bad = (problems: string[]): IssuerInspection => ({
    ...base,
    problems,
    metadata: null,
    keys: [],
    jwks: null,
  });
  if (!ORIGIN.test(origin)) return bad(["ORIGIN_INVALID"]);
  let metadata: IssuerMetadata, jwks: JSONWebKeySet;
  try {
    metadata = JSON.parse(
      await fetchText(`${origin}/.well-known/tastepolicy-issuer`),
    );
  } catch {
    return bad(["METADATA_UNREACHABLE"]);
  }
  const problems = validateIssuerMetadata(metadata, `${origin}/`);
  if (problems.length) return { ...bad(problems), metadata };
  try {
    jwks = JSON.parse(await fetchText(metadata.jwksUri));
    if (!jwks || !Array.isArray(jwks.keys)) throw Error("JWKS");
  } catch {
    return { ...bad(["JWKS_UNREACHABLE"]), metadata };
  }
  const state = (kid: string): KeyState =>
    (metadata.keys.revoked ?? []).includes(kid)
      ? "REVOKED"
      : metadata.keys.active === kid
        ? "ACTIVE"
        : (metadata.keys.next ?? []).includes(kid)
          ? "NEXT"
          : (metadata.keys.retired ?? []).includes(kid)
            ? "RETIRED"
            : "UNLISTED";
  const keys: IssuerInspection["keys"] = [];
  const extra: string[] = [];
  for (const k of jwks.keys) {
    // A kid is only a label: it must equal the key's own thumbprint, or an
    // attacker could publish their key under the trusted key's name.
    let tp: string;
    try {
      tp = await calculateJwkThumbprint(k as JWK, "sha256");
    } catch {
      extra.push("JWKS_KEY_MALFORMED");
      continue;
    }
    if (k.kid !== tp) extra.push("KID_NOT_THUMBPRINT");
    if ("d" in k) extra.push("JWKS_CONTAINS_PRIVATE_KEY");
    keys.push({ kid: tp, state: state(tp), alg: k.alg });
  }
  if (!keys.some((k) => k.state === "ACTIVE"))
    extra.push("ACTIVE_KEY_NOT_PUBLISHED");
  return {
    ...base,
    problems: [...new Set(extra)],
    metadata,
    keys,
    jwks,
  };
}
export class AdmissionRefused extends Error {
  constructor(readonly reasons: string[]) {
    super(reasons.join(","));
  }
}
// The deliberate step. Returns the verifier configuration entry; it does not
// store it. Keys the issuer declares revoked are left out of the pinned set.
export function admitIssuer(
  inspection: IssuerInspection,
  confirmation: { issuer: string; activeKid: string },
): { issuer: string; entry: TrustedIssuer } {
  const why: string[] = [];
  if (inspection.problems.length) why.push("INSPECTION_HAS_PROBLEMS");
  if (!inspection.metadata || !inspection.jwks) why.push("NOTHING_TO_ADMIT");
  if (confirmation.issuer !== inspection.issuer)
    why.push("ISSUER_NOT_CONFIRMED");
  const active = inspection.keys.find((k) => k.state === "ACTIVE");
  if (!active || confirmation.activeKid !== active.kid)
    why.push("ACTIVE_KEY_NOT_CONFIRMED");
  if (why.length) throw new AdmissionRefused(why);
  // Revoked by the issuer's own declaration, published or not.
  const revoked = new Set([
    ...(inspection.metadata!.keys.revoked ?? []),
    ...inspection.keys.filter((k) => k.state === "REVOKED").map((k) => k.kid),
  ]);
  return {
    issuer: inspection.issuer,
    entry: {
      jwks: {
        // Only the active key and the announced next key are pinned. A retired
        // key does not keep verifying new proofs; proofs live for minutes, so
        // inspect again after a rotation.
        keys: inspection
          .jwks!.keys.map((k) => ({ ...k }))
          .filter((k) => {
            const st = inspection.keys.find((x) => x.kid === k.kid)?.state;
            return (
              (st === "ACTIVE" || st === "NEXT") && !revoked.has(String(k.kid))
            );
          }),
      },
      vct: inspection.metadata!.vct,
      state: "TRUSTED",
      revokedKids: [...revoked],
    },
  };
}
