import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { hash } from "@/server/state/hash";
import { platformFail as fail, type Principal } from "@/lib/platform/types";
import { object, id, label, key } from "@/server/subjects/common";

export class WorkspaceService {
  constructor(
    readonly pool: Pool,
    readonly clock = () => new Date().toISOString(),
  ) {}
  private async transaction<T>(
    p: Principal,
    fresh: boolean,
    work: (c: PoolClient) => Promise<T>,
  ) {
    if (p.kind !== "SESSION" || !p.sessionId) fail("ACCESS_DENIED");
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const user = await c.query(
        "SELECT id FROM tastepolicy.platform_auth_user WHERE id=$1 FOR UPDATE",
        [p.userId],
      );
      if (!user.rows.length) fail("AUTH_REQUIRED");
      const session = await c.query(
        'SELECT id FROM tastepolicy.platform_auth_session WHERE id=$1 AND "userId"=$2 AND "expiresAt">$3',
        [p.sessionId, p.userId, this.clock()],
      );
      if (!session.rows.length) fail("AUTH_REQUIRED");
      if (
        fresh &&
        Date.parse(p.authenticatedAt) < Date.parse(this.clock()) - 300000
      )
        fail("RECENT_AUTH_REQUIRED");
      const result = await work(c);
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async billingWorkspace(p: Principal, workspaceId: string, fresh = true) {
    return this.transaction(p, fresh, async (c) => {
      await this.owns(
        c,
        "developer_workspaces",
        "workspace_id",
        workspaceId,
        p.userId,
      );
      return { workspaceId };
    });
  }
  async mutate(p: Principal, operation: string, raw: unknown) {
    const fields: Record<string, string[]> = {
      "create-workspace": ["displayLabel"],
      "create-project": ["workspaceId", "displayLabel"],
      "create-environment": ["projectId", "displayLabel", "kind"],
      "register-agent": ["environmentId", "displayLabel", "externalId"],
      "bind-credential": ["environmentId", "credentialId", "agentId"],
      "sandbox-upgrade": ["workspaceId", "confirmation"],
      "sandbox-cancel": ["workspaceId", "confirmation"],
    };
    if (!Object.hasOwn(fields, operation)) fail("INVALID_INPUT");
    const v = object(raw, ["idempotencyKey", ...fields[operation]]),
      k = key(v.idempotencyKey),
      digest = hash(v);
    return this.transaction(p, true, async (c) => {
      const op = "workspace." + operation;
      const old = await c.query(
        "SELECT payload_hash,result FROM tastepolicy.platform_operations WHERE user_id=$1 AND operation=$2 AND key=$3",
        [p.userId, op, k],
      );
      if (old.rows.length) {
        if (old.rows[0].payload_hash !== digest)
          fail("IDEMPOTENCY_KEY_CONFLICT");
        return old.rows[0].result;
      }
      const now = this.clock();
      let result: Record<string, unknown>;
      if (operation === "create-workspace") {
        const count = await c.query(
          "SELECT count(*)::integer n FROM tastepolicy.developer_workspaces WHERE user_id=$1",
          [p.userId],
        );
        if (count.rows[0].n >= 1) fail("RATE_LIMITED");
        const workspaceId = randomUUID();
        await c.query(
          "INSERT INTO tastepolicy.developer_workspaces VALUES($1,$2,$3,$4)",
          [workspaceId, p.userId, label(v.displayLabel), now],
        );
        await c.query(
          "INSERT INTO tastepolicy.workspace_subscriptions(workspace_id,mode,plan,state,provider,updated_at) VALUES($1,'LIVE','FREE','ACTIVE','NONE',$2)",
          [workspaceId, now],
        );
        result = { workspaceId };
      } else if (operation === "create-project") {
        const workspaceId = id(v.workspaceId);
        await this.owns(
          c,
          "developer_workspaces",
          "workspace_id",
          workspaceId,
          p.userId,
        );
        await this.cap(c, "developer_projects", "workspace_id", workspaceId, 3);
        const projectId = randomUUID();
        await c.query(
          "INSERT INTO tastepolicy.developer_projects VALUES($1,$2,$3,$4,$5)",
          [projectId, p.userId, workspaceId, label(v.displayLabel), now],
        );
        result = { projectId };
      } else if (operation === "create-environment") {
        const projectId = id(v.projectId);
        await this.owns(
          c,
          "developer_projects",
          "project_id",
          projectId,
          p.userId,
        );
        if (v.kind !== "DEVELOPMENT" && v.kind !== "PRODUCTION")
          fail("INVALID_INPUT");
        await this.cap(c, "developer_environments", "project_id", projectId, 2);
        const environmentId = randomUUID();
        await c.query(
          "INSERT INTO tastepolicy.developer_environments VALUES($1,$2,$3,$4,$5,$6)",
          [
            environmentId,
            p.userId,
            projectId,
            label(v.displayLabel),
            v.kind,
            now,
          ],
        );
        result = { environmentId };
      } else if (operation === "register-agent") {
        const environmentId = id(v.environmentId);
        await this.owns(
          c,
          "developer_environments",
          "environment_id",
          environmentId,
          p.userId,
        );
        if (
          typeof v.externalId !== "string" ||
          !/^[a-zA-Z0-9_-]{1,64}$/.test(v.externalId)
        )
          fail("INVALID_INPUT");
        await this.cap(
          c,
          "developer_agents",
          "environment_id",
          environmentId,
          10,
        );
        const revoked = await c.query(
          "SELECT 1 FROM tastepolicy.developer_agents WHERE user_id=$1 AND external_id=$2 AND revoked_at IS NOT NULL",
          [p.userId, v.externalId],
        );
        if (revoked.rows.length) fail("ACCESS_DENIED");
        const existing = await c.query(
          "SELECT 1 FROM tastepolicy.developer_agents WHERE environment_id=$1 AND external_id=$2",
          [environmentId, v.externalId],
        );
        if (existing.rows.length) fail("IDEMPOTENCY_KEY_CONFLICT");
        const agentId = randomUUID();
        await c.query(
          "INSERT INTO tastepolicy.developer_agents VALUES($1,$2,$3,$4,$5,$6,NULL)",
          [
            agentId,
            p.userId,
            environmentId,
            v.externalId,
            label(v.displayLabel),
            now,
          ],
        );
        result = { agentId };
      } else if (operation === "bind-credential") {
        const environmentId = id(v.environmentId),
          credentialId = id(v.credentialId);
        await this.owns(
          c,
          "developer_environments",
          "environment_id",
          environmentId,
          p.userId,
        );
        await this.owns(
          c,
          "developer_credentials",
          "credential_id",
          credentialId,
          p.userId,
        );
        const agentId = id(v.agentId);
        const agent = await c.query(
          "SELECT 1 FROM tastepolicy.developer_agents WHERE user_id=$1 AND agent_id=$2 AND environment_id=$3 AND revoked_at IS NULL",
          [p.userId, agentId, environmentId],
        );
        const credential = await c.query(
          "SELECT 1 FROM tastepolicy.developer_credentials WHERE user_id=$1 AND credential_id=$2 AND NOT (data ? 'oauth')",
          [p.userId, credentialId],
        );
        if (!agent.rows.length || !credential.rows.length)
          fail("ACCESS_DENIED");
        const prior = await c.query(
          "SELECT environment_id,agent_id FROM tastepolicy.credential_environments WHERE credential_id=$1",
          [credentialId],
        );
        if (
          prior.rows.length &&
          (prior.rows[0].environment_id !== environmentId ||
            prior.rows[0].agent_id !== agentId)
        )
          fail("IDEMPOTENCY_KEY_CONFLICT");
        await c.query(
          "INSERT INTO tastepolicy.credential_environments(credential_id,agent_id,user_id,environment_id,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
          [credentialId, agentId, p.userId, environmentId, now],
        );
        result = { credentialId, environmentId, agentId };
      } else {
        const workspaceId = id(v.workspaceId);
        await this.owns(
          c,
          "developer_workspaces",
          "workspace_id",
          workspaceId,
          p.userId,
        );
        if (v.confirmation !== "SIMULATE ONLY") fail("INVALID_INPUT");
        const upgrade = operation === "sandbox-upgrade",
          eventId = "sim_" + randomUUID();
        await c.query(
          "INSERT INTO tastepolicy.workspace_subscriptions(workspace_id,mode,plan,state,provider,updated_at) VALUES($1,'SANDBOX',$2,$3,'INTERNAL_SANDBOX',$4) ON CONFLICT(workspace_id,mode) DO UPDATE SET plan=EXCLUDED.plan,state=EXCLUDED.state,updated_at=EXCLUDED.updated_at",
          [
            workspaceId,
            upgrade ? "PRO" : "FREE",
            upgrade ? "ACTIVE" : "CANCELED",
            now,
          ],
        );
        await c.query(
          "INSERT INTO tastepolicy.workspace_billing_events VALUES($1,$2,'SANDBOX',$3,$4,'usd',$5)",
          [
            eventId,
            workspaceId,
            upgrade ? "SIMULATED_INVOICE_PAID" : "SIMULATED_CANCELLATION",
            upgrade ? 4900 : 0,
            now,
          ],
        );
        result = {
          workspaceId,
          eventId,
          simulated: true,
          provider: "INTERNAL_SANDBOX",
          charged: false,
          liveEntitlementChanged: false,
        };
      }
      await c.query(
        "INSERT INTO tastepolicy.platform_operations VALUES($1,$2,$3,$4,$5)",
        [p.userId, op, k, digest, result],
      );
      return result;
    });
  }
  private async owns(
    c: PoolClient,
    table: string,
    column: string,
    value: string,
    user: string,
  ) {
    // Table/column are internal constants, never request values.
    if (
      !(
        await c.query(
          `SELECT 1 FROM tastepolicy.${table} WHERE ${column}=$1 AND user_id=$2`,
          [value, user],
        )
      ).rows.length
    )
      fail("ACCESS_DENIED");
  }
  private async cap(
    c: PoolClient,
    table: string,
    column: string,
    value: string,
    limit: number,
  ) {
    const r = await c.query(
      `SELECT count(*)::integer n FROM tastepolicy.${table} WHERE ${column}=$1`,
      [value],
    );
    if (r.rows[0].n >= limit) fail("RATE_LIMITED");
  }
  async inspect(p: Principal) {
    return this.transaction(p, false, async (c) => {
      const query = (sql: string) =>
        c.query(sql, [p.userId]).then((r) => r.rows);
      const workspaces = await query(
        "SELECT workspace_id AS id,display_label AS label,created_at FROM tastepolicy.developer_workspaces WHERE user_id=$1 ORDER BY created_at,workspace_id",
      );
      const projects = await query(
        "SELECT project_id AS id,workspace_id,display_label AS label FROM tastepolicy.developer_projects WHERE user_id=$1 ORDER BY created_at,project_id",
      );
      const environments = await query(
        "SELECT environment_id AS id,project_id,display_label AS label,kind FROM tastepolicy.developer_environments WHERE user_id=$1 ORDER BY created_at,environment_id",
      );
      const agents = await query(
        "SELECT agent_id AS id,environment_id,external_id,display_label AS label,revoked_at FROM tastepolicy.developer_agents WHERE user_id=$1 ORDER BY created_at,agent_id",
      );
      const bindings = await query(
        "SELECT credential_id,agent_id,environment_id FROM tastepolicy.credential_environments WHERE user_id=$1",
      );
      const subscriptions = await query(
        "SELECT s.workspace_id,s.mode,s.plan,s.state,s.provider,s.updated_at FROM tastepolicy.workspace_subscriptions s JOIN tastepolicy.developer_workspaces w USING(workspace_id) WHERE w.user_id=$1 ORDER BY s.workspace_id,s.mode",
      );
      const invoices = await query(
        "SELECT e.event_id,e.workspace_id,e.mode,e.kind,e.amount_minor,e.currency,e.at FROM tastepolicy.workspace_billing_events e JOIN tastepolicy.developer_workspaces w USING(workspace_id) WHERE w.user_id=$1 ORDER BY e.at DESC LIMIT 50",
      );
      const outcomes =
        await query(`SELECT COALESCE(d.final_outcome,e.data->'evaluation'->'decision'->>'outcome') AS decision,count(*)::integer AS count
        FROM tastepolicy.platform_evaluations e LEFT JOIN tastepolicy.platform_policy_decisions d USING(evaluation_ref)
        WHERE e.user_id=$1 AND (e.data->'evaluation'->>'evaluatedAt')::timestamptz >= now()-interval '30 days'
        GROUP BY 1`);
      const captured =
        await query(`SELECT count(*)::integer AS total,max((data->'evaluation'->>'evaluatedAt')::timestamptz) AS latest_receipt_at
        FROM tastepolicy.platform_evaluations WHERE user_id=$1`);
      const leases = await query(
        `SELECT status,count(*)::integer AS count FROM tastepolicy.platform_leases WHERE owner_id=$1 GROUP BY status`,
      );
      const proofs = await query(
        `SELECT count(*)::integer AS count FROM tastepolicy.attestations a JOIN tastepolicy.platform_leases l USING(lease_ref) WHERE l.owner_id=$1`,
      );
      const policy = await query(
        `SELECT a.version,v.document->'actions' AS action_ceilings FROM tastepolicy.policy_active a JOIN tastepolicy.policy_versions v USING(passport_ref,version) JOIN tastepolicy.taste_passports p USING(passport_ref) WHERE p.user_id=$1`,
      );
      return {
        metrics: {
          windowDays: 30,
          outcomes,
          captured: captured[0],
          recordedLeases: leases,
          issuedProofs: proofs[0]?.count ?? 0,
          activePolicy: policy[0] ?? null,
          leaseStatesRequireFreshVerification: true,
        },
        workspaces,
        projects,
        environments,
        agents,
        bindings,
        subscriptions,
        invoices,
        organizationMembersSupported: false,
        liveBillingConfigured: false,
      };
    });
  }
}
