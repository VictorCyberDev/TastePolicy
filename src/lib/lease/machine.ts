import type { AskKind } from "./ask";
// Pure lease state machine. No clock, no I/O: the service feeds it events with
// explicit times, and the same events always rebuild the same state (replay).
export const LEASE_STATUSES = [
  "ASK_PENDING",
  "ACTIVE",
  "SUSPENDED",
  "DECLINED",
  "REVOKED",
  "EXPIRED",
  "RELEASED",
] as const;
export type LeaseStatus = (typeof LEASE_STATUSES)[number];
export const TERMINAL: readonly LeaseStatus[] = [
  "DECLINED",
  "REVOKED",
  "EXPIRED",
  "RELEASED",
];
export const isTerminal = (s: LeaseStatus) => TERMINAL.includes(s);

export interface Fingerprint {
  stateHash: string;
  policyVersion: number | null;
  grantId: string | null;
  // Temporary overrides the decision relied on.
  overrideIds: string[];
  // Canonical commitments to the material candidate and context the decision
  // was about (taste-commitments-v1). Absent on leases issued before they
  // existed; those leases are not checked against a presented commitment.
  candidateCommitment?: string;
  contextCommitment?: string;
}
export type DriftReason =
  | "STATE_CHANGED"
  | "POLICY_CHANGED"
  | "GRANT_UNAVAILABLE"
  | "OVERRIDE_ENDED"
  | "CANDIDATE_CHANGED"
  | "CONTEXT_CHANGED"
  | "PASSPORT_UNAVAILABLE"
  | "CHECKPOINT_OVERDUE";
export interface LeaseState {
  status: LeaseStatus;
  // Authority epoch: n counts how many times authority was (re)established
  // (0 while an ASK is still pending); rev is the lease revision that did it.
  // Anything that ends ACTIVE ends the epoch, and a new one needs a fresh
  // evaluation, so proofs of an earlier epoch can never speak for a later one.
  epoch: { n: number; rev: number };
  // Why the owner is being asked; null unless the lease began as an ASK.
  ask: { kind: AskKind; reasons: string[] } | null;
  rev: number;
  expiresAt: string;
  checkpointDueAt: string;
  fingerprint: Fingerprint;
  reasons: DriftReason[];
}
export type LeaseEvent =
  | {
      kind: "ISSUED";
      at: string;
      actor: "AGENT";
      // ALLOW starts ACTIVE; ASK waits for the owner.
      decision: "ALLOW" | "ASK";
      // Required (and only valid) for ASK: why the owner is being asked.
      ask?: { kind: AskKind; reasons: string[] };
      expiresAt: string;
      checkpointDueAt: string;
      fingerprint: Fingerprint;
    }
  | {
      kind: "APPROVED";
      at: string;
      actor: "OWNER";
      // What the owner explicitly allowed, once: recorded, not inferred.
      scope: {
        candidateId: string;
        contextKey: string;
        permitted: string[];
        price?: { amount: number; currency: string } | null;
      };
      fingerprint: Fingerprint;
      expiresAt: string;
      checkpointDueAt: string;
    }
  | { kind: "DECLINED"; at: string; actor: "OWNER" }
  | {
      kind: "CHECKPOINT_OK";
      at: string;
      actor: "AGENT";
      checkpointDueAt: string;
    }
  | {
      kind: "DRIFT";
      at: string;
      actor: "SYSTEM" | "AGENT";
      reasons: DriftReason[];
    }
  // Only after a fresh evaluation produced ALLOW under the new fingerprint.
  | {
      kind: "RESUMED";
      at: string;
      actor: "AGENT";
      fingerprint: Fingerprint;
      checkpointDueAt: string;
    }
  | { kind: "REVOKED"; at: string; actor: "OWNER" | "SYSTEM"; reason?: string }
  | { kind: "EXPIRED"; at: string; actor: "SYSTEM" }
  | { kind: "RELEASED"; at: string; actor: "AGENT" };

