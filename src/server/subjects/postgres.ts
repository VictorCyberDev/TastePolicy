import "server-only";
import type { PoolClient } from "pg";
import type {
  SubjectRepository,
  GroupRepository,
  SubjectOperationRepository,
} from "./repositories";
export function subjectRepositories(c: PoolClient): {
  subjects: SubjectRepository;
  groups: GroupRepository;
  subjectOperations: SubjectOperationRepository;
} {
  const one = async <T>(sql: string, args: unknown[]): Promise<T | null> =>
    (await c.query(sql, args)).rows[0]?.data ?? null;
  const list = async <T>(sql: string, args: unknown[]): Promise<T[]> =>
    (await c.query(sql, args)).rows.map((r) => r.data);
  const write = async (sql: string, args: unknown[]) => {
    await c.query(sql, args);
  };
  return {
    subjects: {
      insert: (s) =>
        write("INSERT INTO tastepolicy.taste_subjects VALUES($1,$2,$3,$4,$5)", [
          s.ownerProfileId,
          s.subjectId,
          s.subjectKind,
          s.stateProfileId,
          s,
        ]),
      find: (o, id) =>
        one(
          "SELECT data FROM tastepolicy.taste_subjects WHERE owner_profile_id=$1 AND subject_id=$2",
          [o, id],
        ),
      list: (o) =>
        list(
          "SELECT data FROM tastepolicy.taste_subjects WHERE owner_profile_id=$1 ORDER BY subject_id",
          [o],
        ),
      grant: (p) =>
        write(
          "INSERT INTO tastepolicy.subject_permission_attestations VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            p.ownerProfileId,
            p.subjectId,
            p.attestationId,
            p.scopes,
            p.assuranceLevel,
            p.expiresAt,
            p,
          ],
        ),
      permission: (o, id) =>
        one(
          "SELECT data FROM tastepolicy.subject_permission_attestations WHERE owner_profile_id=$1 AND subject_id=$2",
          [o, id],
        ),
      event: (e) =>
        write(
          "INSERT INTO tastepolicy.subject_permission_events VALUES($1,$2,$3,$4,$5,$6)",
          [
            e.ownerProfileId,
            e.subjectId,
            e.eventId,
            e.attestationId,
            e.kind,
            e,
          ],
        ),
      events: (o, id) =>
        list(
          "SELECT data FROM tastepolicy.subject_permission_events WHERE owner_profile_id=$1 AND subject_id=$2 ORDER BY event_id",
          [o, id],
        ),
      provenance: (p) =>
        write(
          "INSERT INTO tastepolicy.proxy_signal_provenance VALUES($1,$2,$3,$4,$5,$6)",
          [
            p.ownerProfileId,
            p.subjectId,
            p.stateProfileId,
            p.stateVersion,
            p.attestationId,
            p,
          ],
        ),
      anchorProvenance: (o, id, n) =>
        one(
          "SELECT data FROM tastepolicy.proxy_signal_provenance WHERE owner_profile_id=$1 AND subject_id=$2 AND version=$3",
          [o, id, n],
        ),
      authorization: (o, m) =>
        write(
          "INSERT INTO tastepolicy.subject_authorizations VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
          [
            o,
            m.authorizationId,
            m.subjectId,
            m.stateProfileId,
            m.stateVersion,
            m.stateHash,
            m.candidate.id,
            m.candidate.type,
            m.contextHash,
            m.decision,
            m,
          ],
        ),
      memberAuthorization: (o, id) =>
        one(
          "SELECT data FROM tastepolicy.subject_authorizations WHERE owner_profile_id=$1 AND authorization_id=$2",
          [o, id],
        ),
      insertProxy: (o, p) =>
        write(
          "INSERT INTO tastepolicy.proxy_authorizations VALUES($1,$2,$3,$4,$5)",
          [o, p.authorizationId, p.subjectId, p.permissionAttestationId, p],
        ),
      proxy: (o, id) =>
        one(
          "SELECT data FROM tastepolicy.proxy_authorizations WHERE owner_profile_id=$1 AND authorization_id=$2",
          [o, id],
        ),
    },
    groups: {
      insert: (g) =>
        write("INSERT INTO tastepolicy.taste_groups VALUES($1,$2,$3,$4)", [
          g.ownerProfileId,
          g.groupId,
          g.currentVersion,
          g,
        ]),
      find: (o, id) =>
        one(
          "SELECT data FROM tastepolicy.taste_groups WHERE owner_profile_id=$1 AND group_id=$2",
          [o, id],
        ),
      list: (o) =>
        list(
          "SELECT data FROM tastepolicy.taste_groups WHERE owner_profile_id=$1 ORDER BY group_id",
          [o],
        ),
      version: (o, id, n) =>
        one(
          "SELECT data FROM tastepolicy.taste_group_versions WHERE owner_profile_id=$1 AND group_id=$2 AND version=$3",
          [o, id, n],
        ),
      async insertVersion(v) {
        await write(
          "INSERT INTO tastepolicy.taste_group_versions VALUES($1,$2,$3,$4,$5,$6)",
          [
            v.ownerProfileId,
            v.groupId,
            v.groupVersion,
            v.parentVersion,
            v.policyId,
            v,
          ],
        );
        for (const id of v.memberSubjectIds)
          await write(
            "INSERT INTO tastepolicy.taste_group_members VALUES($1,$2,$3,$4)",
            [v.ownerProfileId, v.groupId, v.groupVersion, id],
          );
      },
      advance: (o, id, n) =>
        write(
          "UPDATE tastepolicy.taste_groups SET current_version=$3,data=jsonb_set(data,'{currentVersion}',to_jsonb($3::integer)) WHERE owner_profile_id=$1 AND group_id=$2",
          [o, id, n],
        ),
      close: (o, id, e) =>
        write(
          "INSERT INTO tastepolicy.taste_group_events VALUES($1,$2,$3,'GROUP_DELETED')",
          [o, id, e],
        ),
      closed: async (o, id) =>
        !!(
          await c.query(
            "SELECT 1 FROM tastepolicy.taste_group_events WHERE owner_profile_id=$1 AND group_id=$2",
            [o, id],
          )
        ).rows.length,
      async insertAuthorization(o, g) {
        await write(
          "INSERT INTO tastepolicy.group_authorizations VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [
            o,
            g.authorizationId,
            g.groupId,
            g.groupVersion,
            g.candidate.id,
            g.candidate.type,
            g.contextHash,
            g.aggregateDecision,
            g.semanticHash,
            g,
          ],
        );
        for (const m of g.memberResults)
          await write(
            "INSERT INTO tastepolicy.group_member_authorizations VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
            [
              o,
              g.authorizationId,
              g.groupId,
              g.groupVersion,
              m.subjectId,
              m.stateProfileId,
              m.stateVersion,
              m.authorizationId,
              m.candidate.id,
              m.candidate.type,
              m.contextHash,
              // The column is the recorded evidence-level decision (it is
              // foreign-keyed to that evidence); the member's final, policy-aware
              // decision is part of the captured member document.
              m.policy?.baseDecision ?? m.decision,
              m,
            ],
          );
      },
      authorization: (o, id) =>
        one(
          "SELECT data FROM tastepolicy.group_authorizations WHERE owner_profile_id=$1 AND authorization_id=$2",
          [o, id],
        ),
      members: (o, id) =>
        list(
          "SELECT data FROM tastepolicy.group_member_authorizations WHERE owner_profile_id=$1 AND group_authorization_id=$2 ORDER BY subject_id",
          [o, id],
        ),
    },
    subjectOperations: {
      async find(o, op, key) {
        const row = (
          await c.query(
            "SELECT payload_hash,result FROM tastepolicy.subject_operations WHERE owner_profile_id=$1 AND operation=$2 AND key=$3",
            [o, op, key],
          )
        ).rows[0];
        return row
          ? { payloadHash: row.payload_hash, result: row.result }
          : null;
      },
      insert: (o, op, key, h, result) =>
        write(
          "INSERT INTO tastepolicy.subject_operations VALUES($1,$2,$3,$4,$5)",
          [o, op, key, h, result],
        ),
    },
  };
}
