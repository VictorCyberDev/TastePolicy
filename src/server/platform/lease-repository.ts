import "server-only";
import type { PoolClient } from "pg";
import type { LeaseEvent, LeaseState } from "@/lib/lease/machine";

export interface LeaseRecord {
  leaseRef: string;
  passportRef: string;
  ownerId: string;
  actorId: string;
  grantId: string | null;
  evaluationRef: string;
  agentId: string;
  candidateId: string;
  contextKey: string;
  permitted: string[];
  issuedAt: string;
  checkpointSeconds: number;
  candidateName: string;
  state: LeaseState;
}
export interface LeaseRepository {
  insert(l: LeaseRecord): Promise<void>;
  get(ref: string, lock?: boolean): Promise<LeaseRecord | null>;
  update(l: LeaseRecord, expectedRev: number): Promise<boolean>;
  append(ref: string, seq: number, e: LeaseEvent): Promise<void>;
  events(ref: string): Promise<LeaseEvent[]>;
  forPassport(passportRef: string, limit: number): Promise<LeaseRecord[]>;
  liveForPassport(passportRef: string): Promise<LeaseRecord[]>;
  countLive(passportRef: string): Promise<number>;
  live(
    passportRef: string,
    actorId: string,
    agentId: string,
    candidateId: string,
    contextKey: string,
  ): Promise<LeaseRecord | null>;
}
const iso = (v: unknown) => new Date(v as string).toISOString();
type Row = {
  lease_ref: string;
  passport_ref: string;
  owner_id: string;
  actor_id: string;
  grant_id: string | null;
  evaluation_ref: string;
  agent_id: string;
  candidate_id: string;
  context_key: string;
  permitted: string[];
  issued_at: string;
  status: LeaseState["status"];
  rev: number;
  expires_at: string;
  checkpoint_due_at: string;
  data: {
    fingerprint: LeaseState["fingerprint"];
    reasons: LeaseState["reasons"];
    ask?: LeaseState["ask"];
    checkpointSeconds: number;
    candidateName: string;
  };
};
function rec(r: Row): LeaseRecord {
  return {
    leaseRef: r.lease_ref,
    passportRef: r.passport_ref,
    ownerId: r.owner_id,
    actorId: r.actor_id,
    grantId: r.grant_id,
    evaluationRef: r.evaluation_ref,
    agentId: r.agent_id,
    candidateId: r.candidate_id,
    contextKey: r.context_key,
    permitted: r.permitted,
    issuedAt: iso(r.issued_at),
    checkpointSeconds: r.data.checkpointSeconds,
    candidateName: r.data.candidateName,
    // The authoritative state is the projection columns; reasons and the
    // fingerprint live in data.
    state: {
      status: r.status,
      rev: r.rev,
      expiresAt: iso(r.expires_at),
      checkpointDueAt: iso(r.checkpoint_due_at),
      fingerprint: r.data.fingerprint,
      reasons: r.data.reasons,
      ask: r.data.ask ?? null,
    },
  };
}
export function leaseRepository(c: PoolClient): LeaseRepository {
  return {
    async insert(l) {
      await c.query(
        "INSERT INTO tastepolicy.platform_leases(lease_ref,passport_ref,owner_id,actor_id,grant_id,evaluation_ref,agent_id,candidate_id,context_key,permitted,status,rev,issued_at,expires_at,checkpoint_due_at,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)",
        [
          l.leaseRef,
          l.passportRef,
          l.ownerId,
          l.actorId,
          l.grantId,
          l.evaluationRef,
          l.agentId,
          l.candidateId,
          l.contextKey,
          l.permitted,
          l.state.status,
          l.state.rev,
          l.issuedAt,
          l.state.expiresAt,
          l.state.checkpointDueAt,
          {
            fingerprint: l.state.fingerprint,
            reasons: l.state.reasons,
            ask: l.state.ask,
            checkpointSeconds: l.checkpointSeconds,
            candidateName: l.candidateName,
          },
        ],
      );
    },
    async get(ref, lock = false) {
      const q = await c.query(
        "SELECT * FROM tastepolicy.platform_leases WHERE lease_ref=$1" +
          (lock ? " FOR UPDATE" : ""),
        [ref],
      );
      return q.rows[0] ? rec(q.rows[0]) : null;
    },
    async update(l, expectedRev) {
      const q = await c.query(
        "UPDATE tastepolicy.platform_leases SET status=$3,rev=$4,expires_at=$5,checkpoint_due_at=$6,data=$7 WHERE lease_ref=$1 AND rev=$2",
        [
          l.leaseRef,
          expectedRev,
          l.state.status,
          l.state.rev,
          l.state.expiresAt,
          l.state.checkpointDueAt,
          {
            fingerprint: l.state.fingerprint,
            reasons: l.state.reasons,
            ask: l.state.ask,
            checkpointSeconds: l.checkpointSeconds,
            candidateName: l.candidateName,
          },
        ],
      );
      return (q.rowCount ?? 0) === 1;
    },
    async append(ref, seq, e) {
      await c.query(
        "INSERT INTO tastepolicy.lease_events(lease_ref,seq,kind,at,actor,data) VALUES($1,$2,$3,$4,$5,$6)",
        [ref, seq, e.kind, e.at, e.actor, e],
      );
    },
    async events(ref) {
      return (
        await c.query(
          "SELECT data FROM tastepolicy.lease_events WHERE lease_ref=$1 ORDER BY seq",
          [ref],
        )
      ).rows.map((r) => r.data as LeaseEvent);
    },
    async forPassport(ref, limit) {
      return (
        await c.query(
          "SELECT * FROM tastepolicy.platform_leases WHERE passport_ref=$1 ORDER BY issued_at DESC, lease_ref LIMIT $2",
          [ref, limit],
        )
      ).rows.map(rec);
    },
    async countLive(ref) {
      const q = await c.query(
        "SELECT count(*)::int AS n FROM tastepolicy.platform_leases WHERE passport_ref=$1 AND status IN ('ASK_PENDING','ACTIVE','SUSPENDED')",
        [ref],
      );
      return q.rows[0].n as number;
    },
    async liveForPassport(ref) {
      return (
        await c.query(
          "SELECT * FROM tastepolicy.platform_leases WHERE passport_ref=$1 AND status IN ('ASK_PENDING','ACTIVE','SUSPENDED') ORDER BY lease_ref FOR UPDATE",
          [ref],
        )
      ).rows.map(rec);
    },
    async live(passportRef, actorId, agentId, candidateId, contextKey) {
      const q = await c.query(
        "SELECT * FROM tastepolicy.platform_leases WHERE passport_ref=$1 AND actor_id=$2 AND agent_id=$3 AND candidate_id=$4 AND context_key=$5 AND status IN ('ASK_PENDING','ACTIVE','SUSPENDED') FOR UPDATE",
        [passportRef, actorId, agentId, candidateId, contextKey],
      );
      return q.rows[0] ? rec(q.rows[0]) : null;
    },
  };
}
