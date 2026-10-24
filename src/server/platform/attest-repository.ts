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
  epoch: number;
  epochCommitment: string;
}
export interface AttestRepository {
  // Creates a status entry for one attestation at a random never-used index.
  allocate(
    leaseRef: string,
    value: number,
  ): Promise<{ listId: number; idx: number }>;
  list(listId: number): Promise<Uint8Array | null>;
  // Changes whenever any status bit in the list changes.
  listVersion(listId: number): Promise<string | null>;
  insert(a: AttestationRow): Promise<void>;
  forLease(leaseRef: string): Promise<AttestationRow[]>;
  forPassport(passportRef: string): Promise<AttestationRow[]>;
  consume(jti: string, audience: string, now: string): Promise<boolean>;
  purgeReplays(before: string): Promise<number>;
}
export function attestRepository(c: PoolClient): AttestRepository {
  return {
    async allocate(ref, value) {
      // One allocator at a time: capacity checks and new-list creation are exact.
      await c.query("SELECT pg_advisory_xact_lock(90210)");
      const head = await c.query(
        "SELECT list_id FROM tastepolicy.attestation_status_lists ORDER BY list_id DESC LIMIT 1",
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
            "INSERT INTO tastepolicy.lease_status_entries(list_id,idx,lease_ref) VALUES($1,$2,$3)",
            [listId, idx, ref],
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
    async listVersion(listId) {
      const q = await c.query(
        "SELECT updated_at::text AS v FROM tastepolicy.attestation_status_lists WHERE list_id=$1",
        [listId],
      );
      return q.rows[0]?.v ?? null;
    },
    async insert(a) {
      await c.query(
        "INSERT INTO tastepolicy.attestations(jti,lease_ref,audience,issued_at,expires_at,holder_bound,delegated_to,epoch,epoch_commitment) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          a.jti,
          a.leaseRef,
          a.audience,
          a.issuedAt,
          a.expiresAt,
          a.holderBound,
          a.delegatedTo,
          a.epoch,
          a.epochCommitment,
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
        epoch: r.epoch,
        epochCommitment: r.epoch_commitment,
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
        epoch: r.epoch,
        epochCommitment: r.epoch_commitment,
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
