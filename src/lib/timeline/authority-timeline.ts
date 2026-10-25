// Unified authority timeline: a derived read model over records that already
// exist and are append-only (evaluations, policy versions, overrides, lease
// events, issued proofs, state versions, grants, credentials, connected
// assistants). It is never a source of truth: nothing here can change an
// answer, and it can be rebuilt at any time. Identifiers the person has no use
// for are reduced to a short reference; no state hash, account id or secret is
// ever included.
import type { LeaseEvent } from "@/lib/lease/machine";
import { describeAsk, type AskKind } from "@/lib/lease/ask";

export const TIMELINE_SCHEMA = "taste-authority-timeline-v1";
export type TimelineKind =
  | "PASSPORT_CREATED"
  | "STATE_CHANGED"
  | "POLICY_PUBLISHED"
  | "OVERRIDE_CREATED"
  | "OVERRIDE_ENDED"
  | "EVALUATED"
  | "LEASE_ISSUED"
  | "APPROVED"
  | "DECLINED"
  | "CHECKPOINT"
  | "PAUSED"
  | "RESUMED"
  | "LEASE_ENDED"
  | "PROOF_ISSUED"
  | "PROOFS_INVALIDATED"
  | "ACCESS_GRANTED"
  | "ACCESS_ENDED"
  | "AGENT_KEY_CREATED"
  | "AGENT_KEY_REVOKED"
  | "ASSISTANT_CONNECTED"
  | "ASSISTANT_DISCONNECTED";
