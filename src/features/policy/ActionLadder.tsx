"use client";
import {
  SUBJECTIVE_ACTIONS,
  type PolicyDocument,
  type SubjectiveAction,
} from "@/lib/policy/types";
import { ACTION_COPY } from "./copy";

const DOMAINS = ["brand", "place", "destination"] as const;
const LEGACY: SubjectiveAction = "ADD_TO_DRAFT";

// How far an agent may go on a match without asking. Optional: an owner who
// never publishes a ladder keeps the previous behaviour (up to "Add to a
// draft"; presenting something as your choice always asks first).
export default function ActionLadder({
  draft,
  setDraft,
}: {
  draft: PolicyDocument;
  setDraft: (d: PolicyDocument) => void;
}) {
  const actions = draft.actions;
  const set = (a: PolicyDocument["actions"]) => {
    const next = { ...draft };
    if (a) next.actions = a;
    else delete next.actions;
    setDraft(next);
  };
  const setSensitive = (
    domain: (typeof DOMAINS)[number],
    patch: Partial<NonNullable<PolicyDocument["sensitive"]>[typeof domain]>,
  ) => {
    const sensitive = { ...(draft.sensitive ?? {}) };
    const merged = { ...(sensitive[domain] ?? {}), ...patch };
    for (const k of Object.keys(merged) as (keyof typeof merged)[])
      if (merged[k] === undefined || merged[k] === false) delete merged[k];
    if (Object.keys(merged).length) sensitive[domain] = merged;
    else delete sensitive[domain];
    const next = { ...draft };
    if (Object.keys(sensitive).length) next.sensitive = sensitive;
    else delete next.sensitive;
    setDraft(next);
  };
  return (
    <>
      <section aria-labelledby="ladder">
        <h2 id="ladder">How far may an agent go?</h2>
        <p className="help">
          From mentioning an idea to presenting it as your choice. Past the line
          you set, the agent asks you. This never lets an agent buy, book or
          pay.
        </p>
        <label className="choice">
          <input
            type="checkbox"
            checked={!!actions}
            onChange={(e) =>
              set(
                e.target.checked
                  ? { default: LEGACY, byDomain: {}, byAgent: {} }
                  : undefined,
              )
            }
          />
          <span>Set my own limit on how far an agent goes</span>
        </label>
        {actions && (
          <>
            <fieldset>
              <legend>Furthest an agent goes without asking</legend>
              {SUBJECTIVE_ACTIONS.map((a) => (
                <label key={a} className="choice">
                  <input
                    type="radio"
                    name="ceiling"
                    checked={actions.default === a}
                    onChange={() => set({ ...actions, default: a })}
                  />
                  <span>
                    <strong>{ACTION_COPY[a].label}</strong>
                    <br />
                    <span className="help">{ACTION_COPY[a].help}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="row">
              {DOMAINS.map((d) => (
                <label key={d}>
                  {d[0].toUpperCase() + d.slice(1)}
                  <select
                    value={actions.byDomain[d] ?? ""}
                    onChange={(e) => {
                      const byDomain = { ...actions.byDomain };
                      if (e.target.value)
                        byDomain[d] = e.target.value as SubjectiveAction;
                      else delete byDomain[d];
                      set({ ...actions, byDomain });
                    }}
                  >
                    <option value="">Use the setting above</option>
                    {SUBJECTIVE_ACTIONS.map((a) => (
                      <option key={a} value={a}>
                        {ACTION_COPY[a].label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </>
        )}
      </section>
      <section aria-labelledby="sensitive">
        <h2 id="sensitive">Choices that need extra care</h2>
        <p className="help">
          Mark a kind of choice as sensitive and agents are held to a stricter
          standard there. Your blocks and limits still win first.
        </p>
        {DOMAINS.map((d) => {
          const r = draft.sensitive?.[d] ?? {};
          return (
            <fieldset key={d}>
              <legend>{d[0].toUpperCase() + d.slice(1)}</legend>
              <label className="choice">
                <input
                  type="checkbox"
                  checked={!!r.alwaysAsk}
                  onChange={(e) =>
                    setSensitive(d, { alwaysAsk: e.target.checked })
                  }
                />
                <span>Always ask me</span>
              </label>
              <label className="choice">
                <input
                  type="checkbox"
                  checked={!!r.noOverride}
                  onChange={(e) =>
                    setSensitive(d, { noOverride: e.target.checked })
                  }
                />
                <span>Never let a temporary permission skip the question</span>
              </label>
              <label>
                Furthest an agent goes here
                <select
                  value={r.maxAction ?? ""}
                  onChange={(e) =>
                    setSensitive(d, {
                      maxAction: (e.target.value || undefined) as
                        SubjectiveAction | undefined,
                    })
                  }
                >
                  <option value="">No extra limit</option>
                  {SUBJECTIVE_ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {ACTION_COPY[a].label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ask again if my newest &ldquo;I like this&rdquo; is older than
                (days)
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={r.freshExplicitDays ?? ""}
                  onChange={(e) =>
                    setSensitive(d, {
                      freshExplicitDays: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                />
              </label>
            </fieldset>
          );
        })}
      </section>
      <section aria-labelledby="privacy">
        <h2 id="privacy">What each side can see</h2>
        <ul className="help">
          <li>
            <strong>An agent learns</strong> the answer (allowed, ask, not a
            match, or could not check), why in a short phrase, and how far it
            may go. It does not receive your saved taste.
          </li>
          <li>
            <strong>A receipt shows</strong> the choice that was checked, the
            cultural evidence behind the match, the rule that decided and the
            version of your rules. It does not list your other saved taste, your
            other rules or your account.
          </li>
          <li>
            <strong>A shareable proof shows</strong> that you allowed one exact
            choice for a short time, to one named receiver. By default it shows
            no taste, no name and no account reference.
          </li>
          <li>
            <strong>Never shared:</strong> your saved taste, your blocks, your
            limits, your other agents and your account details.
          </li>
        </ul>
      </section>
    </>
  );
}
