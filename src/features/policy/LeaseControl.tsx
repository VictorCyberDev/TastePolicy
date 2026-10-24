"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePolicyApi } from "./usePolicyApi";
import "./policy.css";

type Lease = {
  leaseRef: string;
  status: string;
  valid: boolean;
  reasons: string[];
  agentId: string;
  candidateName: string;
  contextKey: string;
  expiresAt: string;
  checkpointDueAt: string;
};
type Listing = {
  passportRef: string;
  pending: Lease[];
  leases: Lease[];
  timeline: {
    leaseRef: string;
    seq: number;
    kind: string;
    at: string;
    actor: string;
    reasons?: string[];
  }[];
};
const STATUS: Record<string, string> = {
  ASK_PENDING: "Waiting for you",
  ACTIVE: "Active",
  SUSPENDED: "Paused: needs a fresh check",
  DECLINED: "You declined",
  REVOKED: "Ended by you",
  EXPIRED: "Expired",
  RELEASED: "Finished by the agent",
};
const REASON: Record<string, string> = {
  STATE_CHANGED: "your taste information changed",
  POLICY_CHANGED: "your rules changed",
  GRANT_UNAVAILABLE: "a share was ended or expired",
  OVERRIDE_ENDED: "a temporary permission ended",
  PASSPORT_UNAVAILABLE: "the Passport is no longer available",
  CHECKPOINT_OVERDUE: "the agent did not check in on time",
};
const EVENT: Record<string, string> = {
  ISSUED: "Agent asked",
  APPROVED: "You approved",
  DECLINED: "You declined",
  CHECKPOINT_OK: "Agent checked in",
  DRIFT: "Paused",
  RESUMED: "Resumed after a fresh check",
  REVOKED: "You ended it",
  EXPIRED: "Expired",
  RELEASED: "Agent finished",
};
const ACTOR: Record<string, string> = {
  AGENT: "agent",
  OWNER: "you",
  SYSTEM: "TastePolicy",
};
// What agents are currently allowed to keep doing, and the one place to say
// yes to an agent's question or stop everything.
export default function LeaseControl() {
  const call = usePolicyApi();
  const [data, setData] = useState<Listing | null>(null),
    [notice, setNotice] = useState("Loading…"),
    [busy, setBusy] = useState(false),
    [minutes, setMinutes] = useState(15);

  async function load() {
    try {
      const account = await call<{ passport: { passportRef: string } | null }>(
        "inspect",
      );
      if (!account.passport)
        return setNotice("Create your Passport on the account page first.");
      const d = await call<Listing>("lease-list", {
        passportRef: account.passport.passportRef,
      });
      setData(d);
      setNotice(
        d.pending.length
          ? `${d.pending.length} question${d.pending.length > 1 ? "s" : ""} waiting for you.`
          : "Nothing is waiting for you.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Unavailable.");
    }
  }
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function run(work: () => Promise<void>, done: string) {
    setBusy(true);
    try {
      await work();
      await load();
      setNotice(done);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Unavailable.");
    } finally {
      setBusy(false);
    }
  }
  const live =
    data?.leases.filter((l) => ["ACTIVE", "SUSPENDED"].includes(l.status)) ??
    [];
  if (!data)
    return (
      <main className="policyPlane">
        <h1>What agents may do now</h1>
        <p role="status" aria-live="polite">
          {notice}
        </p>
        <Link href="/account">Go to your account</Link>
      </main>
    );
  return (
    <main className="policyPlane">
      <nav>
        <Link href="/account/rules">← Your rules</Link>
      </nav>
      <h1>What agents may do now</h1>
      <p className="help">
        A permission here lets an agent recommend or add one choice to a draft
        for a short time. It never lets an agent buy, book or pay. It pauses
        itself if anything it relied on changes.
      </p>
      <p role="status" aria-live="polite">
        {notice}
      </p>

      <section aria-labelledby="ask">
        <h2 id="ask">Questions from agents</h2>
        {data.pending.length === 0 && <p className="help">None right now.</p>}
        {data.pending.map((l) => (
          <article key={l.leaseRef}>
            <p>
              <strong>{l.agentId}</strong> wants to go ahead with{" "}
              <strong>{l.candidateName}</strong> for “{l.contextKey}”. Your
              rules said to ask you first.
            </p>
            <label>
              Allow for
              <select
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              >
                {[5, 15, 60, 240].map((m) => (
                  <option key={m} value={m}>
                    {m < 60
                      ? `${m} minutes`
                      : `${m / 60} hour${m > 60 ? "s" : ""}`}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await call(
                    "lease-approve",
                    { leaseRef: l.leaseRef, ttlSeconds: minutes * 60 },
                    true,
                  );
                }, "Approved.")
              }
            >
              Yes, allow
            </button>
            <button
              className="quiet"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await call("lease-decline", { leaseRef: l.leaseRef });
                }, "Declined.")
              }
            >
              No
            </button>
          </article>
        ))}
      </section>

      <section aria-labelledby="live">
        <h2 id="live">Allowed right now</h2>
        {live.length === 0 && (
          <p className="help">No agent has an active permission.</p>
        )}
        <ul>
          {live.map((l) => (
            <li key={l.leaseRef}>
              <span
                className="tag"
                data-outcome={l.status === "ACTIVE" ? "ALLOW" : "ASK"}
              >
                {STATUS[l.status]}
              </span>{" "}
              {l.agentId} · {l.candidateName} · until{" "}
              {new Date(l.expiresAt).toLocaleTimeString()}
              {l.reasons.length > 0 && (
                <span className="help">
                  {" "}
                  · because {l.reasons.map((r) => REASON[r] ?? r).join(", ")}
                </span>
              )}{" "}
              <button
                className="quiet"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await call("lease-revoke", { leaseRef: l.leaseRef });
                  }, "Ended.")
                }
              >
                End now
              </button>
            </li>
          ))}
        </ul>
        <button
          className="quiet"
          disabled={busy || live.length + data.pending.length === 0}
          onClick={() =>
            run(async () => {
              await call("lease-revoke", { passportRef: data.passportRef });
            }, "Everything ended.")
          }
        >
          Stop all agents
        </button>
      </section>

      <section aria-labelledby="log">
        <h2 id="log">What happened</h2>
        <ol>
          {data.timeline.slice(0, 40).map((t) => (
            <li key={`${t.leaseRef}-${t.seq}`}>
              {new Date(t.at).toLocaleString()} · {EVENT[t.kind] ?? t.kind}{" "}
              <span className="help">
                ({ACTOR[t.actor]})
                {t.reasons?.length
                  ? ` · ${t.reasons.map((r) => REASON[r] ?? r).join(", ")}`
                  : ""}
              </span>
            </li>
          ))}
          {data.timeline.length === 0 && <li className="help">Nothing yet.</li>}
        </ol>
      </section>
    </main>
  );
}
