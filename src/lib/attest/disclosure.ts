// The owner's say over what a portable proof can reveal.
//
// A proof is an SD-JWT: every claim below is selectively disclosable, and the
// holder chooses what to show a verifier. The owner decides one step earlier
// what the proof can carry at all. The default is the smallest proof that can
// still be verified.
//
// Required claims make the proof verifiable and bound to what it is about, so
// no setting can remove them: the decision, the permitted actions, and (for a
// lease bound to commitments) the candidate and context commitments. They are
// digests and verbs; they reveal nothing the verifier does not already hold.
// The handoff binding (delegate_agent_id) is required whenever a handoff is
// requested, because dropping it would unbind the receiving agent.
//
// Optional claims are human-readable: they say in words which choice, which
// situation, which agent and which rule version. They exist only if the owner
// turned them on.
export const REQUIRED_CLAIMS = [
  "decision",
  "permitted",
  "permitted_actions",
  "candidate_commitment",
  "context_commitment",
] as const;
export const OPTIONAL_CLAIMS = [
  "candidate_name",
  "candidate_id",
  "context_key",
  "agent_id",
  "policy",
] as const;
export type OptionalClaim = (typeof OPTIONAL_CLAIMS)[number];
export const DISCLOSURE_MODES = ["MINIMAL", "STANDARD"] as const;
export type DisclosureMode = (typeof DISCLOSURE_MODES)[number];
export const DISCLOSURE_SCHEMA = "taste-proof-disclosure-v1";

export interface ProofDisclosure {
  // MINIMAL: no optional claim unless `claims` turns it on.
  // STANDARD: every optional claim unless `claims` turns it off.
  mode: DisclosureMode;
  claims: Partial<Record<OptionalClaim, boolean>>;
}
export const DEFAULT_DISCLOSURE: ProofDisclosure = {
  mode: "MINIMAL",
  claims: {},
};

// Strict parse. Required claims are not optional and are refused by name, so a
// request to "turn off" one is an error rather than a silent no-op.
export function parseDisclosure(raw: unknown): ProofDisclosure | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).some((k) => k !== "mode" && k !== "claims")) return null;
  if (!DISCLOSURE_MODES.includes(r.mode as DisclosureMode)) return null;
  const claims: ProofDisclosure["claims"] = {};
  if (r.claims !== undefined) {
    if (!r.claims || typeof r.claims !== "object" || Array.isArray(r.claims))
      return null;
    for (const [k, v] of Object.entries(r.claims)) {
      if (!(OPTIONAL_CLAIMS as readonly string[]).includes(k)) return null;
      if (typeof v !== "boolean") return null;
      claims[k as OptionalClaim] = v;
    }
  }
  return { mode: r.mode as DisclosureMode, claims };
}
export function optionalEnabled(d: ProofDisclosure): OptionalClaim[] {
  return OPTIONAL_CLAIMS.filter((c) => d.claims[c] ?? d.mode === "STANDARD");
}
// Would moving from `from` to `to` let a proof say more than before?
export const widensDisclosure = (
  from: ProofDisclosure,
  to: ProofDisclosure,
) => {
  const before = new Set(optionalEnabled(from));
  return optionalEnabled(to).some((c) => !before.has(c));
};
// Drop every optional claim the owner has not enabled. Required claims are
// never touched, whatever the policy says.
export function applyDisclosure<T extends Record<string, unknown>>(
  claims: T,
  d: ProofDisclosure,
): Omit<T, OptionalClaim> & Partial<Pick<T, Extract<keyof T, OptionalClaim>>> {
  const on = new Set<string>(optionalEnabled(d));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(claims))
    if (!(OPTIONAL_CLAIMS as readonly string[]).includes(k) || on.has(k))
      out[k] = v;
  return out as ReturnType<typeof applyDisclosure<T>>;
}
