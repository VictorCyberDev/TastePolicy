import { VCT } from "./issue";

// Issuer metadata (tastepolicy-issuer-metadata-v1): what a verifier can learn
// about an issuer by fetching it. Reading this document is *discovery*; it
// never makes an issuer trusted. Trust is a separate, local decision.
export const ISSUER_METADATA_SCHEMA = "tastepolicy-issuer-metadata-v1";
export const COMPATIBLE_PROFILE = "tastepolicy-compatible-v1";
export interface IssuerMetadata {
  schemaVersion: typeof ISSUER_METADATA_SCHEMA;
  issuer: string;
  metadataVersion: number;
  vct: string[];
  authority: "CULTURAL_ONLY";
  supportedActions: string[];
  algorithms: string[];
  jwksUri: string;
  keys: {
    active: string;
    next: string[];
    retired: string[];
    revoked: string[];
  };
  // Retired keys stay published at least this long after their last use.
  historicalVerificationSeconds: number;
  status: {
    mechanism: "token-status-list";
    draft: 21;
    uriTemplate: string;
    maxAgeSeconds: number;
  };
  verification: { hostedEndpoint: string; interactive: string };
  conformance: { profile: string; vectors: string };
  documentation: string;
  trust: { discoveryGrantsTrust: false };
}
export function buildIssuerMetadata(
  issuer: string,
  keys: IssuerMetadata["keys"],
): IssuerMetadata {
  return {
    schemaVersion: ISSUER_METADATA_SCHEMA,
    issuer,
    metadataVersion: 1,
    vct: [VCT],
    authority: "CULTURAL_ONLY",
    supportedActions: ["recommend", "add_to_draft"],
    algorithms: ["ES256"],
    jwksUri: `${issuer}/.well-known/jwks.json`,
    keys,
    historicalVerificationSeconds: 3600,
    status: {
      mechanism: "token-status-list",
      draft: 21,
      uriTemplate: `${issuer}/api/attest/status/{list}`,
      maxAgeSeconds: 120,
    },
    verification: {
      hostedEndpoint: `${issuer}/api/attest/verify`,
      interactive: `${issuer}/verify`,
    },
    conformance: {
      profile: COMPATIBLE_PROFILE,
      vectors: `${issuer}/docs/conformance`,
    },
    documentation: `${issuer}/docs/integrations`,
    trust: { discoveryGrantsTrust: false },
  };
}
const https = (u: unknown) => {
  try {
    const x = new URL(String(u));
    return x.protocol === "https:" && !x.username && !x.hash;
  } catch {
    return false;
  }
};
// Problems found in a fetched document (empty = acceptable for *display*; the
// verifier still decides trust locally).
export function validateIssuerMetadata(
  m: unknown,
  fetchedFrom: string,
): string[] {
  const p: string[] = [];
  if (!m || typeof m !== "object") return ["NOT_AN_OBJECT"];
  const d = m as Partial<IssuerMetadata>;
  if (d.schemaVersion !== ISSUER_METADATA_SCHEMA) p.push("SCHEMA_VERSION");
  if (!https(d.issuer)) p.push("ISSUER_NOT_HTTPS");
  else if (new URL(d.issuer!).origin !== new URL(fetchedFrom).origin)
    p.push("ISSUER_ORIGIN_MISMATCH");
  if (!Number.isInteger(d.metadataVersion) || d.metadataVersion! < 1)
    p.push("METADATA_VERSION");
  if (!Array.isArray(d.vct) || !d.vct.length) p.push("VCT_MISSING");
  if (d.authority !== "CULTURAL_ONLY") p.push("AUTHORITY");
  if (
    !Array.isArray(d.supportedActions) ||
    d.supportedActions.some((a) => !["recommend", "add_to_draft"].includes(a))
  )
    p.push("ACTIONS_EXCEED_BOUNDARY");
  if (
    !Array.isArray(d.algorithms) ||
    d.algorithms.some((a) => a === "none" || a.startsWith("HS"))
  )
    p.push("ALGORITHMS");
  if (
    !https(d.jwksUri) ||
    (d.issuer && new URL(d.jwksUri!).origin !== new URL(d.issuer).origin)
  )
    p.push("JWKS_URI");
  if (!d.keys || typeof d.keys.active !== "string") p.push("KEYS");
  else if ((d.keys.revoked ?? []).includes(d.keys.active))
    p.push("ACTIVE_KEY_REVOKED");
  if (d.status?.mechanism !== "token-status-list") p.push("STATUS_MECHANISM");
  if (!d.status || !d.status.uriTemplate?.includes("{list}"))
    p.push("STATUS_URI");
  if (
    !Number.isInteger(d.historicalVerificationSeconds) ||
    d.historicalVerificationSeconds! < 900
  )
    p.push("HISTORICAL_WINDOW");
  if (!d.conformance?.profile) p.push("CONFORMANCE_PROFILE");
  if (d.trust?.discoveryGrantsTrust !== false) p.push("TRUST_CLAIM");
  return p;
}