export class LeaseTransitionError extends Error {
  constructor(
    readonly from: LeaseStatus | null,
    readonly event: LeaseEvent["kind"],
  ) {
    super(`ILLEGAL_LEASE_TRANSITION:${from ?? "NONE"}:${event}`);
  }
}
const bad = (s: LeaseState | null, e: LeaseEvent): never => {
  throw new LeaseTransitionError(s?.status ?? null, e.kind);
};
export function reduce(s: LeaseState | null, e: LeaseEvent): LeaseState {
  if (e.kind === "ISSUED") {
    if (s) bad(s, e);
    // A clarification can never become a lease: the missing fact has to be
    // supplied and the choice evaluated again.
    if (e.decision === "ASK" && e.ask?.kind !== "AUTHORITY_CONFIRMATION")
      return bad(s, e);
    if (e.decision === "ALLOW" && e.ask) return bad(s, e);
    return {
      epoch: e.decision === "ALLOW" ? { n: 1, rev: 1 } : { n: 0, rev: 0 },
      ask: e.decision === "ASK" ? e.ask! : null,
      status: e.decision === "ALLOW" ? "ACTIVE" : "ASK_PENDING",
      rev: 1,
      expiresAt: e.expiresAt,
      checkpointDueAt: e.checkpointDueAt,
      fingerprint: e.fingerprint,
      reasons: [],
    };
  }
  if (!s || isTerminal(s.status)) return bad(s, e);
  const next = (patch: Partial<LeaseState>): LeaseState => ({
    ...s,
    ...patch,
    rev: s.rev + 1,
  });
  switch (e.kind) {
    case "APPROVED":
      if (
        s.status !== "ASK_PENDING" ||
        s.ask?.kind !== "AUTHORITY_CONFIRMATION"
      )
        return bad(s, e);
      return next({
        epoch: { n: s.epoch.n + 1, rev: s.rev + 1 },
        status: "ACTIVE",
        fingerprint: e.fingerprint,
        expiresAt: e.expiresAt < s.expiresAt ? e.expiresAt : s.expiresAt,
        checkpointDueAt: e.checkpointDueAt,
      });
    case "DECLINED":
      if (s.status !== "ASK_PENDING") return bad(s, e);
      return next({ status: "DECLINED" });
    case "CHECKPOINT_OK":
      if (s.status !== "ACTIVE") return bad(s, e);
      return next({ checkpointDueAt: e.checkpointDueAt, reasons: [] });
    case "DRIFT":
      if (s.status !== "ACTIVE" || !e.reasons.length) return bad(s, e);
      return next({ status: "SUSPENDED", reasons: [...e.reasons].sort() });
    case "RESUMED":
      if (s.status !== "SUSPENDED") return bad(s, e);
      return next({
        epoch: { n: s.epoch.n + 1, rev: s.rev + 1 },
        status: "ACTIVE",
        fingerprint: e.fingerprint,
        checkpointDueAt: e.checkpointDueAt,
        reasons: [],
      });
    case "REVOKED":
      return next({ status: "REVOKED" });
    case "EXPIRED":
      return next({ status: "EXPIRED" });
    case "RELEASED":
      if (s.status !== "ACTIVE" && s.status !== "SUSPENDED") return bad(s, e);
      return next({ status: "RELEASED" });
  }
}
export function replay(events: LeaseEvent[]): LeaseState {
  let s: LeaseState | null = null;
  for (const e of events) s = reduce(s, e);
  if (!s) throw new LeaseTransitionError(null, "ISSUED");
  return s;
}
// What a verifier is told at `now`, applying time-based rules lazily. Expiry
// and an overdue checkpoint never depend on a background job having run.
export function observe(
  s: LeaseState,
  now: string,
): {
  status: LeaseStatus;
  reasons: DriftReason[];
  due: LeaseEvent["kind"] | null;
} {
  if (isTerminal(s.status)) return { status: s.status, reasons: [], due: null };
  if (now >= s.expiresAt)
    return { status: "EXPIRED", reasons: [], due: "EXPIRED" };
  if (s.status === "ACTIVE" && now >= s.checkpointDueAt)
    return {
      status: "SUSPENDED",
      reasons: ["CHECKPOINT_OVERDUE"],
      due: "DRIFT",
    };
  return { status: s.status, reasons: s.reasons, due: null };
}
export interface CurrentFacts {
  stateHash: string;
  policyVersion: number | null;
  grantUsable: boolean;
  passportUsable: boolean;
  activeOverrideIds: string[];
  // What the relying agent says the candidate / context is NOW, as
  // commitments. The server cannot observe the outside world: a change it was
  // never told about cannot be detected, only one that is presented.
  presentedCandidateCommitment?: string;
  presentedContextCommitment?: string;
}
export function driftReasons(
  issued: Fingerprint,
  now: CurrentFacts,
): DriftReason[] {
  const r: DriftReason[] = [];
  if (!now.passportUsable) r.push("PASSPORT_UNAVAILABLE");
  if (issued.grantId && !now.grantUsable) r.push("GRANT_UNAVAILABLE");
  if (issued.stateHash !== now.stateHash) r.push("STATE_CHANGED");
  if (issued.policyVersion !== now.policyVersion) r.push("POLICY_CHANGED");
  if (issued.overrideIds.some((id) => !now.activeOverrideIds.includes(id)))
    r.push("OVERRIDE_ENDED");
  if (
    issued.candidateCommitment &&
    now.presentedCandidateCommitment &&
    issued.candidateCommitment !== now.presentedCandidateCommitment
  )
    r.push("CANDIDATE_CHANGED");
  if (
    issued.contextCommitment &&
    now.presentedContextCommitment &&
    issued.contextCommitment !== now.presentedContextCommitment
  )
    r.push("CONTEXT_CHANGED");
  return r.sort();
}
