// Authority commitments. A commitment is a SHA-256 digest of the RFC 8785
// canonical form of exactly the material the evaluator relied on, with a
// domain-separating prefix so a digest of one kind can never stand for another.
// It reveals nothing a verifier does not already hold, and a verifier that has
// the candidate and context can recompute it and compare.
//
// Material means what decided the answer:
//   candidate  id, name, type and the optional releaseYear / address that were
//              recorded with the evaluation (QlooEntity as snapshotted)
//   context    key, domain and optional price (the evaluator's whole context)
// Presentation (image URLs, display order, card layout, copy) is never part of
// either: it is not in the snapshot, and normalization drops unknown fields.
// The context type has no occasion or party attributes, so none are committed.
import { createHash } from "node:crypto";
import { canonicalize } from "./jcs";

export const COMMITMENT_SCHEMA = "taste-commitments-v1";
export type CommitmentKind = "candidate" | "context" | "authority";
const ENTITY_TYPES = ["brand", "place", "destination"];

export interface CandidateMaterial {
  id: string;
  name: string;
  type: string;
  releaseYear?: number;
  address?: string;
}
export interface ContextMaterial {
  key: string;
  domain: string;
  price?: { amount: number; currency: string };
}
const text = (v: unknown, max: number) =>
  typeof v === "string" && v.length >= 1 && v.length <= max ? v : null;

// Strict, total normalization. Returns null for anything that is not a valid
// candidate; unknown fields are dropped (presentation can ride along unharmed).
export function candidateMaterial(raw: unknown): CandidateMaterial | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>,
    id = text(r.id, 80),
    name = text(r.name, 160),
    type = typeof r.type === "string" ? r.type : null;
  if (!id || !name || !type || !ENTITY_TYPES.includes(type)) return null;
  const out: CandidateMaterial = { id, name, type };
  if (r.releaseYear !== undefined) {
    if (!Number.isInteger(r.releaseYear)) return null;
    out.releaseYear = r.releaseYear as number;
  }
  if (r.address !== undefined) {
    const a = text(r.address, 300);
    if (!a) return null;
    out.address = a;
  }
  return out;
}
export function contextMaterial(raw: unknown): ContextMaterial | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>,
    key = text(r.key, 64),
    domain = typeof r.domain === "string" ? r.domain : null;
  if (!key || !/^[a-zA-Z0-9_-]{1,64}$/.test(key)) return null;
  if (!domain || !ENTITY_TYPES.includes(domain)) return null;
  const out: ContextMaterial = { key, domain };
  if (r.price !== undefined) {
    const p = r.price as Record<string, unknown> | null;
    if (
      !p ||
      typeof p !== "object" ||
      typeof p.amount !== "number" ||
      !Number.isFinite(p.amount) ||
      p.amount < 0 ||
      typeof p.currency !== "string" ||
      !/^[A-Z]{3}$/.test(p.currency)
    )
      return null;
    out.price = { amount: p.amount, currency: p.currency };
  }
  return out;
}
export function commit(kind: CommitmentKind, material: unknown): string {
  const digest = createHash("sha256")
    .update(`tastepolicy/${kind}/v1\n${canonicalize(material)}`, "utf8")
    .digest("base64url");
  return `sha-256:${digest}`;
}
export const commitCandidate = (m: CandidateMaterial) => commit("candidate", m);
export const commitContext = (m: ContextMaterial) => commit("context", m);
export const COMMITMENT_FORMAT = /^sha-256:[A-Za-z0-9_-]{43}$/;

export interface AuthorityMaterial {
  candidateCommitment: string;
  contextCommitment: string;
  stateHash: string;
  outcome: string;
  policyVersion: number | null;
  agentId: string;
  requestedAction: string | null;
}
export const commitAuthority = (m: AuthorityMaterial) => commit("authority", m);

// What an evaluation record exposes to anyone allowed to read its receipt.
export function evaluationCommitments(
  candidate: unknown,
  context: unknown,
): {
  schemaVersion: typeof COMMITMENT_SCHEMA;
  candidate: string;
  context: string;
} {
  const c = candidateMaterial(candidate),
    x = contextMaterial(context);
  if (!c || !x) throw new TypeError("NOT_COMMITTABLE");
  return {
    schemaVersion: COMMITMENT_SCHEMA,
    candidate: commitCandidate(c),
    context: commitContext(x),
  };
}

// What a relying party says the choice / situation is: the material (we compute
// the commitment) and/or the commitment itself (the party need not hand the
// object over). Both given must agree. Returns null for anything malformed, so
// the caller refuses rather than treating silence as "nothing changed".
export function presentedCommitments(
  v: Record<string, unknown>,
): { candidate?: string; context?: string } | null {
  const out: { candidate?: string; context?: string } = {};
  const one = (
    material: unknown,
    commitment: unknown,
    compute: (m: unknown) => string | null,
  ): string | undefined | null => {
    let c: string | undefined;
    if (material !== undefined) {
      const x = compute(material);
      if (!x) return null;
      c = x;
    }
    if (commitment !== undefined) {
      if (typeof commitment !== "string" || !COMMITMENT_FORMAT.test(commitment))
        return null;
      if (c !== undefined && c !== commitment) return null;
      c = commitment;
    }
    return c;
  };
  const cand = one(v.candidate, v.candidateCommitment, (m) => {
    const x = candidateMaterial(m);
    return x ? commitCandidate(x) : null;
  });
  const ctx = one(v.context, v.contextCommitment, (m) => {
    const x = contextMaterial(m);
    return x ? commitContext(x) : null;
  });
  if (cand === null || ctx === null) return null;
  if (cand !== undefined) out.candidate = cand;
  if (ctx !== undefined) out.context = ctx;
  return out;
}
