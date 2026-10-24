import "server-only";
import { randomInt } from "node:crypto";
import type { PoolClient } from "pg";
import { LIST_SIZE } from "@/lib/attest/status-list";

export interface AttestationRow {
  jti: string;
  leaseRef: string;
  audience: string;
  issuedAt: string;
  expiresAt: string;
  holderBound: boolean;
  delegatedTo: string | null;
}
export interface AttestRepository {
  entry(leaseRef: string): Promise<{ listId: number; idx: number } | null>;
  // Creates the lease's status entry at a random never-used index and sets its bit.
  allocate(
    leaseRef: string,
    value: number,
  ): Promise<{ listId: number; idx: number }>;
  list(listId: number): Promise<Uint8Array | null>;
  insert(a: AttestationRow): Promise<void>;
  forLease(leaseRef: string): Promise<AttestationRow[]>;
  forPassport(passportRef: string): Promise<AttestationRow[]>;
  consume(jti: string, audience: string, now: string): Promise<boolean>;
  purgeReplays(before: string): Promise<number>;
}
export function attestRepository(c: PoolClient): AttestRepository {
  return {
    async entry(ref) {
      const q = await c.query(
        "SELECT list_id,idx FROM tastepolicy.lease_status_entries WHERE lease_ref=$1",
        [ref],
      );
      return q.rows[0]
        ? { listId: q.rows[0].list_id, idx: q.rows[0].idx }
        : null;
    },
    async allocate(ref, value) {
      // Serialise allocation per list so capacity checks are exact.
      const head = await c.query(
        "SELECT list_id FROM tastepolicy.attestation_status_lists ORDER BY list_id DESC LIMIT 1 FOR UPDATE",
      );
      let listId: number = head.rows[0].list_id;
      const used = (
        await c.query(
          "SELECT count(*)::int AS n FROM tastepolicy.attestation_status_used WHERE list_id=$1",
          [listId],
        )
      ).rows[0].n as number;
      if (used >= LIST_SIZE * 0.6) {
        listId += 1;
        await c.query(
          "INSERT INTO tastepolicy.attestation_status_lists(list_id,bits,size,data) VALUES($1,2,131072,decode(repeat('00',32768),'hex'))",
          [listId],
        );
      }
      for (let i = 0; i < 64; i++) {
        const idx = randomInt(0, LIST_SIZE);
        const ins = await c.query(
          "INSERT INTO tastepolicy.attestation_status_used(list_id,idx) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [listId, idx],
        );
        if (ins.rowCount === 1) {
          await c.query(
            "INSERT INTO tastepolicy.lease_status_entries(lease_ref,list_id,idx) VALUES($1,$2,$3)",
            [ref, listId, idx],
          );
          await c.query("SELECT tastepolicy.set_status($1,$2,$3)", [
            listId,
            idx,
            value,
          ]);
          return { listId, idx };
        }
      }
      throw new Error("STATUS_LIST_FULL");
    },
    async list(listId) {
      const q = await c.query(
        "SELECT data FROM tastepolicy.attestation_status_lists WHERE list_id=$1",
        [listId],
      );
      return q.rows[0] ? new Uint8Array(q.rows[0].data) : null;
    },
    async insert(a) {
      await c.query(
        "INSERT INTO tastepolicy.attestations(jti,lease_ref,audience,issued_at,expires_at,holder_bound,delegated_to) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          a.jti,
          a.leaseRef,
          a.audience,
          a.issuedAt,
          a.expiresAt,
          a.holderBound,
          a.delegatedTo,
        ],
      );
    },
    async forLease(ref) {
      return (
        await c.query(
          "SELECT * FROM tastepolicy.attestations WHERE lease_ref=$1 ORDER BY issued_at DESC LIMIT 50",
          [ref],
        )
      ).rows.map((r) => ({
        jti: r.jti,
        leaseRef: r.lease_ref,
        audience: r.audience,
        issuedAt: new Date(r.issued_at).toISOString(),
        expiresAt: new Date(r.expires_at).toISOString(),
        holderBound: r.holder_bound,
        delegatedTo: r.delegated_to,
      }));
    },
    async forPassport(ref) {
      return (
        await c.query(
          "SELECT a.* FROM tastepolicy.attestations a JOIN tastepolicy.platform_leases l ON l.lease_ref=a.lease_ref WHERE l.passport_ref=$1 ORDER BY a.issued_at DESC LIMIT 100",
          [ref],
        )
      ).rows.map((r) => ({
        jti: r.jti,
        leaseRef: r.lease_ref,
        audience: r.audience,
        issuedAt: new Date(r.issued_at).toISOString(),
        expiresAt: new Date(r.expires_at).toISOString(),
        holderBound: r.holder_bound,
        delegatedTo: r.delegated_to,
      }));
    },
    async consume(jti, audience, now) {
      const q = await c.query(
        "INSERT INTO tastepolicy.attestation_replays(jti,audience,first_seen) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [jti, audience, now],
      );
      return q.rowCount === 1;
    },
    async purgeReplays(before) {
      return (
        (
          await c.query(
            "DELETE FROM tastepolicy.attestation_replays WHERE first_seen<$1",
            [before],
          )
        ).rowCount ?? 0
      );
    },
  };
}
