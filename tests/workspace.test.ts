// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- assertions over service JSON records */
import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { generateKeyPair, exportJWK, calculateJwkThumbprint } from "jose";
import {
  platformDatabase,
  account,
  init,
  subjectProvider,
  future,
} from "./platform-fixtures";
import { WorkspaceService } from "@/server/platform/workspace-service";
import { AttestationService } from "@/server/platform/attest-service";
import { proposal, reqId } from "./interactive-fixtures";
import { getStatus } from "@/lib/attest/status-list";
import { VCT } from "@/lib/attest/issue";
let d: Awaited<ReturnType<typeof platformDatabase>>, service: WorkspaceService;
beforeAll(async () => {
  d = await platformDatabase();
  service = new WorkspaceService(d.store.pool);
}, 30000);
afterAll(async () => d?.db.close());
async function world() {
  const a = await account(d);
  const run = (op: string, input: Record<string, unknown> = {}) =>
    service.mutate(a.principal, op, {
      idempotencyKey: randomUUID(),
      ...input,
    }) as Promise<any>;
  const { workspaceId } = await run("create-workspace", {
    displayLabel: "Synthetic workspace",
  });
  const { projectId } = await run("create-project", {
    workspaceId,
    displayLabel: "Synthetic app",
  });
  const { environmentId } = await run("create-environment", {
    projectId,
    displayLabel: "Synthetic development",
    kind: "DEVELOPMENT",
  });
  return { a, run, workspaceId, projectId, environmentId };
}
it("requires a live session and recent authentication for namespace mutations", async () => {
  const { a } = await world();
  await expect(
    service.inspect({ ...a.principal, kind: "CREDENTIAL" }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  await expect(
    service.mutate(
      {
        ...a.principal,
        authenticatedAt: new Date(Date.now() - 600000).toISOString(),
      },
      "create-workspace",
      { displayLabel: "x", idempotencyKey: "stale" },
    ),
  ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
  await d.auth.api.signOut({ headers: new Headers({ cookie: a.cookie }) });
  await expect(service.inspect(a.principal)).rejects.toMatchObject({
    code: "AUTH_REQUIRED",
  });
});
it("isolates every parent lookup and enforces the same ownership in composite foreign keys", async () => {
  const w = await world(),
    b = await account(d);
  await expect(
    service.mutate(b.principal, "create-project", {
      workspaceId: w.workspaceId,
      displayLabel: "Intrusion",
      idempotencyKey: "cross",
    }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  await expect(
    service.mutate(b.principal, "register-agent", {
      environmentId: w.environmentId,
      externalId: "bad",
      displayLabel: "Intrusion",
      idempotencyKey: "cross-agent",
    }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  await expect(
    d.db.query(
      "INSERT INTO tastepolicy.developer_projects VALUES($1,$2,$3,'invalid',now())",
      [randomUUID(), b.principal.userId, w.workspaceId],
    ),
  ).rejects.toThrow();
  expect((await service.inspect(b.principal)).workspaces).toEqual([]);
});
it("replays an enrollment without duplicating it and rejects changed payloads", async () => {
  const a = await account(d),
    body = { displayLabel: "Idempotent", idempotencyKey: "workspace-once" };
  expect(await service.mutate(a.principal, "create-workspace", body)).toEqual(
    await service.mutate(a.principal, "create-workspace", body),
  );
  expect((await service.inspect(a.principal)).workspaces).toHaveLength(1);
  await expect(
    service.mutate(a.principal, "create-workspace", {
      ...body,
      displayLabel: "Changed",
    }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
  await expect(
    service.mutate(a.principal, "create-workspace", {
      ...body,
      plan: "ENTERPRISE",
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
it("binds only owned credentials once, without exposing their secret hash", async () => {
  const w = await world(),
    key = await d.service.issueKey(w.a.principal, {
      displayLabel: "Namespace key",
      scopes: ["PASSPORT_READ"],
      expiresAt: future(),
      idempotencyKey: "namespace-key",
    });
  const registered = await w.run("register-agent", {
    environmentId: w.environmentId,
    externalId: "bound-agent",
    displayLabel: "Bound agent",
  });
  await w.run("bind-credential", {
    agentId: registered.agentId,
    credentialId: key.credential.credentialId,
    environmentId: w.environmentId,
  });
  const other = await w.run("create-environment", {
    projectId: w.projectId,
    displayLabel: "Production",
    kind: "PRODUCTION",
  });
  const otherAgent = await w.run("register-agent", {
    environmentId: other.environmentId,
    externalId: "other-bound-agent",
    displayLabel: "Other agent",
  });
  await expect(
    w.run("bind-credential", {
      credentialId: key.credential.credentialId,
      environmentId: other.environmentId,
      agentId: otherAgent.agentId,
    }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
  const snapshot = await service.inspect(w.a.principal);
  expect(snapshot.bindings).toEqual([
    {
      credential_id: key.credential.credentialId,
      agent_id: registered.agentId,
      environment_id: w.environmentId,
    },
  ]);
  expect(JSON.stringify(snapshot)).not.toContain(key.secret);
  expect(JSON.stringify(snapshot)).not.toContain("secret_hash");
});
it("keeps internal sandbox invoices and entitlements separate from the live Free plan", async () => {
  const w = await world(),
    input = {
      workspaceId: w.workspaceId,
      confirmation: "SIMULATE ONLY",
      idempotencyKey: "simulation-once",
    };
  const first = await w.run("sandbox-upgrade", input);
  expect(await w.run("sandbox-upgrade", input)).toEqual(first);
  expect(first).toMatchObject({
    charged: false,
    simulated: true,
    liveEntitlementChanged: false,
  });
  let state = await service.inspect(w.a.principal);
  expect(state.invoices).toHaveLength(1);
  expect(state.subscriptions.find((x) => x.mode === "LIVE")).toMatchObject({
    plan: "FREE",
    provider: "NONE",
  });
  expect(state.subscriptions.find((x) => x.mode === "SANDBOX")).toMatchObject({
    plan: "PRO",
    provider: "INTERNAL_SANDBOX",
  });
  await w.run("sandbox-cancel", {
    workspaceId: w.workspaceId,
    confirmation: "SIMULATE ONLY",
  });
  state = await service.inspect(w.a.principal);
  expect(state.subscriptions.find((x) => x.mode === "SANDBOX")).toMatchObject({
    plan: "FREE",
    state: "CANCELED",
  });
  expect(state.subscriptions.find((x) => x.mode === "LIVE")).toMatchObject({
    plan: "FREE",
    state: "ACTIVE",
  });
  await expect(
    d.db.query(
      "UPDATE tastepolicy.workspace_subscriptions SET plan='PRO' WHERE workspace_id=$1 AND mode='LIVE'",
      [w.workspaceId],
    ),
  ).rejects.toThrow();
});
it("atomically revokes agent leases and issued status entries, and stops new evaluation and lease creation", async () => {
  const w = await world(),
    q = subjectProvider(),
    keys = await generateKeyPair("ES256", { extractable: true }),
    pub = await exportJWK(keys.publicKey),
    kid = await calculateJwkThumbprint(pub),
    issuer = "https://workspace.test";
  const svc = new AttestationService(
    d.store,
    () => new Date().toISOString(),
    async () => ({
      issuer,
      signer: { key: keys.privateKey, alg: "ES256", kid },
      epochKey: new Uint8Array(32).fill(9),
      jwks: { keys: [{ ...pub, kid, alg: "ES256", use: "sig" }] },
      keys: { active: kid, next: [], retired: [], revoked: [] },
      trusted: {
        [issuer]: {
          jwks: { keys: [{ ...pub, kid, alg: "ES256", use: "sig" }] },
          vct: [VCT],
        },
      },
    }),
  );
  const passport = await svc.initialize(w.a.principal, init(), () => q.q),
    proposed = proposal(1);
  const registered = await w.run("register-agent", {
    environmentId: w.environmentId,
    externalId: proposed.agentId,
    displayLabel: "Revocable agent",
  });
  const issued = await svc.issueKey(w.a.principal, {
    displayLabel: "Bound key",
    scopes: ["PASSPORT_READ", "TASTE_EVALUATE", "RECEIPT_READ"],
    expiresAt: future(),
    idempotencyKey: "bound-key",
  });
  await w.run("bind-credential", {
    credentialId: issued.credential.credentialId,
    environmentId: w.environmentId,
    agentId: registered.agentId,
  });
  const actor = await svc.credentialPrincipal(issued.secret!);
  await expect(
    svc.evaluate(
      actor,
      {
        passportRef: passport.passportRef,
        proposal: { ...proposed, agentId: "renamed-agent" },
        idempotencyKey: "renamed",
      },
      () => q.q,
      reqId,
    ),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  const evaluation = (await svc.evaluate(
    actor,
    {
      passportRef: passport.passportRef,
      proposal: proposed,
      idempotencyKey: "before-revoke",
    },
    () => q.q,
    reqId,
  )) as any;
  const lease = (await svc.leaseRequest(actor, {
    evaluationRef: evaluation.evaluationRef,
    idempotencyKey: "before-revoke-lease",
  })) as any;
  await svc.attestationIssue(actor, {
    leaseRef: lease.leaseRef,
    audience: "https://receiver.test",
  });
  const entries = await d.db.query<{ idx: number; data: Uint8Array }>(
    "SELECT e.idx,s.data FROM tastepolicy.lease_status_entries e JOIN tastepolicy.attestation_status_lists s USING(list_id) WHERE e.lease_ref=$1",
    [lease.leaseRef],
  );
  expect(getStatus(entries.rows[0].data, entries.rows[0].idx, 2)).toBe(0);
  const revoked = await svc.revokeRegisteredAgent(w.a.principal, {
    agentId: registered.agentId,
  });
  expect(revoked).toMatchObject({
    authorityRevoked: true,
    newlyRevokedLeases: 1,
  });
  await expect(svc.credentialPrincipal(issued.secret!)).rejects.toMatchObject({
    code: "CREDENTIAL_REVOKED",
  });
  await expect(
    w.run("register-agent", {
      environmentId: w.environmentId,
      externalId: proposed.agentId,
      displayLabel: "Resurrect",
    }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  const ended = await d.db.query<{
    status: string;
    data: Uint8Array;
    idx: number;
  }>(
    "SELECT l.status,e.idx,s.data FROM tastepolicy.platform_leases l JOIN tastepolicy.lease_status_entries e USING(lease_ref) JOIN tastepolicy.attestation_status_lists s USING(list_id) WHERE l.lease_ref=$1",
    [lease.leaseRef],
  );
  expect(ended.rows[0].status).toBe("REVOKED");
  expect(getStatus(ended.rows[0].data, ended.rows[0].idx, 2)).toBe(1);
  await expect(
    svc.evaluate(
      w.a.principal,
      {
        passportRef: passport.passportRef,
        proposal: proposed,
        idempotencyKey: "after-revoke",
      },
      () => q.q,
      reqId,
    ),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  await expect(
    svc.leaseRequest(w.a.principal, {
      evaluationRef: evaluation.evaluationRef,
      idempotencyKey: "after-revoke-lease",
    }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  const b = await account(d);
  await expect(
    svc.revokeRegisteredAgent(b.principal, { agentId: registered.agentId }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  const metrics = (await service.inspect(w.a.principal)).metrics;
  expect(metrics.outcomes).toContainEqual({ decision: "ALLOW", count: 1 });
  expect(metrics.recordedLeases).toContainEqual({
    status: "REVOKED",
    count: 1,
  });
  expect((await service.inspect(b.principal)).metrics.captured.total).toBe(0);
});
it("account deletion cascades application metadata and internal simulated billing records", async () => {
  const w = await world();
  await w.run("sandbox-upgrade", {
    workspaceId: w.workspaceId,
    confirmation: "SIMULATE ONLY",
  });
  await d.service.delete(
    w.a.principal,
    { confirmation: "DELETE ACCOUNT", idempotencyKey: "remove-all" },
    true,
  );
  for (const table of [
    "developer_workspaces",
    "developer_projects",
    "developer_environments",
    "developer_agents",
    "credential_environments",
  ]) {
    expect(
      (
        await d.db.query(
          `SELECT 1 FROM tastepolicy.${table} WHERE user_id=$1`,
          [w.a.principal.userId],
        )
      ).rows,
    ).toHaveLength(0);
  }
  expect(
    (
      await d.db.query(
        "SELECT 1 FROM tastepolicy.workspace_subscriptions WHERE workspace_id=$1",
        [w.workspaceId],
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await d.db.query(
        "SELECT 1 FROM tastepolicy.workspace_billing_events WHERE workspace_id=$1",
        [w.workspaceId],
      )
    ).rows,
  ).toHaveLength(0);
});
