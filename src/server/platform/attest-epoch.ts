import "server-only";
import { createHash, createHmac } from "node:crypto";
import type { LeaseRecord } from "./lease-repository";

// The authority epoch is the span during which one exact authorization held:
// this candidate, this action, this situation, this state, this policy, these
// overrides, this grant, established at this lease revision. It is committed
// to with a hash that never leaves the issuer; a proof carries only a
// per-audience keyed reference to it, so two verifiers cannot link their
// proofs through it.
export function epochCommitment(l: LeaseRecord): string {
  const f = l.state.fingerprint;
  return createHash("sha256")
    .update(
      JSON.stringify({
        v: "tastepolicy-epoch-v1",
        lease: l.leaseRef,
        epoch: l.state.epoch.n,
        authorizedRev: l.state.epoch.rev,
        candidate: l.candidateId,
        action: [...l.permitted].sort(),
        context: l.contextKey,
        state: f.stateHash,
        policy: f.policyVersion,
        overrides: [...f.overrideIds].sort(),
        grant: f.grantId,
      }),
    )
    .digest("hex");
}
export const epochRef = (
  key: Uint8Array,
  audience: string,
  commitment: string,
) =>
  createHmac("sha256", key)
    .update(`tastepolicy-epoch-ref-v1\n${audience}\n${commitment}`)
    .digest("base64url")
    .slice(0, 32);
