"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "@/components/brand/brand.css";
import "./home.css";
import Tasteprint from "@/components/brand/Tasteprint";
import {
  AuthorityLadder,
  CultureTiles,
  NeedChip,
  NeedChips,
} from "@/components/brand/primitives";
import { MARGARET } from "@/features/experience/personas";
import { usePolicyApi } from "@/features/policy/usePolicyApi";
import { TASTE_IMAGE_LABEL } from "@/features/arena/portrait";
import { SUBJECTIVE_ACTIONS, type SubjectiveAction } from "@/lib/policy/types";

type Passport = {
  passportRef: string;
  displayLabel: string;
  stateVersion: number;
  expiresAt: string;
};
type Pending = {
  leaseRef: string;
  candidateName: string;
  agentId: string;
  ask: { kind: string; question: string } | null;
};
type Ev = { at: string; kind: string; title: string; detail?: string };
type Agent = { familyId: string; clientName: string; active: boolean };
type Account = {
  passport: Passport;
  counts: Record<string, number> | null;
  ceiling: SubjectiveAction | null;
  pending: Pending[];
  events: Ev[];
  agents: Agent[];
};
const greeting = () => {
  const h = new Date().getHours();
  return h < 5
    ? "Good evening"
    : h < 12
      ? "Good morning"
      : h < 18
        ? "Good afternoon"
        : "Good evening";
};
const ladderOf = (v: unknown): SubjectiveAction | null =>
  SUBJECTIVE_ACTIONS.includes(v as SubjectiveAction)
    ? (v as SubjectiveAction)
    : null;

