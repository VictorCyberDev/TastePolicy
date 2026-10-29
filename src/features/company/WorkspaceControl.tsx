"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import BillingTestPanel from "./BillingTestPanel";
type Item = {
  id: string;
  label: string;
  workspace_id?: string;
  project_id?: string;
  environment_id?: string;
  external_id?: string;
  revoked_at?: string | null;
  kind?: string;
};
type Snapshot = {
  workspaces: Item[];
  projects: Item[];
  environments: Item[];
  agents: Item[];
  bindings: { credential_id: string; environment_id: string }[];
  subscriptions: {
    workspace_id: string;
    mode: string;
    plan: string;
    state: string;
    provider: string;
  }[];
  invoices: {
    event_id: string;
    kind: string;
    amount_minor: number;
    currency: string;
    mode: string;
  }[];
  metrics: {
    windowDays: number;
    outcomes: { decision: string; count: number }[];
    captured: { total: number; latest_receipt_at: string | null };
    recordedLeases: { status: string; count: number }[];
    evidenceObservedAt?: string;
    latestProviderAt?: string | null;
    authorityEpochs?: {
      leaseRef: string;
      agentId: string;
      status: string;
      epoch: string | null;
      expiresAt: string;
      checkpointDueAt: string;
    }[];
    issuedProofs: number;
    activePolicy: { version: number; action_ceilings: unknown } | null;
    leaseStatesRequireFreshVerification: boolean;
  };
};
const json = { "content-type": "application/json" };
async function call<T>(op: string, body: Record<string, unknown> = {}) {
  const r = await fetch(`/api/workspace/${op}`, {
    method: "POST",
    headers: json,
    body: JSON.stringify(body),
  });
  const value = await r.json();
  if (!r.ok || value.status !== "available")
    throw Error(
      value.code === "AUTH_REQUIRED"
        ? "Sign in to inspect your application workspaces."
        : `Workspace operation stopped: ${value.code ?? "unavailable"}.`,
    );
  return value.data as T;
}
export default function WorkspaceControl() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [notice, setNotice] = useState("Loading application namespaces…"),
    [busy, setBusy] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("My workspace"),
    [projectName, setProjectName] = useState("My application"),
    [environmentName, setEnvironmentName] = useState("Development"),
    [kind, setKind] = useState("DEVELOPMENT"),
    [agentName, setAgentName] = useState("My assistant"),
    [externalId, setExternalId] = useState("my-agent");
  const [workspace, setWorkspace] = useState(""),
    [project, setProject] = useState(""),
    [environment, setEnvironment] = useState(""),
    [credential, setCredential] = useState(""),
    [boundAgent, setBoundAgent] = useState(""),
    [credentials, setCredentials] = useState<Item[]>([]);
  const keys = useRef(new Map<string, string>());
  useEffect(() => {
    let active = true;
    call<Snapshot>("inspect")
      .then((s) => {
        if (active) {
          setSnapshot(s);
          setNotice(
            "Application namespaces are separate from permission to act for a person.",
          );
        }
      })
      .catch((e) => {
        if (active) setNotice(e.message);
      });
    fetch("/api/account/inspect", { method: "POST", headers: json, body: "{}" })
      .then((r) => r.json())
      .then((v) => {
        if (active && v.status === "available")
          setCredentials(
            v.data.credentials
              .filter((c: { revoked: boolean }) => !c.revoked)
              .map((c: { credentialId: string; displayLabel: string }) => ({
                id: c.credentialId,
                label: c.displayLabel,
              })),
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  async function mutate(
    op: string,
    input: Record<string, unknown>,
    success: string,
  ) {
    setBusy(true);
    try {
      const fingerprint = op + JSON.stringify(input);
      if (!keys.current.has(fingerprint))
        keys.current.set(fingerprint, crypto.randomUUID());
      await call(op, {
        ...input,
        idempotencyKey: keys.current.get(fingerprint),
      });
      setSnapshot(await call<Snapshot>("inspect"));
      const account = await fetch("/api/account/inspect", {
        method: "POST",
        headers: json,
        body: "{}",
      }).then((r) => r.json());
      if (account.status === "available")
        setCredentials(
          account.data.credentials
            .filter((c: { revoked: boolean }) => !c.revoked)
            .map((c: { credentialId: string; displayLabel: string }) => ({
              id: c.credentialId,
              label: c.displayLabel,
            })),
        );
      setNotice(success);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Workspace unavailable.");
    } finally {
      setBusy(false);
    }
  }
  const options = (items: Item[]) =>
    items.map((x) => (
      <option key={x.id} value={x.id}>
        {x.label}
      </option>
    ));
  const m = snapshot?.metrics,
    total = m?.outcomes.reduce((n, x) => n + x.count, 0) ?? 0,
    ask = m?.outcomes.find((x) => x.decision === "ASK")?.count ?? 0;
  return (
    <section className="workspace-control">
      <h2>Your application control plane</h2>
      <p role="status" aria-live="polite">
        {notice}
      </p>
      {!snapshot ? (
        <p>
          <Link href="/login">Sign in</Link> to manage your own workspaces.
        </p>
      ) : (
        <>
          <p>
            Each workspace currently has one owner. Member invitations and
            organization RBAC are not yet supported. Development/production are
            application namespaces on this hosted service, not separate
            databases or automatic fake-provider modes.
          </p>
          <div
            className="company-status-grid"
            aria-label="Captured authority metrics"
          >
            {(["ALLOW", "ASK", "REJECT", "UNAVAILABLE"] as const).map(
              (decision) => (
                <article key={decision}>
                  <strong>{decision}</strong>
                  <span>
                    {m!.outcomes.find((x) => x.decision === decision)?.count ??
                      0}{" "}
                    in the last {m!.windowDays} days
                  </span>
                </article>
              ),
            )}
            <article>
              <strong>ASK rate</strong>
              <span>
                {total
                  ? `${((100 * ask) / total).toFixed(1)}% of ${total} captured decisions`
                  : "No captured decisions in this window"}
              </span>
            </article>
            <article>
              <strong>Evidence</strong>
              <span>
                {m!.captured.latest_receipt_at
                  ? `Latest captured receipt: ${m!.captured.latest_receipt_at}`
                  : "No captured receipt"}
              </span>
            </article>
            <article>
              <strong>Qloo evidence age</strong>
              <span>
                {m!.latestProviderAt && m!.evidenceObservedAt
                  ? (() => {
                      const age =
                        Date.parse(m!.evidenceObservedAt) -
                        Date.parse(m!.latestProviderAt!);
                      return Number.isFinite(age) && age >= 0
                        ? `Latest captured provider evidence: ${Math.floor(age / 60000)} minutes at snapshot time`
                        : "Evidence timestamp requires review";
                    })()
                  : "No captured provider timestamp"}
              </span>
              <span>
                Historical evidence age does not establish current authority.
              </span>
            </article>
            <article>
              <strong>Policy version</strong>
              <span>
                {m!.activePolicy?.version ?? "Default policy"} ·{" "}
                <Link href="/account/rules">manage rules and ceiling</Link>
              </span>
            </article>
            <article>
              <strong>Portable proofs issued</strong>
              <span>{m!.issuedProofs} recorded · verification required</span>
            </article>
          </div>
          <p>
            Recorded lease states:{" "}
            {m!.recordedLeases.length
              ? m!.recordedLeases
                  .map((x) => `${x.status}: ${x.count}`)
                  .join(" · ")
              : "none"}
            . These counts are historical records. Current use requires fresh
            verification of expiry, drift, commitments and revocation.{" "}
            <Link href="/account/leases">Manage leases</Link> ·{" "}
            <Link href="/account/timeline">
              Inspect receipts, proof epochs and audit timeline
            </Link>
          </p>
          <details>
            <summary>Recorded authority epochs (latest twenty leases)</summary>
            <p>
              These are owner-visible historical records, not a current validity
              grant. Verify the exact candidate/context, policy and status
              before relying on a lease or proof.
            </p>
            {m!.authorityEpochs?.length ? (
              <ul>
                {m!.authorityEpochs.map((epoch) => (
                  <li key={epoch.leaseRef}>
                    <strong>{epoch.agentId}</strong> · epoch{" "}
                    {epoch.epoch ?? "unknown for legacy record"} ·{" "}
                    {epoch.status} · expires {epoch.expiresAt} · checkpoint{" "}
                    {epoch.checkpointDueAt}
                    <br />
                    <code>{epoch.leaseRef}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No recorded lease epochs.</p>
            )}
          </details>
          <div className="company-control-forms">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void mutate(
                  "create-workspace",
                  { displayLabel: workspaceName },
                  "Workspace created with a live Free plan. No charge or paid entitlement was created.",
                );
              }}
            >
              <h3>Workspace</h3>
              <label>
                Workspace name
                <input
                  value={workspaceName}
                  maxLength={80}
                  required
                  onChange={(e) => setWorkspaceName(e.target.value)}
                />
              </label>
              <button className="company-primary" disabled={busy}>
                Create workspace
              </button>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void mutate(
                  "create-project",
                  { workspaceId: workspace, displayLabel: projectName },
                  "Application project created.",
                );
              }}
            >
              <h3>Project / application</h3>
              <label>
                Project workspace
                <select
                  required
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value)}
                >
                  <option value="">Choose workspace</option>
                  {options(snapshot.workspaces)}
                </select>
              </label>
              <label>
                Application name
                <input
                  value={projectName}
                  required
                  maxLength={80}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </label>
              <button className="company-primary" disabled={busy || !workspace}>
                Create application
              </button>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void mutate(
                  "create-environment",
                  { projectId: project, displayLabel: environmentName, kind },
                  "Application environment created. It grants no preference authority by itself.",
                );
              }}
            >
              <h3>Environment</h3>
              <label>
                Environment project
                <select
                  required
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                >
                  <option value="">Choose application</option>
                  {options(snapshot.projects)}
                </select>
              </label>
              <label>
                Environment name
                <input
                  value={environmentName}
                  required
                  maxLength={80}
                  onChange={(e) => setEnvironmentName(e.target.value)}
                />
              </label>
              <label>
                Environment kind
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="DEVELOPMENT">Development</option>
                  <option value="PRODUCTION">Production</option>
                </select>
              </label>
              <button className="company-primary" disabled={busy || !project}>
                Create environment
              </button>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void mutate(
                  "register-agent",
                  {
                    environmentId: environment,
                    displayLabel: agentName,
                    externalId,
                  },
                  "Agent registered. Registration does not create a lease or grant authority.",
                );
              }}
            >
              <h3>Agent</h3>
              <label>
                Agent environment
                <select
                  required
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                >
                  <option value="">Choose environment</option>
                  {options(snapshot.environments)}
                </select>
              </label>
              <label>
                Agent display name
                <input
                  value={agentName}
                  required
                  maxLength={80}
                  onChange={(e) => setAgentName(e.target.value)}
                />
              </label>
              <label>
                Agent request identifier
                <input
                  value={externalId}
                  required
                  pattern="[a-zA-Z0-9_-]{1,64}"
                  maxLength={64}
                  onChange={(e) => setExternalId(e.target.value)}
                />
              </label>
              <button
                className="company-primary"
                disabled={busy || !environment}
              >
                Register agent
              </button>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void mutate(
                  "bind-credential",
                  {
                    environmentId: environment,
                    credentialId: credential,
                    agentId: boundAgent,
                  },
                  "Credential bound to this agent and environment. It cannot be moved to another identity.",
                );
              }}
            >
              <h3>Credential namespace</h3>
              <label>
                Credential environment
                <select
                  required
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                >
                  <option value="">Choose environment</option>
                  {options(snapshot.environments)}
                </select>
              </label>
              <label>
                Existing developer credential
                <select
                  required
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                >
                  <option value="">Choose an active credential</option>
                  {options(credentials)}
                </select>
              </label>
              <label>
                Credential agent
                <select
                  required
                  value={boundAgent}
                  onChange={(e) => setBoundAgent(e.target.value)}
                >
                  <option value="">Choose a registered agent</option>
                  {options(
                    snapshot.agents.filter(
                      (a) => a.environment_id === environment && !a.revoked_at,
                    ),
                  )}
                </select>
              </label>
              <button
                className="company-primary"
                disabled={
                  busy ||
                  !environment ||
                  !credential ||
                  !snapshot.agents.some(
                    (a) =>
                      a.id === boundAgent &&
                      a.environment_id === environment &&
                      !a.revoked_at,
                  )
                }
              >
                Attach credential
              </button>
              <p>
                The binding restricts this key to the selected agent identifier
                for evaluations and leases. Revoking the agent also revokes its
                bound keys. Unbound keys retain their existing account scope.
                Passport access still requires your account or a live explicit
                grant. <Link href="/account">Issue or revoke a credential</Link>
                .
              </p>
            </form>
          </div>
          <h3>Registered agents</h3>
          {!snapshot.agents.length ? (
            <p>No registered agents.</p>
          ) : (
            <ul>
              {snapshot.agents.map((a) => (
                <li key={a.id}>
                  <strong>{a.label}</strong> · <code>{a.external_id}</code> ·{" "}
                  {a.revoked_at ? (
                    "Revoked"
                  ) : (
                    <button
                      className="company-small-cta"
                      disabled={busy}
                      onClick={() =>
                        void mutate(
                          "revoke-agent",
                          { agentId: a.id },
                          "Agent authority revoked across your Passport. Matching live leases ended and their issued proof epochs became invalid. Future evaluations and leases for this agent identifier are denied.",
                        )
                      }
                    >
                      Revoke {a.label} authority
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <h3>Plan and internal billing simulation</h3>
          <p>
            Live plans remain Free. No payment processor or commercial checkout
            is configured. The simulation below writes a separate SANDBOX state
            and a simulated USD49 invoice, creates no charge and changes no live
            entitlement.
          </p>
          <ul>
            {snapshot.subscriptions.map((s) => (
              <li key={s.workspace_id + s.mode}>
                {
                  snapshot.workspaces.find((w) => w.id === s.workspace_id)
                    ?.label
                }
                : {s.mode} · {s.plan} · {s.state} · {s.provider}
              </li>
            ))}
          </ul>
          <label className="company-field">
            Simulation workspace
            <select
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
            >
              <option value="">Choose workspace</option>
              {options(snapshot.workspaces)}
            </select>
          </label>
          <button
            className="company-small-cta"
            disabled={busy || !workspace}
            onClick={() =>
              void mutate(
                "sandbox-upgrade",
                { workspaceId: workspace, confirmation: "SIMULATE ONLY" },
                "Internal Pro simulation recorded. No money moved and the live plan remains Free.",
              )
            }
          >
            Simulate Pro invoice and entitlement
          </button>{" "}
          <button
            className="company-small-cta"
            disabled={busy || !workspace}
            onClick={() =>
              void mutate(
                "sandbox-cancel",
                { workspaceId: workspace, confirmation: "SIMULATE ONLY" },
                "Internal cancellation recorded. Live entitlement was not changed.",
              )
            }
          >
            Simulate cancellation
          </button>
          <ul>
            {snapshot.invoices.map((i) => (
              <li key={i.event_id}>
                {i.mode} · {i.kind} · USD{(i.amount_minor / 100).toFixed(2)} ·
                no charge
              </li>
            ))}
          </ul>
          <button
            className="company-small-cta"
            disabled={busy}
            onClick={() => {
              const blob = new Blob(
                [
                  JSON.stringify(
                    {
                      schemaVersion: "tastepolicy-workspace-export-v1",
                      exportedAt: new Date().toISOString(),
                      ...snapshot,
                    },
                    null,
                    2,
                  ),
                ],
                { type: "application/json" },
              );
              const url = URL.createObjectURL(blob),
                a = document.createElement("a");
              a.href = url;
              a.download = "tastepolicy-workspaces.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Export workspace metadata
          </button>
          <p>
            <Link href="/account">
              Export personal authority data or delete your account
            </Link>
            . Account deletion also removes workspaces, applications,
            environments, agent registrations, bindings and internal billing
            simulations.
          </p>
          <BillingTestPanel workspaces={snapshot.workspaces} />
        </>
      )}
    </section>
  );
}
