"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AUTONOMY_LEVELS,
  DEFAULT_POLICY,
  FRESHNESS_CLASSES,
  type AutonomyLevel,
  type FreshnessClass,
  type PolicyDocument,
  type PolicyOverride,
} from "@/lib/policy/types";
import RuleBoundary from "./RuleBoundary";
import { usePolicyApi } from "./usePolicyApi";
import { EFFECT_COPY, FRESHNESS_COPY, LEVEL_COPY } from "./copy";
import "./policy.css";

type View = {
  passportRef: string;
  active: {
    version: number;
    document: PolicyDocument;
    createdAt: string;
    note: string | null;
  } | null;
  history: {
    version: number;
    document: PolicyDocument;
    createdAt: string;
    note: string | null;
  }[];
  overrides: (PolicyOverride & { status: "ACTIVE" | "EXPIRED" | "REVOKED" })[];
  suggestions: { agentId: string; stoppedCount: number; note: string }[];
};
type Impact = {
  total: number;
  changed: number;
  transitions: Record<string, number>;
};
const DOMAINS = ["brand", "place", "destination"] as const;

export default function PolicyControlPlane() {
  const call = usePolicyApi();
  const [view, setView] = useState<View | null>(null),
    [draft, setDraft] = useState<PolicyDocument>(DEFAULT_POLICY),
    [impact, setImpact] = useState<Impact | null>(null),
    [notice, setNotice] = useState("Loading your rules…"),
    [busy, setBusy] = useState(false),
    [agentName, setAgentName] = useState(""),
    [ov, setOv] = useState({
      kind: "domain",
      value: "place",
      days: 7,
      effect: "ALLOW_THROUGH_ASK",
      confirm: false,
    });

  async function load() {
    try {
      const account = await call<{ passport: { passportRef: string } | null }>(
        "inspect",
      );
      if (!account.passport) {
        setNotice("Create your Passport on the account page first.");
        return;
      }
      const v = await call<View>("policy-get", {
        passportRef: account.passport.passportRef,
      });
      setView(v);
      setDraft(v.active?.document ?? DEFAULT_POLICY);
      setImpact(null);
      setNotice(
        v.active
          ? `Your rules are at version ${v.active.version}.`
          : "No rules yet. Agents act on a match and ask only where your saved rules say so.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Unavailable.");
    }
  }
  useEffect(() => {
    // Deferred so state is set from a callback, not synchronously in the effect.
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Unavailable.");
    } finally {
      setBusy(false);
    }
  }
  const dirty =
    JSON.stringify(draft) !==
    JSON.stringify(view?.active?.document ?? DEFAULT_POLICY);
  const usesLimit = [
    draft.autonomy.default,
    ...Object.values(draft.autonomy.byDomain),
    ...Object.values(draft.autonomy.byAgent),
  ].includes("CONFIRM_ABOVE_LIMIT");
  const setAutonomy = (patch: Partial<PolicyDocument["autonomy"]>) =>
    setDraft({ ...draft, autonomy: { ...draft.autonomy, ...patch } });
  const clean = (): PolicyDocument => ({
    ...draft,
    autonomy: {
      ...draft.autonomy,
      limit: usesLimit ? draft.autonomy.limit : undefined,
    },
  });

  if (!view)
    return (
      <main className="policyPlane">
        <h1>Your rules</h1>
        <p role="status" aria-live="polite">
          {notice}
        </p>
        <Link href="/account">Go to your account</Link>
      </main>
    );
  return (
    <main className="policyPlane">
      <nav>
        <Link href="/account">← Your account</Link>
      </nav>
      <h1>Your rules</h1>
      <p className="help">
        Taste says what fits you. These rules decide how much an agent may do on
        a match. They can only make an answer more careful, or follow a
        permission you give on purpose. Your blocks and limits always win.
        Nothing here lets an agent buy, book or pay.
      </p>
      <p role="status" aria-live="polite">
        {notice}
      </p>

      <section aria-labelledby="autonomy">
        <h2 id="autonomy">How much may an agent do on a match?</h2>
        <RuleBoundary level={draft.autonomy.default} />
        <fieldset>
          <legend>Default for every agent</legend>
          {AUTONOMY_LEVELS.map((l) => (
            <label key={l} className="choice">
              <input
                type="radio"
                name="level"
                checked={draft.autonomy.default === l}
                onChange={() => setAutonomy({ default: l })}
              />
              <span>
                <strong>{LEVEL_COPY[l].label}</strong>
                <br />
                <span className="help">{LEVEL_COPY[l].help}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {usesLimit && (
          <div className="row">
            <label>
              Spending limit
              <input
                type="number"
                min={1}
                value={draft.autonomy.limit?.amount ?? ""}
                onChange={(e) =>
                  setAutonomy({
                    limit: {
                      amount: Number(e.target.value),
                      currency: draft.autonomy.limit?.currency ?? "USD",
                    },
                  })
                }
              />
            </label>
            <label>
              Currency
              <input
                maxLength={3}
                value={draft.autonomy.limit?.currency ?? "USD"}
                onChange={(e) =>
                  setAutonomy({
                    limit: {
                      amount: draft.autonomy.limit?.amount ?? 100,
                      currency: e.target.value.toUpperCase(),
                    },
                  })
                }
              />
            </label>
          </div>
        )}
        <details>
          <summary>
            Different rules for a kind of choice or a particular agent
          </summary>
          <div className="row">
            {DOMAINS.map((d) => (
              <label key={d}>
                {d[0].toUpperCase() + d.slice(1)}
                <select
                  value={draft.autonomy.byDomain[d] ?? ""}
                  onChange={(e) => {
                    const next = { ...draft.autonomy.byDomain };
                    if (e.target.value)
                      next[d] = e.target.value as AutonomyLevel;
                    else delete next[d];
                    setAutonomy({ byDomain: next });
                  }}
                >
                  <option value="">Use the default</option>
                  {AUTONOMY_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {LEVEL_COPY[l].label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <ul>
            {Object.entries(draft.autonomy.byAgent).map(([agent, l]) => (
              <li key={agent}>
                <strong>{agent}</strong>: {LEVEL_COPY[l].label}{" "}
                <button
                  className="quiet"
                  onClick={() => {
                    const n = { ...draft.autonomy.byAgent };
                    delete n[agent];
                    setAutonomy({ byAgent: n });
                  }}
                >
                  Remove {agent}
                </button>
              </li>
            ))}
          </ul>
          <div className="row">
            <label>
              Agent name
              <input
                value={agentName}
                maxLength={64}
                onChange={(e) => setAgentName(e.target.value)}
              />
            </label>
            <button
              className="quiet"
              disabled={!/^[a-zA-Z0-9_-]{1,64}$/.test(agentName)}
              onClick={() => {
                setAutonomy({
                  byAgent: {
                    ...draft.autonomy.byAgent,
                    [agentName]: draft.autonomy.default,
                  },
                });
                setAgentName("");
              }}
            >
              Add agent
            </button>
          </div>
          {Object.keys(draft.autonomy.byAgent).map((agent) => (
            <label key={agent}>
              {agent}
              <select
                value={draft.autonomy.byAgent[agent]}
                onChange={(e) =>
                  setAutonomy({
                    byAgent: {
                      ...draft.autonomy.byAgent,
                      [agent]: e.target.value as AutonomyLevel,
                    },
                  })
                }
              >
                {AUTONOMY_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_COPY[l].label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </details>
        {view.suggestions.map((s) => (
          <p key={s.agentId} className="help">
            {s.agentId} was stopped by your setting {s.stoppedCount} times
            recently. {s.note}
          </p>
        ))}
      </section>

      <section aria-labelledby="fresh">
        <h2 id="fresh">When is your taste information too old?</h2>
        <p className="help">
          If it is older than this, an agent asks you again instead of acting.
        </p>
        {FRESHNESS_CLASSES.map((c: FreshnessClass) => {
          const days = draft.freshness[c];
          return (
            <div className="row" key={c}>
              <label className="choice">
                <input
                  type="checkbox"
                  checked={days !== undefined}
                  onChange={(e) => {
                    const next = { ...draft.freshness };
                    if (e.target.checked) next[c] = 180;
                    else delete next[c];
                    setDraft({ ...draft, freshness: next });
                  }}
                />
                <span>{FRESHNESS_COPY[c]}</span>
              </label>
              {days !== undefined && (
                <label>
                  Days
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={days}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        freshness: {
                          ...draft.freshness,
                          [c]: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              )}
            </div>
          );
        })}
      </section>

      <section aria-labelledby="preview">
        <h2 id="preview">Preview, then publish</h2>
        <p className="help">
          The preview replays your recent checks under these rules. Nothing is
          changed or sent anywhere.
        </p>
        <button
          className="quiet"
          disabled={busy || !dirty}
          onClick={() =>
            run(async () =>
              setImpact(
                await call<Impact>("policy-impact", {
                  passportRef: view.passportRef,
                  document: clean(),
                }),
              ),
            )
          }
        >
          Preview what would change
        </button>
        {impact && (
          <p role="status">
            {impact.changed === 0
              ? `None of your last ${impact.total} checks would have changed.`
              : `${impact.changed} of your last ${impact.total} checks would have changed: ${Object.entries(
                  impact.transitions,
                )
                  .map(([k, n]) => `${k.replace("->", " → ")} (${n})`)
                  .join(", ")}.`}
          </p>
        )}
        <button
          disabled={busy || !dirty}
          onClick={() =>
            run(async () => {
              await call(
                "policy-publish",
                {
                  passportRef: view.passportRef,
                  document: clean(),
                  expectedVersion: view.active?.version ?? 0,
                },
                true,
              );
              await load();
              setNotice("Published. New checks use these rules.");
            })
          }
        >
          Publish these rules
        </button>
        <button
          className="quiet"
          disabled={busy || !dirty}
          onClick={() => {
            setDraft(view.active?.document ?? DEFAULT_POLICY);
            setImpact(null);
          }}
        >
          Discard changes
        </button>
      </section>

      <section aria-labelledby="temp">
        <h2 id="temp">Temporary permissions</h2>
        <p className="help">
          Allow something for a few days without changing your rules. They
          expire on their own and you can end one at any time.
        </p>
        <div className="row">
          <label>
            Applies to
            <select
              value={ov.kind}
              onChange={(e) =>
                setOv({
                  ...ov,
                  kind: e.target.value,
                  value: e.target.value === "domain" ? "place" : "",
                })
              }
            >
              <option value="domain">A kind of choice</option>
              <option value="candidate">One exact choice (its id)</option>
              <option value="context">One situation (its key)</option>
            </select>
          </label>
          <label>
            {ov.kind === "domain" ? "Kind" : "Id or key"}
            {ov.kind === "domain" ? (
              <select
                value={ov.value}
                onChange={(e) => setOv({ ...ov, value: e.target.value })}
              >
                {DOMAINS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            ) : (
              <input
                value={ov.value}
                onChange={(e) => setOv({ ...ov, value: e.target.value })}
              />
            )}
          </label>
          <label>
            Days (1–30)
            <input
              type="number"
              min={1}
              max={30}
              value={ov.days}
              onChange={(e) => setOv({ ...ov, days: Number(e.target.value) })}
            />
          </label>
        </div>
        <label>
          What it does
          <select
            value={ov.effect}
            onChange={(e) =>
              setOv({ ...ov, effect: e.target.value, confirm: false })
            }
          >
            {Object.entries(EFFECT_COPY).map(([k, t]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {ov.effect === "ALLOW_THROUGH_CULTURAL_REJECT" && (
          <label className="choice">
            <input
              type="checkbox"
              checked={ov.confirm}
              onChange={(e) => setOv({ ...ov, confirm: e.target.checked })}
            />
            <span>
              I understand this allows a choice that does not match my taste. It
              only works for one exact choice and never beats my blocks or
              limits.
            </span>
          </label>
        )}
        <button
          disabled={
            busy ||
            !ov.value ||
            (ov.effect === "ALLOW_THROUGH_CULTURAL_REJECT" &&
              (!ov.confirm || ov.kind !== "candidate"))
          }
          onClick={() =>
            run(async () => {
              const scope =
                ov.kind === "domain"
                  ? { domain: ov.value }
                  : ov.kind === "candidate"
                    ? { candidateId: ov.value }
                    : { contextKey: ov.value };
              await call(
                "override-create",
                {
                  passportRef: view.passportRef,
                  effect: ov.effect,
                  scope,
                  days: ov.days,
                  ...(ov.confirm ? { confirmCulturalReject: true } : {}),
                },
                true,
              );
              await load();
              setNotice("Temporary permission added.");
            })
          }
        >
          Add temporary permission
        </button>
        <ul>
          {view.overrides.map((o) => (
            <li key={o.overrideId}>
              <span className="tag">{o.status.toLowerCase()}</span>{" "}
              {EFFECT_COPY[o.effect]} ·{" "}
              {Object.entries(o.scope)
                .map(([k, v]) => `${k} ${v}`)
                .join(", ")}{" "}
              · until {new Date(o.expiresAt).toLocaleDateString()}{" "}
              {o.status === "ACTIVE" && (
                <button
                  className="quiet"
                  onClick={() =>
                    run(async () => {
                      await call("override-revoke", {
                        passportRef: view.passportRef,
                        overrideId: o.overrideId,
                      });
                      await load();
                    })
                  }
                >
                  End now
                </button>
              )}
            </li>
          ))}
          {view.overrides.length === 0 && <li className="help">None.</li>}
        </ul>
      </section>

      <section aria-labelledby="history">
        <h2 id="history">History</h2>
        <ul>
          {view.history.map((h) => (
            <li key={h.version}>
              Version {h.version} · {new Date(h.createdAt).toLocaleString()}
              {h.note ? ` · ${h.note}` : ""}{" "}
              {h.version !== view.active?.version && (
                <button
                  className="quiet"
                  onClick={() => {
                    setDraft(h.document);
                    setNotice(
                      `Version ${h.version} loaded as a draft. Publish to restore it as a new version.`,
                    );
                  }}
                >
                  Restore as draft
                </button>
              )}
              {h.version === view.active?.version && (
                <span className="tag">current</span>
              )}
            </li>
          ))}
          {view.history.length === 0 && (
            <li className="help">No versions yet.</li>
          )}
        </ul>
        <p>
          <Link href="/account/inspector">
            See why a past answer was given →
          </Link>
        </p>
      </section>
      <section aria-labelledby="others">
        <h2 id="others">When other people are involved</h2>
        <ul>
          <li>
            <strong>Whose rules apply:</strong> yours, to your own choices. In a
            group, every member’s own rules apply to that member.
          </li>
          <li>
            <strong>One no ends it:</strong> if any member’s rules say no, the
            group answer is no. A group cannot outvote a no, and a temporary
            permission only ever releases the person who gave it.
          </li>
          <li>
            <strong>Someone acting for you</strong> can see your rules and make
            them stricter if you allowed it. They cannot loosen your rules or
            give a permission in your name unless you gave them that exact
            right.
          </li>
          <li>
            <strong>Who can end things:</strong> you, and anyone you let manage
            your rules, can end a permission or a lease at any time.
          </li>
        </ul>
      </section>
    </main>
  );
}