// Personal Agency Home. Signed out, it shows a clearly labelled example (never
// invented activity). Signed in, every section is read from the person's own
// Passport through the same account API the technical pages use.
export default function PersonalAgencyHome() {
  const call = usePolicyApi();
  const [account, setAccount] = useState<Account | null>(null);
  const [state, setState] = useState<"loading" | "example" | "account">(
    "loading",
  );

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const me = await call<{ passport: Passport | null }>("inspect");
        if (!me.passport) return setState("example");
        const ref = me.passport.passportRef;
        const [read, policy, leases, timeline, agents] =
          await Promise.allSettled([
            call<{ stateSummary?: { entryCounts: Record<string, number> } }>(
              "passport",
              {
                passportRef: ref,
                stateSummary: true,
              },
            ),
            call<{
              active: { document?: { actions?: { default?: string } } } | null;
            }>("policy-get", { passportRef: ref }),
            call<{ pending: Pending[] }>("lease-list", { passportRef: ref }),
            call<{ events: Ev[] }>("timeline", { passportRef: ref }),
            call<Agent[]>("connected-agents"),
          ]);
        const val = <T,>(r: PromiseSettledResult<T>) =>
          r.status === "fulfilled" ? r.value : null;
        setAccount({
          passport: me.passport,
          counts: val(read)?.stateSummary?.entryCounts ?? null,
          ceiling: ladderOf(val(policy)?.active?.document?.actions?.default),
          pending: val(leases)?.pending ?? [],
          events: (val(timeline)?.events ?? [])
            .filter((e) => e.kind === "EVALUATED")
            .slice(0, 5),
          agents: Array.isArray(val(agents)) ? (val(agents) as Agent[]) : [],
        });
        setState("account");
      } catch {
        setState("example");
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "loading")
    return (
      <p role="status" className="tp-home-loading">
        Opening your home…
      </p>
    );
  const example = state === "example";
  const anchors = MARGARET.anchors.map((a) => a.query);
  const ceiling =
    account?.ceiling ?? (example ? MARGARET.ceiling : "ADD_TO_DRAFT");
  return (
    <main className="tp-home">
      {example && (
        <aside className="tp-home-banner" role="note">
          <b>You&apos;re looking at an example: Margaret.</b> Nothing here is
          yours or live. <Link href="/signup">Create your own Passport</Link> or{" "}
          <Link href="/login">sign in</Link> to see your home.
        </aside>
      )}
      <header>
        <p className="tp-eyebrow">Personal agency home</p>
        <h1>
          {greeting()}
          {example ? ", Margaret" : ""}.
        </h1>
        <p className="tp-home-lead">
          AI that helps without replacing you. Here&apos;s what it knows, what
          it&apos;s asking, and how far it may go.
        </p>
      </header>

      <div className="tp-home-grid">
        <section className="tp-home-card" aria-labelledby="h-taste">
          <h2 id="h-taste">Your taste</h2>
          <div className="tp-home-taste">
            <Tasteprint
              anchors={example ? anchors : [account!.passport.displayLabel]}
              size={132}
              label={
                example
                  ? "Margaret's example Tasteprint, decorative."
                  : "Your Tasteprint, a decorative pattern seeded from your Passport. Not a score."
              }
            />
            <div>
              {example ? (
                <CultureTiles
                  items={MARGARET.anchors.map((a) => ({
                    name: a.query,
                    kind: a.caption,
                  }))}
                />
              ) : (
                <p>
                  <b>{account!.passport.displayLabel}</b>
                  <br />
                  {account!.counts
                    ? `${account!.counts.EXPLICIT_LIKE ?? 0} favorites · ${account!.counts.CONSTRAINT ?? 0} firm rules saved`
                    : "Your taste is saved privately."}
                </p>
              )}
              <p>
                <Link href={example ? "/experience" : "/account"}>
                  {example
                    ? "See how Margaret's taste is used →"
                    : "Open Your Taste →"}
                </Link>
              </p>
            </div>
          </div>
        </section>

        <section className="tp-home-card" aria-labelledby="h-now">
          <h2 id="h-now">What matters right now</h2>
          {example ? (
            <NeedChips>
              {MARGARET.requirements.map((r) => (
                <NeedChip
                  key={r.key}
                  label={r.label ?? r.key}
                  status="pending"
                  detail={r.importance === "hard" ? "required" : "preferred"}
                />
              ))}
            </NeedChips>
          ) : (
            <p>
              Requirements are set per outing, so they travel with each question
              your assistants ask.{" "}
              <Link href="/account/rules">Review Your Rules</Link>.
            </p>
          )}
        </section>

        <section className="tp-home-card tp-home-wide" aria-labelledby="h-ask">
          <h2 id="h-ask">Needs your answer</h2>
          {example ? (
            <p>
              Example:{" "}
              <i>&ldquo;Is the entrance usable without steps?&rdquo;</i> When
              something important is unknown, your AI stops here instead of
              guessing.
            </p>
          ) : account!.pending.length === 0 ? (
            <p>Nothing is waiting on you.</p>
          ) : (
            <ul className="tp-home-list">
              {account!.pending.map((p) => (
                <li key={p.leaseRef}>
                  <b>{p.candidateName}</b> · {p.agentId}
                  <br />
                  {p.ask?.question ?? "This needs your decision."}{" "}
                  <Link href="/account/leases">Answer →</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="tp-home-card" aria-labelledby="h-go">
          <h2 id="h-go">How far AI may go</h2>
          <AuthorityLadder ceiling={ceiling} />
          <p className="tp-muted">
            {example || account?.ceiling
              ? "Anything above this line asks you first."
              : "No limit is set yet, so the cautious default applies: it may add to a draft plan, never present a final choice."}{" "}
            <Link href={example ? "/experience" : "/account/rules"}>
              {example ? "Try it" : "Change it"}
            </Link>
          </p>
        </section>

        <section className="tp-home-card" aria-labelledby="h-places">
          <h2 id="h-places">Places that feel like you</h2>
          <div className="tp-home-places">
            {[0, 1, 2].map((i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={`/taste/taste-${(i * 3) % 8}.svg`} alt="" />
            ))}
          </div>
          <p className="tp-muted">{TASTE_IMAGE_LABEL}</p>
          <p>
            <Link className="tp-btn" data-size="sm" href="/experience">
              Find real places with Qloo
            </Link>
          </p>
        </section>

        <section className="tp-home-card" aria-labelledby="h-recent">
          <h2 id="h-recent">Recent decisions</h2>
          {example || account!.events.length === 0 ? (
            <p>
              {example
                ? "Your decisions appear here in plain language: “Go ahead”, “Needs your answer”, “Not this one”, “Couldn’t check”."
                : "No decisions yet. When an assistant checks a choice, it shows up here."}
            </p>
          ) : (
            <ul className="tp-home-list">
              {account!.events.map((e) => (
                <li key={e.at + e.title}>
                  {e.title}
                  {e.detail && <small> — {e.detail}</small>}
                </li>
              ))}
            </ul>
          )}
          {!example && (
            <p>
              <Link href="/account/timeline">History</Link> ·{" "}
              <Link href="/account/inspector">Decision details</Link>
            </p>
          )}
        </section>

        <section className="tp-home-card" aria-labelledby="h-agents">
          <h2 id="h-agents">Connected apps &amp; agents</h2>
          {example ? (
            <p>
              Apps you let ask TastePolicy appear here. They can never buy, book
              or pay.
            </p>
          ) : account!.agents.length === 0 ? (
            <p>No app is connected.</p>
          ) : (
            <ul className="tp-home-list">
              {account!.agents.map((a) => (
                <li key={a.familyId}>
                  {a.clientName} · {a.active ? "Active" : "Disconnected"}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="tp-home-adv">
        <p className="tp-section-title">Advanced</p>
        <p>
          <Link href="/account/rules">Your Rules</Link> ·{" "}
          <Link href="/account/leases">What AI can do right now</Link> ·{" "}
          <Link href="/account/timeline">History</Link> ·{" "}
          <Link href="/developers/workspace">Developer workspace</Link>
        </p>
      </footer>
    </main>
  );
}