export interface TimelineEvent {
  at: string;
  kind: TimelineKind;
  actor: "OWNER" | "AGENT" | "SYSTEM";
  title: string;
  detail?: string;
  // Short opaque reference for support and cross-checking; never an identifier
  // that works as a credential.
  ref?: string;
  // Expandable technical facts for people who want them.
  technical?: Record<string, unknown>;
}
type Outcome = "ALLOW" | "ASK" | "REJECT" | "UNAVAILABLE";
export interface TimelineInput {
  now: string;
  passportCreatedAt?: string;
  states: { version: number; createdAt: string }[];
  policies: { version: number; createdAt: string; note: string | null }[];
  overrides: {
    overrideId: string;
    effect: string;
    scope: {
      candidateId?: string;
      contextKey?: string;
      domain?: string;
      agentId?: string;
    };
    createdAt: string;
    expiresAt: string;
    revokedAt?: string;
  }[];
  evaluations: {
    evaluationRef: string;
    at: string;
    agentId: string;
    candidateName: string;
    outcome: Outcome;
    baseOutcome?: Outcome;
    basis: string;
    rules: string[];
    policyVersion: number | null;
    requestedAction?: string;
  }[];
  leases: {
    leaseRef: string;
    agentId: string;
    candidateName: string;
    events: LeaseEvent[];
  }[];
  attestations: {
    leaseRef: string;
    jti: string;
    audience: string;
    issuedAt: string;
    holderBound: boolean;
    delegatedTo: string | null;
    epoch: number;
  }[];
  grants: {
    grantId: string;
    issuedAt: string;
    expiresAt: string;
    purpose: string;
    revokedAt?: string;
  }[];
  credentials: {
    credentialId: string;
    displayLabel: string;
    createdAt: string;
    revokedAt?: string;
  }[];
  assistants: {
    familyId: string;
    clientName: string;
    connectedAt: string;
    revokedAt?: string;
  }[];
}
const RANK: Record<TimelineKind, number> = {
  PASSPORT_CREATED: 0,
  AGENT_KEY_CREATED: 1,
  ASSISTANT_CONNECTED: 1,
  ACCESS_GRANTED: 1,
  STATE_CHANGED: 2,
  POLICY_PUBLISHED: 3,
  OVERRIDE_CREATED: 4,
  EVALUATED: 5,
  LEASE_ISSUED: 6,
  APPROVED: 7,
  DECLINED: 7,
  PROOF_ISSUED: 8,
  CHECKPOINT: 9,
  PAUSED: 10,
  PROOFS_INVALIDATED: 11,
  RESUMED: 12,
  OVERRIDE_ENDED: 13,
  LEASE_ENDED: 14,
  ACCESS_ENDED: 15,
  AGENT_KEY_REVOKED: 15,
  ASSISTANT_DISCONNECTED: 15,
};
const short = (r: string) => r.replace(/^[a-z]+_/, "").slice(0, 8);
const host = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
};
const OUTCOME: Record<Outcome, string> = {
  ALLOW: "allowed",
  ASK: "needs your answer",
  REJECT: "not a match",
  UNAVAILABLE: "could not be checked",
};
const REASON: Record<string, string> = {
  STATE_CHANGED: "your taste information changed",
  POLICY_CHANGED: "your rules changed",
  GRANT_UNAVAILABLE: "a share ended or expired",
  OVERRIDE_ENDED: "a temporary permission ended",
  CANDIDATE_CHANGED: "the choice itself changed",
  CONTEXT_CHANGED: "the situation changed, such as the price",
  PASSPORT_UNAVAILABLE: "the Passport is no longer available",
  CHECKPOINT_OVERDUE: "the agent did not check in on time",
};
export function buildAuthorityTimeline(
  i: TimelineInput,
  limit = 200,
): {
  schemaVersion: typeof TIMELINE_SCHEMA;
  events: TimelineEvent[];
  truncated: boolean;
} {
  const out: TimelineEvent[] = [];
  const add = (e: TimelineEvent) => out.push(e);
  if (i.passportCreatedAt)
    add({
      at: i.passportCreatedAt,
      kind: "PASSPORT_CREATED",
      actor: "OWNER",
      title: "You created your Taste Passport",
    });
  for (const s of i.states)
    if (s.version > 1)
      add({
        at: s.createdAt,
        kind: "STATE_CHANGED",
        actor: "OWNER",
        title: "Your taste information changed",
        detail:
          "Choices checked before this moment are re-checked, not reused.",
        technical: { stateVersion: s.version },
      });
  for (const p of i.policies)
    add({
      at: p.createdAt,
      kind: "POLICY_PUBLISHED",
      actor: "OWNER",
      title: `You published your rules, version ${p.version}`,
      detail: p.note ?? undefined,
      technical: { policyVersion: p.version },
    });
  for (const o of i.overrides) {
    add({
      at: o.createdAt,
      kind: "OVERRIDE_CREATED",
      actor: "OWNER",
      title: "You gave a temporary permission",
      detail: `Until ${o.expiresAt.slice(0, 10)}${o.scope.agentId ? `, for ${o.scope.agentId}` : ""}`,
      ref: short(o.overrideId),
      technical: { effect: o.effect, scope: Object.keys(o.scope) },
    });
    const ended =
      o.revokedAt ?? (o.expiresAt <= i.now ? o.expiresAt : undefined);
    if (ended)
      add({
        at: ended,
        kind: "OVERRIDE_ENDED",
        actor: o.revokedAt ? "OWNER" : "SYSTEM",
        title: o.revokedAt
          ? "You ended a temporary permission"
          : "A temporary permission expired",
        ref: short(o.overrideId),
      });
  }
  for (const e of i.evaluations) {
    const ask = e.outcome === "ASK" ? describeAsk(e.basis, e.rules) : null;
    add({
      at: e.at,
      kind: "EVALUATED",
      actor: "AGENT",
      title: `${e.agentId} asked about “${e.candidateName}”: ${OUTCOME[e.outcome]}`,
      detail:
        e.outcome === "UNAVAILABLE"
          ? "Taste could not be checked. That is not a no."
          : ask
            ? ask.kind === "AUTHORITY_CONFIRMATION"
              ? `Your own rule asks first. ${ask.question}`
              : `A fact is missing. ${ask.question}`
            : undefined,
      ref: short(e.evaluationRef),
      technical: {
        decision: e.outcome,
        baseDecision: e.baseOutcome,
        basis: e.basis,
        rules: e.rules,
        policyVersion: e.policyVersion,
        requestedAction: e.requestedAction,
        askKind: ask?.kind as AskKind | undefined,
      },
    });
  }
  for (const l of i.leases) {
    let epoch = 0;
    const atts = i.attestations.filter((a) => a.leaseRef === l.leaseRef);
    for (const ev of l.events) {
      const ref = short(l.leaseRef);
      const who = l.agentId;
      if (ev.kind === "ISSUED") {
        if (ev.decision === "ALLOW") epoch = 1;
        add({
          at: ev.at,
          kind: "LEASE_ISSUED",
          actor: "AGENT",
          title:
            ev.decision === "ALLOW"
              ? `${who} was given short-lived authority for “${l.candidateName}”`
              : `${who} is waiting for your answer about “${l.candidateName}”`,
          ref,
          technical: { epoch, decision: ev.decision, askKind: ev.ask?.kind },
        });
      } else if (ev.kind === "APPROVED") {
        epoch += 1;
        add({
          at: ev.at,
          kind: "APPROVED",
          actor: "OWNER",
          title: `You allowed “${l.candidateName}” for ${who}`,
          ref,
          technical: { epoch },
        });
      } else if (ev.kind === "DECLINED")
        add({
          at: ev.at,
          kind: "DECLINED",
          actor: "OWNER",
          title: `You said no to “${l.candidateName}”`,
          ref,
        });
      else if (ev.kind === "CHECKPOINT_OK")
        add({
          at: ev.at,
          kind: "CHECKPOINT",
          actor: "AGENT",
          title: `${who} checked in`,
          ref,
          technical: { epoch },
        });
      else if (ev.kind === "RESUMED") {
        epoch += 1;
        add({
          at: ev.at,
          kind: "RESUMED",
          actor: "AGENT",
          title: `${who} was re-checked and authority resumed`,
          detail:
            "This is a new period of authority. Earlier proofs do not return.",
          ref,
          technical: { epoch },
        });
      } else {
        const ending =
          ev.kind === "DRIFT" ||
          ev.kind === "REVOKED" ||
          ev.kind === "EXPIRED" ||
          ev.kind === "RELEASED";
        if (ev.kind === "DRIFT")
          add({
            at: ev.at,
            kind: "PAUSED",
            actor: ev.actor,
            title: `Authority for ${who} was paused`,
            detail: `Because ${ev.reasons.map((r) => REASON[r] ?? r).join(" and ")}. A fresh check is needed.`,
            ref,
            technical: { epoch, reasons: ev.reasons },
          });
        else if (ev.kind === "REVOKED")
          add({
            at: ev.at,
            kind: "LEASE_ENDED",
            actor: ev.actor,
            title:
              ev.actor === "OWNER"
                ? `You ended authority for ${who}`
                : `Authority for ${who} ended`,
            ref,
            technical: { epoch, reason: ev.reason },
          });
        else if (ev.kind === "EXPIRED")
          add({
            at: ev.at,
            kind: "LEASE_ENDED",
            actor: "SYSTEM",
            title: `Authority for ${who} expired`,
            ref,
            technical: { epoch },
          });
        else if (ev.kind === "RELEASED")
          add({
            at: ev.at,
            kind: "LEASE_ENDED",
            actor: "AGENT",
            title: `${who} finished with it`,
            ref,
            technical: { epoch },
          });
        if (ending) {
          const n = atts.filter(
            (a) => a.epoch === epoch && a.issuedAt <= ev.at,
          ).length;
          if (n)
            add({
              at: ev.at,
              kind: "PROOFS_INVALIDATED",
              actor: "SYSTEM",
              title: `${n} shared proof${n === 1 ? "" : "s"} stopped being valid`,
              detail: "They do not come back, even if authority resumes.",
              ref,
              technical: { epoch, count: n },
            });
        }
      }
    }
    for (const a of atts)
      add({
        at: a.issuedAt,
        kind: "PROOF_ISSUED",
        actor: "AGENT",
        title: `A signed proof was issued for ${host(a.audience)}`,
        detail: a.delegatedTo
          ? `Handed to ${a.delegatedTo}${a.holderBound ? ", usable only with its key" : ""}.`
          : a.holderBound
            ? "Usable only with the receiver's key."
            : undefined,
        ref: short(a.jti),
        technical: { epoch: a.epoch, holderBound: a.holderBound },
      });
  }
  for (const g of i.grants) {
    add({
      at: g.issuedAt,
      kind: "ACCESS_GRANTED",
      actor: "OWNER",
      title: "You shared access to your Passport",
      detail: g.purpose,
      ref: short(g.grantId),
      technical: { expiresAt: g.expiresAt },
    });
    if (g.revokedAt)
      add({
        at: g.revokedAt,
        kind: "ACCESS_ENDED",
        actor: "OWNER",
        title: "You ended shared access",
        ref: short(g.grantId),
      });
  }
  for (const c of i.credentials) {
    add({
      at: c.createdAt,
      kind: "AGENT_KEY_CREATED",
      actor: "OWNER",
      title: `You created an agent key: ${c.displayLabel}`,
      ref: short(c.credentialId),
    });
    if (c.revokedAt)
      add({
        at: c.revokedAt,
        kind: "AGENT_KEY_REVOKED",
        actor: "OWNER",
        title: `You revoked an agent key: ${c.displayLabel}`,
        ref: short(c.credentialId),
      });
  }
  for (const a of i.assistants) {
    add({
      at: a.connectedAt,
      kind: "ASSISTANT_CONNECTED",
      actor: "OWNER",
      title: `You connected ${a.clientName}`,
      ref: short(a.familyId),
    });
    if (a.revokedAt)
      add({
        at: a.revokedAt,
        kind: "ASSISTANT_DISCONNECTED",
        actor: "OWNER",
        title: `${a.clientName} was disconnected`,
        ref: short(a.familyId),
      });
  }
  // Newest first. Events at the same instant are ordered by what must have
  // happened first (a Passport before its rules, a question before its answer),
  // so the story never reads backwards.
  const indexed = out.map((e, n) => ({ e, n }));
  indexed.sort((a, b) =>
    a.e.at < b.e.at
      ? 1
      : a.e.at > b.e.at
        ? -1
        : RANK[b.e.kind] - RANK[a.e.kind] || a.n - b.n,
  );
  const events = indexed.map((x) => x.e);
  return {
    schemaVersion: TIMELINE_SCHEMA,
    events: events.slice(0, limit),
    truncated: events.length > limit,
  };
}
