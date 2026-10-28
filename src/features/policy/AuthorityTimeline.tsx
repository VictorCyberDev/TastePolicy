"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePolicyApi } from "./usePolicyApi";
import "./policy.css";

type Item = {
  at: string;
  kind: string;
  actor: "OWNER" | "AGENT" | "SYSTEM";
  title: string;
  detail?: string;
  ref?: string;
  technical?: Record<string, unknown>;
};
const WHO: Record<Item["actor"], string> = {
  OWNER: "You",
  AGENT: "An agent",
  SYSTEM: "TastePolicy",
};
// A mark and a word, never colour alone.
const MARK: Record<string, string> = {
  EVALUATED: "?",
  LEASE_ISSUED: "+",
  APPROVED: "✓",
  DECLINED: "✕",
  CHECKPOINT: "·",
  PAUSED: "‖",
  RESUMED: "▶",
  LEASE_ENDED: "■",
  PROOF_ISSUED: "◆",
  PROOFS_INVALIDATED: "✕",
};
const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

export default function AuthorityTimeline() {
  const call = usePolicyApi();
  const [items, setItems] = useState<Item[] | null>(null),
    [truncated, setTruncated] = useState(false),
    [hideCheckins, setHide] = useState(true),
    [notice, setNotice] = useState("Loading your history…");
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const account = await call<{
          passport: { passportRef: string } | null;
        }>("inspect");
        if (!account.passport) {
          setNotice("Create your Passport on the account page first.");
          return;
        }
        const d = await call<{ events: Item[]; truncated: boolean }>(
          "timeline",
          { passportRef: account.passport.passportRef },
        );
        setItems(d.events);
        setTruncated(d.truncated);
        setNotice(
          d.events.length ? "" : "Nothing has happened on your Passport yet.",
        );
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "Unavailable.");
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const shown = (items ?? []).filter(
    (i) => !(hideCheckins && i.kind === "CHECKPOINT"),
  );
  return (
    <main className="policyPlane">
      <nav>
        <Link href="/account/leases">← What agents may do now</Link>
      </nav>
      <h1>What happened, in order</h1>
      <p className="help">
        Every question an agent asked, every rule you changed, every permission
        you gave or ended, and every proof that was shared, newest first. This
        is a record, not a control: nothing here can change an answer.
      </p>
      <p role="status" aria-live="polite">
        {notice}
      </p>
      {items && (
        <>
          <label className="choice">
            <input
              type="checkbox"
              checked={hideCheckins}
              onChange={(e) => setHide(e.target.checked)}
            />
            <span>Hide routine check-ins</span>
          </label>
          <ol className="timeline" aria-label="Authority history">
            {shown.map((i, n) => (
              <li key={`${i.at}-${i.kind}-${n}`} data-kind={i.kind}>
                <span className="mark" aria-hidden="true">
                  {MARK[i.kind] ?? "•"}
                </span>
                <div>
                  <p>
                    <strong>{i.title}</strong>
                  </p>
                  <p className="help">
                    <time dateTime={i.at}>{fmt(i.at)}</time> · {WHO[i.actor]}
                    {i.ref ? ` · ref ${i.ref}` : ""}
                  </p>
                  {i.detail && <p>{i.detail}</p>}
                  {i.technical && (
                    <details>
                      <summary>Technical details</summary>
                      <pre>{JSON.stringify(i.technical, null, 2)}</pre>
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {truncated && (
            <p className="help">Older history is not shown here.</p>
          )}
        </>
      )}
    </main>
  );
}
