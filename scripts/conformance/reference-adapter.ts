// Adapter between the neutral conformance input and TastePolicy's reference verifier.
// A third-party verifier supplies its own module with the same default export shape.
import { verifyPresentation } from "@/lib/attest/verify";
import type { JSONWebKeySet } from "jose";

export interface ConformanceInput {
  presentation: string;
  audience: string;
  now: number;
  nonce?: string;
  trustedIssuers: Record<string, { jwks: JSONWebKeySet; vct: string[] }>;
  statusLists: Record<string, string>;
  seenJtis: string[];
}
export interface ConformanceOutput {
  valid: boolean;
  reason?: string;
}
export default async function verify(
  i: ConformanceInput,
): Promise<ConformanceOutput> {
  const issuer = Object.keys(i.trustedIssuers)[0],
    seen = new Set(i.seenJtis.map((j) => `${issuer}|${j}|${i.audience}`));
  const r = await verifyPresentation(i.presentation, {
    audience: i.audience,
    now: () => i.now,
    nonce: i.nonce,
    trustedIssuers: i.trustedIssuers,
    fetchStatus: async (uri) => {
      const t = i.statusLists[uri];
      if (!t) throw Error("no list");
      return t;
    },
    consumeJti: async (jti, aud) =>
      !seen.has(jti + "|" + aud) && !!seen.add(jti + "|" + aud),
  });
  return { valid: r.valid, reason: r.reasons[0] };
}
