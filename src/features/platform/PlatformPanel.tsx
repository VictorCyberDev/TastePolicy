"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import type { Credential, Grant } from "@/lib/platform/types";
import { KEY_SCOPES, SHARE_SCOPES } from "@/lib/platform/types";
import "./PlatformPanel.css";
type Passport = {
  passportRef: string;
  displayLabel: string;
  passportVersion: number;
  visibility: string;
  stateVersion: number;
  stateHash: string;
  expiresAt: string;
};
type Account = {
  userId: string;
  mode: string;
  passport: Passport | null;
  grants: (Omit<Grant, "profileId"> & { revoked: boolean })[];
  credentials: (Credential & { revoked: boolean })[];
};
const messages: Record<string, string> = {
  NOT_CONFIGURED:
    "Account authentication and persistence are not configured in this environment. Demo mode remains separate.",
  AUTH_REQUIRED:
    "Sign in with your account credentials. Demo capability cannot authorize account operations.",
  RECENT_AUTH_REQUIRED:
    "Sign out and sign in again before this sensitive operation.",
  GRANT_REVOKED: "This sharing grant was revoked. New access is blocked.",
  GRANT_EXPIRED: "This sharing grant expired. New access is blocked.",
  ACCESS_DENIED:
    "This account or credential does not have the required authority.",
  PASSPORT_NOT_FOUND:
    "Passport or captured record unavailable to this account.",
  STATE_VERSION_CONFLICT:
    "The referenced version changed. Refresh and explicitly reconcile.",
  IDEMPOTENCY_KEY_CONFLICT:
    "This operation key already represents different input.",
  PROVIDER_UNAVAILABLE:
    "Required cultural identity evidence is unavailable. No Passport model was fabricated.",
  INVALID_INPUT:
    "Review the explicit identities, scope, expiry and structured fields.",
  RATE_LIMITED: "Bounded request quota reached. No automatic retry.",
};
export default function PlatformPanel() {
  const [account, setAccount] = useState<Account | null>(null),
    [notice, setNotice] = useState(
      "Account mode is distinct from the temporary Judge Mode demo.",
    ),
    [busy, setBusy] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [label, setLabel] = useState(""),
    [anchors, setAnchors] = useState(["", "", "", "", ""]),
    [reviewed, setReviewed] = useState(false),
    [recipient, setRecipient] = useState(""),
    [purpose, setPurpose] = useState(""),
    [shareScopes, setShareScopes] = useState<string[]>([]),
    [keyScopes, setKeyScopes] = useState<string[]>([]),
    [keyLabel, setKeyLabel] = useState(""),
    [expiry, setExpiry] = useState(""),
    [secret, setSecret] = useState<string | null>(null),
    [exportData, setExportData] = useState<unknown>(null),
    [confirmation, setConfirmation] = useState(""),
    [sharedRef, setSharedRef] = useState(""),
    [grantId, setGrantId] = useState(""),
    [candidateId, setCandidateId] = useState(""),
    [candidateName, setCandidateName] = useState(""),
    [domain, setDomain] = useState("destination"),
    [context, setContext] = useState("demo"),
    [version, setVersion] = useState(1),
    [evaluation, setEvaluation] = useState<Record<string, unknown> | null>(
      null,
    ),
    [sharedSummary, setSharedSummary] = useState<unknown>(null);
  const keys = useRef(new Map<string, string>());
  async function call<T>(
    op: string,
    body: Record<string, unknown> = {},
    mutation = false,
  ): Promise<T> {
    const fingerprint = op + JSON.stringify(body);
    if (mutation && !keys.current.has(fingerprint))
      keys.current.set(fingerprint, crypto.randomUUID());
    const response = await fetch(`/api/account/${op}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...body,
        ...(mutation ? { idempotencyKey: keys.current.get(fingerprint) } : {}),
      }),
    });
    const result = await response.json();
    if (result.status !== "available")
      throw Error(
        messages[result.code] ??
          "Operation unavailable. No authority was fabricated.",
      );
    return result.data;
  }
  async function inspect() {
    setAccount(await call<Account>("inspect"));
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setSecret(null);
    try {
      await work();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Operation unavailable.");
    } finally {
      setBusy(false);
    }
  }
  async function auth(signup = false) {
    const response = await fetch(
      `/api/auth/${signup ? "sign-up" : "sign-in"}/email`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, ...(signup ? { name } : {}) }),
      },
    );
    if (!response.ok) {
      const body = await response.json();
      throw Error(messages[body.code] ?? "Authentication failed.");
    }
    setPassword("");
    await inspect();
    setNotice(
      "Authenticated account. Control of account credentials is not legal identity or independently verified email ownership.",
    );
  }
  const expiresAt = () => new Date(expiry).toISOString(),
    passport = account?.passport;
  const toggle = (value: string, old: string[]) =>
    old.includes(value) ? old.filter((x) => x !== value) : [...old, value];
  return (
    <section className="platform-panel" aria-labelledby="platform-title">
      <nav>
        <Link href="/">TastePolicy · Judge Mode</Link>
      </nav>
      <p className="eyebrow">M6 · Platformization</p>
      <h1 id="platform-title">Your Taste Passport</h1>
      <p>
        Private state references, explicit sharing and bounded developer access.
        Cultural authorization never grants purchase, payment, booking,
        private-data sharing or execution authority.
      </p>
      <p role="status" aria-live="polite">
        {notice}
      </p>
      {!account ? (
        <fieldset disabled={busy}>
          <legend>Account · real authentication</legend>
          <p>
            Separate from the temporary demo. Creating an account does not claim
            or copy demo state.
          </p>
          <label>
            Account label
            <input
              maxLength={60}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              minLength={12}
              maxLength={128}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button
            disabled={!email || password.length < 12}
            onClick={() => run(() => auth())}
          >
            Sign in
          </button>
          <button
            disabled={!name.trim() || !email || password.length < 12}
            onClick={() => run(() => auth(true))}
          >
            Create authenticated account
          </button>
          <button onClick={() => run(inspect)}>
            Resume authenticated session
          </button>
        </fieldset>
      ) : (
        <>
          <p>
            <strong>AUTHENTICATED ACCOUNT</strong> · Account identifier:{" "}
            <code>{account.userId}</code>
          </p>
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const signedOut = await fetch("/api/auth/sign-out", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: "{}",
                });
                if (!signedOut.ok)
                  throw Error("Sign-out failed. Session may remain active.");
                setAccount(null);
                setExportData(null);
                setEvaluation(null);
                setSharedSummary(null);
                keys.current.clear();
                setNotice("Signed out. Session invalidated.");
              })
            }
          >
            Sign out
          </button>
          {!passport ? (
            <fieldset disabled={busy}>
              <legend>Create private Passport</legend>
              <label>
                Passport label
                <input
                  maxLength={60}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </label>
              <p>
                Supply five identities explicitly reviewed through Qloo
                resolution. No automatic copying or conversion of demo state.
              </p>
              {anchors.map((anchor, i) => (
                <label key={i}>
                  Reviewed cultural anchor ID {i + 1}
                  <input
                    maxLength={36}
                    value={anchor}
                    onChange={(e) => {
                      setAnchors((old) =>
                        old.map((v, j) => (i === j ? e.target.value : v)),
                      );
                      setReviewed(false);
                    }}
                  />
                </label>
              ))}
              <label className="check">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                I explicitly selected and reviewed all five distinct cultural
                identities.
              </label>
              <button
                disabled={!label || !reviewed || anchors.some((a) => !a)}
                onClick={() =>
                  run(async () => {
                    await call(
                      "create",
                      {
                        displayLabel: label,
                        signalIds: anchors,
                        identitiesReviewed: true,
                      },
                      true,
                    );
                    await inspect();
                  })
                }
              >
                Create private Taste Passport
              </button>
            </fieldset>
          ) : (
            <article>
              <h2>Taste Passport · {passport.displayLabel}</h2>
              <dl>
                <dt>Reference</dt>
                <dd>
                  <code>{passport.passportRef}</code>
                </dd>
                <dt>Privacy</dt>
                <dd>{passport.visibility} · never publicly discoverable</dd>
                <dt>State</dt>
                <dd>
                  v{passport.stateVersion} · {passport.stateHash}
                </dd>
                <dt>Passport version</dt>
                <dd>{passport.passportVersion}</dd>
                <dt>Expiry</dt>
                <dd>{passport.expiresAt}</dd>
              </dl>
              <p>
                A reference does not expose anchors, constraints, feedback,
                proxies, group membership or receipts.
              </p>
              <label>
                New Passport label
                <input
                  maxLength={60}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </label>
              <button
                disabled={busy || !label}
                onClick={() =>
                  run(async () => {
                    await call(
                      "update",
                      {
                        passportRef: passport.passportRef,
                        expectedPassportVersion: passport.passportVersion,
                        displayLabel: label,
                      },
                      true,
                    );
                    await inspect();
                  })
                }
              >
                Create Passport metadata version
              </button>
            </article>
          )}
          <fieldset disabled={busy}>
            <legend>Sharing · authenticated grantor consent</legend>
            <p>
              READ_RECEIPT can reveal captured input anchors and context. Grant
              only the scopes you intend; there is no raw database access.
            </p>
            <p>
              Grant only to an explicitly entered existing account identifier.
              No email/contact lookup or external invitation is performed.
            </p>
            <label>
              Grantee account identifier
              <input
                maxLength={36}
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              />
            </label>
            <label>
              Purpose / client label
              <input
                maxLength={60}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              />
            </label>
            <label>
              Permission / credential expiry
              <input
                type="datetime-local"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
            </label>
            <p>
              Every share/key expires within 30 days. Shares also expire within
              Passport retention.
            </p>
            {SHARE_SCOPES.map((scope) => (
              <label className="check" key={scope}>
                <input
                  type="checkbox"
                  checked={shareScopes.includes(scope)}
                  onChange={() => setShareScopes((old) => toggle(scope, old))}
                />
                {scope}
              </label>
            ))}
            <button
              disabled={
                !passport ||
                !recipient ||
                !purpose ||
                !expiry ||
                !shareScopes.length
              }
              onClick={() =>
                run(async () => {
                  await call(
                    "grant",
                    {
                      passportRef: passport!.passportRef,
                      granteeUserId: recipient,
                      purpose,
                      scopes: shareScopes,
                      expiresAt: expiresAt(),
                    },
                    true,
                  );
                  await inspect();
                })
              }
            >
              Create expiring share
            </button>
            {account.grants.map((g) => (
              <article key={g.grantId}>
                <p>
                  {g.purpose} · {g.granteeUserId}
                </p>
                <p>
                  {g.scopes.join(", ")} · expires {g.expiresAt} ·{" "}
                  {g.revoked ? "Revoked" : "Issued; expiry is enforced"}
                </p>
                <p>
                  Passport reference: <code>{g.passportRef}</code>
                </p>
                <p>
                  Grant reference: <code>{g.grantId}</code>
                </p>
                <p>{g.assurance} — no legally verified identity claim.</p>
                {g.grantorUserId === account.userId && (
                  <button
                    disabled={g.revoked}
                    onClick={() =>
                      run(async () => {
                        await call(
                          "revoke-grant",
                          { grantId: g.grantId },
                          true,
                        );
                        await inspect();
                      })
                    }
                  >
                    Revoke share {g.purpose}
                  </button>
                )}
              </article>
            ))}
          </fieldset>
          <fieldset disabled={busy}>
            <legend>Evaluate owned or shared taste</legend>
            <label>
              Shared Passport reference (blank uses your Passport)
              <input
                value={sharedRef}
                maxLength={51}
                onChange={(e) => setSharedRef(e.target.value)}
              />
            </label>
            <label>
              Sharing grant ID
              <input
                maxLength={36}
                value={grantId}
                onChange={(e) => setGrantId(e.target.value)}
              />
            </label>
            <button
              disabled={!sharedRef || !grantId}
              onClick={() =>
                run(async () => {
                  setSharedSummary(
                    await call("passport", { passportRef: sharedRef, grantId }),
                  );
                  setNotice(
                    "Grant-scoped Passport summary; no raw state access.",
                  );
                })
              }
            >
              Read shared Passport summary
            </button>
            {sharedSummary !== null && (
              <pre>{JSON.stringify(sharedSummary, null, 2)}</pre>
            )}
            <label>
              Candidate ID
              <input
                maxLength={36}
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
              />
            </label>
            <label>
              Candidate display name
              <input
                maxLength={250}
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
              />
            </label>
            <label>
              Candidate domain
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              >
                {["destination", "brand", "place"].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label>
              Canonical action context
              <input
                maxLength={64}
                value={context}
                onChange={(e) => setContext(e.target.value)}
              />
            </label>
            <label>
              Expected subject state version
              <input
                type="number"
                min={1}
                value={version}
                onChange={(e) => setVersion(Number(e.target.value))}
              />
            </label>
            <button
              disabled={
                !(sharedRef || passport) || !candidateId || !candidateName
              }
              onClick={() =>
                run(async () => {
                  setEvaluation(
                    await call(
                      "evaluate",
                      {
                        passportRef: sharedRef || passport!.passportRef,
                        ...(sharedRef ? { grantId } : {}),
                        proposal: {
                          agentId: "Account-Agent",
                          candidate: {
                            id: candidateId,
                            name: candidateName,
                            type: domain,
                          },
                          context: { key: context, domain },
                          expectedStateVersion: version,
                        },
                      },
                      true,
                    ),
                  );
                  setNotice(
                    "Cultural evaluation completed. No execution authority.",
                  );
                })
              }
            >
              Evaluate taste action
            </button>
            {evaluation && (
              <article>
                <h3>Cultural policy: {String(evaluation.decision)}</h3>
                <pre>{JSON.stringify(evaluation, null, 2)}</pre>
                <button
                  onClick={() =>
                    run(async () => {
                      setEvaluation(
                        await call("receipt", {
                          evaluationRef: evaluation.receiptRef,
                        }),
                      );
                    })
                  }
                >
                  Retrieve captured receipt
                </button>
              </article>
            )}
          </fieldset>
          <fieldset disabled={busy}>
            <legend>Developer access · server-only credentials</legend>
            <p>
              Plaintext secret is shown once. Keep it out of browsers, source
              control, public MCP configuration and logs. Retrying issuance
              cannot reveal it again.
            </p>
            <label>
              Credential label
              <input
                maxLength={60}
                value={keyLabel}
                onChange={(e) => setKeyLabel(e.target.value)}
              />
            </label>
            {KEY_SCOPES.map((scope) => (
              <label className="check" key={scope}>
                <input
                  type="checkbox"
                  checked={keyScopes.includes(scope)}
                  onChange={() => setKeyScopes((old) => toggle(scope, old))}
                />
                {scope}
              </label>
            ))}
            <button
              disabled={!keyLabel || !expiry || !keyScopes.length}
              onClick={() =>
                run(async () => {
                  const result = await call<{ secret?: string }>(
                    "create-key",
                    {
                      displayLabel: keyLabel,
                      scopes: keyScopes,
                      expiresAt: expiresAt(),
                    },
                    true,
                  );
                  await inspect();
                  setSecret(result.secret ?? null);
                  setNotice(
                    result.secret
                      ? "Copy your secret now. It cannot be retrieved again."
                      : "Issuance replayed. The one-time secret is not recoverable; rotate if needed.",
                  );
                })
              }
            >
              Create API credential
            </button>
            {secret && (
              <aside aria-label="One-time API secret">
                <strong>ONE-TIME SECRET — server use only</strong>
                <code>{secret}</code>
                <button onClick={() => setSecret(null)}>
                  Hide secret permanently
                </button>
              </aside>
            )}
            {account.credentials.map((c) => (
              <article key={c.credentialId}>
                <h3>{c.displayLabel}</h3>
                <p>
                  {c.scopes.join(", ")} · Expires {c.expiresAt} ·{" "}
                  {c.revoked ? "Revoked" : "Issued; expiry enforced"}
                </p>
                <button
                  disabled={c.revoked}
                  onClick={() =>
                    run(async () => {
                      await call(
                        "revoke-key",
                        { credentialId: c.credentialId },
                        true,
                      );
                      await inspect();
                    })
                  }
                >
                  Revoke credential {c.displayLabel}
                </button>
                <button
                  disabled={c.revoked || !expiry}
                  onClick={() =>
                    run(async () => {
                      const result = await call<{ secret?: string }>(
                        "rotate-key",
                        {
                          credentialId: c.credentialId,
                          displayLabel: c.displayLabel,
                          scopes: c.scopes,
                          expiresAt: expiresAt(),
                        },
                        true,
                      );
                      await inspect();
                      setSecret(result.secret ?? null);
                    })
                  }
                >
                  Rotate credential {c.displayLabel}
                </button>
              </article>
            ))}
          </fieldset>
          <fieldset disabled={busy}>
            <legend>Export &amp; delete</legend>
            <p>
              Recent sign-in is required. Export is optional before deletion.
              SELF explicit state remains separate from provider references;
              proxy/group material is excluded from this v1 archive. Import is
              not supported.
            </p>
            <button
              disabled={!passport}
              onClick={() =>
                run(async () => {
                  setExportData(
                    await call(
                      "export",
                      { passportRef: passport!.passportRef },
                      true,
                    ),
                  );
                  setNotice(
                    "Private export prepared. No public download URL or raw Qloo payload.",
                  );
                })
              }
            >
              Export Passport
            </button>
            {exportData !== null && (
              <>
                <a
                  download="taste-passport-export-v1.json"
                  href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(exportData, null, 2))}`}
                >
                  Download private export
                </a>
                <details>
                  <summary>Inspect versioned export</summary>
                  <pre>{JSON.stringify(exportData, null, 2)}</pre>
                </details>
              </>
            )}
            <p>
              Revoking a share blocks access but preserves historical truth.
              Deleting a Passport physically purges its state/evidence and
              removes its shares; developer keys are revoked. Deleting the
              account also removes account credentials and invalidates sessions.
              Purged receipts become unavailable, never a rewritten REJECT.
            </p>
            <label>
              Type DELETE PASSPORT or DELETE ACCOUNT
              <input
                autoComplete="off"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
            <button
              disabled={!passport || confirmation !== "DELETE PASSPORT"}
              onClick={() =>
                run(async () => {
                  await call(
                    "delete-passport",
                    { passportRef: passport!.passportRef, confirmation },
                    true,
                  );
                  setExportData(null);
                  setEvaluation(null);
                  await inspect();
                  setNotice(
                    "Passport/state purged. Shares removed and API keys revoked.",
                  );
                })
              }
            >
              Delete Passport and state
            </button>
            <button
              disabled={confirmation !== "DELETE ACCOUNT"}
              onClick={() =>
                run(async () => {
                  await call(
                    "delete-account",
                    { passportRef: passport?.passportRef, confirmation },
                    true,
                  );
                  setAccount(null);
                  setExportData(null);
                  setEvaluation(null);
                  setSharedSummary(null);
                  setNotice(
                    "Account deleted; sessions invalidated and owned persistent data purged.",
                  );
                })
              }
            >
              Delete authenticated account
            </button>
          </fieldset>
        </>
      )}
    </section>
  );
}
