"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  EntityType,
  QlooEntity,
  ProviderResult,
  EntityResolution,
} from "@/types/domain";
type Passport = {
  passportRef: string;
  displayLabel: string;
  stateVersion: number;
  expiresAt: string;
};
type Account = {
  userId: string;
  passport: Passport | null;
  credentials: {
    credentialId: string;
    displayLabel: string;
    revoked: boolean;
  }[];
};
const examples = [
  "Nils Frahm",
  "Perfect Days",
  "Muji",
  "Piranesi",
  "Severance",
];
const kinds: EntityType[] = ["artist", "movie", "brand", "book", "tv_show"];
export default function DeveloperWorkspace() {
  const [account, setAccount] = useState<Account | null>(null),
    [notice, setNotice] = useState("Loading your authenticated workspace…"),
    [busy, setBusy] = useState(false),
    [queries, setQueries] = useState(["", "", "", "", ""]),
    [matches, setMatches] = useState<QlooEntity[][]>([[], [], [], [], []]),
    [selected, setSelected] = useState(["", "", "", "", ""]),
    [reviewed, setReviewed] = useState(false),
    [label, setLabel] = useState("My private Passport"),
    [keyLabel, setKeyLabel] = useState("My application"),
    [secret, setSecret] = useState<string | null>(null);
  const keys = useRef(new Map<string, string>());
  async function post<T>(op: string, input: Record<string, unknown> = {}) {
    const fingerprint = op + JSON.stringify(input);
    if (!keys.current.has(fingerprint))
      keys.current.set(fingerprint, crypto.randomUUID());
    const r = await fetch(`/api/account/${op}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...input,
        idempotencyKey: keys.current.get(fingerprint),
      }),
    });
    const body = await r.json();
    if (!r.ok || body.status !== "available")
      throw Error(
        body.code === "AUTH_REQUIRED"
          ? "Sign in to open your workspace."
          : body.code === "PROVIDER_UNAVAILABLE"
            ? "Qloo evidence is unavailable. No Passport was created."
            : `Operation stopped: ${body.code ?? "service unavailable"}.`,
      );
    return body.data as T;
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/account/inspect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: controller.signal,
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok || body.status !== "available")
          throw Error("Sign in to open your workspace.");
        setAccount(body.data);
        setNotice(
          "Your account is ready. Preference authority remains separate from execution authority.",
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setNotice(e.message);
      });
    return () => controller.abort();
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Operation unavailable.");
    } finally {
      setBusy(false);
    }
  }
  const passport = account?.passport;
  return (
    <div className="developer-workspace">
      <p role="status" aria-live="polite">
        {notice}
      </p>
      {!account ? (
        <p>
          <Link href="/login">Sign in</Link> or{" "}
          <Link href="/signup">create an account</Link> to continue.
        </p>
      ) : (
        <>
          <div className="company-status-grid">
            <article>
              <strong>Passport</strong>
              <span>
                {passport
                  ? passport.displayLabel
                  : "Review your five cultural identities"}
              </span>
            </article>
            <article>
              <strong>Developer credentials</strong>
              <span>
                {account.credentials.filter((c) => !c.revoked).length} active ·{" "}
                <Link href="/account">manage and revoke</Link>
              </span>
            </article>
          </div>
          {!passport ? (
            <section>
              <h2>1. Review your cultural anchors</h2>
              <p>
                Enter five public cultural entities. These are your explicit
                preferences; do not enter personal information or adopt an
                example without reviewing it.
              </p>
              <button
                className="company-small-cta"
                type="button"
                disabled={busy}
                onClick={() => {
                  setQueries(examples);
                  setMatches([[], [], [], [], []]);
                  setSelected(["", "", "", "", ""]);
                  setReviewed(false);
                }}
              >
                Use public example anchors
              </button>
              <div className="company-anchor-grid">
                {queries.map((q, i) => (
                  <label key={i}>
                    {kinds[i].replaceAll("_", " ")}
                    <input
                      value={q}
                      maxLength={120}
                      autoComplete="off"
                      onChange={(e) => {
                        setQueries((old) =>
                          old.map((x, j) => (i === j ? e.target.value : x)),
                        );
                        setMatches([[], [], [], [], []]);
                        setSelected(["", "", "", "", ""]);
                        setReviewed(false);
                      }}
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="company-primary"
                disabled={busy || queries.some((q) => !q.trim())}
                onClick={() =>
                  void run(async () => {
                    const r = await fetch("/api/demo/resolve", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({
                        signals: queries.map((query, i) => ({
                          query,
                          expectedType: kinds[i],
                        })),
                      }),
                    });
                    const body = await r.json();
                    if (!r.ok || body.status !== "available")
                      throw Error(
                        "Cultural resolution unavailable. Review the provider state and try later.",
                      );
                    const resolution =
                      body.data as ProviderResult<EntityResolution>[];
                    if (
                      resolution.length !== 5 ||
                      resolution.some((x) => x.status !== "available")
                    )
                      throw Error(
                        "Some cultural identities could not be resolved. No Passport was created.",
                      );
                    setMatches(
                      resolution.map((x) =>
                        x.status === "available" ? x.data.matches : [],
                      ),
                    );
                    setNotice(
                      "Choose each exact identity below, then explicitly review your selection.",
                    );
                  })
                }
              >
                {busy ? "Resolving…" : "Resolve public cultural entities"}
              </button>
              {matches.some((m) => m.length > 0) && (
                <>
                  <div className="company-anchor-grid">
                    {matches.map((list, i) => (
                      <label key={i}>
                        Reviewed identity {i + 1}
                        <select
                          value={selected[i]}
                          onChange={(e) => {
                            setSelected((old) =>
                              old.map((x, j) => (i === j ? e.target.value : x)),
                            );
                            setReviewed(false);
                          }}
                        >
                          <option value="">Choose an identity</option>
                          {list.map((entity) => (
                            <option key={entity.id} value={entity.id}>
                              {entity.name}
                              {entity.releaseYear
                                ? ` (${entity.releaseYear})`
                                : ""}{" "}
                              · {entity.type}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <label className="company-check">
                    <input
                      type="checkbox"
                      checked={reviewed}
                      onChange={(e) => setReviewed(e.target.checked)}
                    />
                    I explicitly selected and reviewed all five distinct
                    identities.
                  </label>
                  <label className="company-field">
                    Passport label
                    <input
                      maxLength={80}
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                    />
                  </label>
                  <button
                    className="company-primary"
                    disabled={
                      busy ||
                      !reviewed ||
                      !label ||
                      selected.some((x) => !x) ||
                      new Set(selected).size !== 5
                    }
                    onClick={() =>
                      void run(async () => {
                        await post("create", {
                          displayLabel: label,
                          signalIds: selected,
                          identitiesReviewed: true,
                        });
                        setAccount(await post<Account>("inspect"));
                        setNotice(
                          "Private Passport created using real Qloo identities. Create a scoped developer credential next.",
                        );
                      })
                    }
                  >
                    Create my private Passport
                  </button>
                </>
              )}
            </section>
          ) : (
            <section>
              <h2>1. Your Passport is ready</h2>
              <p>
                <code>{passport.passportRef}</code> · State version{" "}
                {passport.stateVersion} · Expires {passport.expiresAt}
              </p>
              <p>
                <Link href="/account/rules">
                  Set your rules and action ceiling
                </Link>{" "}
                ·{" "}
                <Link href="/account/leases">
                  Inspect leases and revocation
                </Link>{" "}
                · <Link href="/account/timeline">Read authority history</Link>
              </p>
            </section>
          )}
          <section>
            <h2>2. Create a server-side credential</h2>
            <p>
              The key is shown once. It is scoped to Passport reads, evaluations
              and receipt reads for your account. Keep it off the browser and
              out of source control.
            </p>
            <label className="company-field">
              Application label
              <input
                value={keyLabel}
                maxLength={80}
                onChange={(e) => setKeyLabel(e.target.value)}
              />
            </label>
            <button
              className="company-primary"
              disabled={busy || !passport || !keyLabel || !!secret}
              onClick={() =>
                void run(async () => {
                  const key = await post<{
                    secret?: string;
                    oneTimeSecretUnavailable?: boolean;
                  }>("create-key", {
                    displayLabel: keyLabel,
                    scopes: ["PASSPORT_READ", "TASTE_EVALUATE", "RECEIPT_READ"],
                    expiresAt: new Date(
                      Date.now() + 30 * 86400000,
                    ).toISOString(),
                  });
                  if (!key.secret)
                    throw Error(
                      "The credential was already issued. Revoke it and issue another if the secret was lost.",
                    );
                  setSecret(key.secret);
                  setAccount(await post<Account>("inspect"));
                  setNotice(
                    "Credential issued. Save it privately before leaving this page.",
                  );
                })
              }
            >
              Issue developer credential
            </button>
            {secret && (
              <div className="company-secret">
                <label>
                  One-time developer credential
                  <textarea
                    readOnly
                    value={secret}
                    rows={3}
                    spellCheck={false}
                  />
                </label>
                <button
                  className="company-small-cta"
                  onClick={() => setSecret(null)}
                >
                  Hide from this page
                </button>
                <p>
                  Hiding does not revoke it. Use account settings to revoke
                  access.
                </p>
              </div>
            )}
          </section>
          <section>
            <h2>3. Make your first request</h2>
            <p>
              Use the server-side client or REST with the Passport reference
              above. Inspect the result before allowing the agent to continue.
            </p>
            <Link className="company-primary" href="/docs/rest">
              Open REST quickstart ↗
            </Link>
            <p>
              <Link href="/account">Account, export and deletion</Link> ·{" "}
              <Link href="/integrations">Link an assistant</Link>
            </p>
          </section>
        </>
      )}
    </div>
  );
}
