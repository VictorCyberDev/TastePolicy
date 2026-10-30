"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import "@/components/brand/brand.css";
import "./home.css";
import "@/features/onboarding/onboarding.css";
import Tasteprint from "@/components/brand/Tasteprint";
import {
  AuthorityLadder,
  CultureTiles,
  NeedChip,
  NeedChips,
} from "@/components/brand/primitives";
import { useProductState } from "@/features/product/useProductState";
import { usePolicyApi } from "@/features/policy/usePolicyApi";
import {
  AreaPicker,
  NeedsEditor,
  type Origin,
} from "@/features/onboarding/NeedsEditor";
import {
  buildRequirements,
  selectionFromRequirements,
  type NeedSelection,
} from "@/lib/product/needs";
import { SUBJECTIVE_ACTIONS, type SubjectiveAction } from "@/lib/policy/types";
import type { Requirement } from "@/lib/requirements/types";
import type { QlooEntity } from "@/types/domain";

type Pending = {
  leaseRef: string;
  candidateName: string;
  agentId: string;
  ask: { kind: string; question: string } | null;
};
type Ev = { at: string; kind: string; title: string; detail?: string };
type Agent = { familyId: string; clientName: string; active: boolean };
type Home = {
  anchors: QlooEntity[];
  needs: { requirements: Requirement[]; origin: Origin | null };
  ceiling: SubjectiveAction | null;
  pending: Pending[];
  events: Ev[];
  agents: Agent[];
};
const KIND: Record<string, string> = {
  artist: "Music",
  movie: "Film",
  tv_show: "TV",
  book: "Books",
  brand: "Brands",
  place: "Places",
  destination: "Destinations",
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

// The person's home. Every section is read from their own saved data; there
// is no example content here. A visitor or a half-set-up account is sent to
// the step it is missing instead of being shown someone else's life.
export default function PersonalAgencyHome() {
  const { state, reload } = useProductState();
  const call = usePolicyApi();
  const router = useRouter();
  const [home, setHome] = useState<Home | null>(null);
  const [editing, setEditing] = useState(false);
  const [sel, setSel] = useState<NeedSelection[]>([]);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"" | "passport" | "account">("");
  const [loadError, setLoadError] = useState("");

  const ref = state.kind === "ACTIVE" ? state.passport.passportRef : "";
  const load = useCallback(async () => {
    if (!ref) return;
    const [taste, policy, leases, timeline, agents] = await Promise.allSettled([
      call<{ anchors: QlooEntity[]; needs: Home["needs"] }>("taste", {
        passportRef: ref,
      }),
      call<{
        active: { document?: { actions?: { default?: string } } } | null;
      }>("policy-get", { passportRef: ref }),
      call<{ pending: Pending[] }>("lease-list", { passportRef: ref }),
      call<{ events: Ev[] }>("timeline", { passportRef: ref }),
      call<Agent[]>("connected-agents"),
    ]);
    if (taste.status !== "fulfilled") {
      setLoadError("We couldn't load your taste. Nothing was changed.");
      return;
    }
    const val = <T,>(r: PromiseSettledResult<T>) =>
      r.status === "fulfilled" ? r.value : null;
    setHome({
      anchors: taste.value.anchors,
      needs: taste.value.needs,
      ceiling: ladderOf(val(policy)?.active?.document?.actions?.default),
      pending: val(leases)?.pending ?? [],
      events: (val(timeline)?.events ?? [])
        .filter((e) => e.kind === "EVALUATED")
        .slice(0, 5),
      agents: Array.isArray(val(agents)) ? (val(agents) as Agent[]) : [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function act(op: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await op();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === "LOADING")
    return (
      <p role="status" className="tp-home-loading">
        Opening your home…
      </p>
    );
  if (state.kind === "VISITOR")
    return (
      <main className="tp-onb">
        <h1>Sign in to open your home.</h1>
        <p>Your taste and your rules are saved to your own account.</p>
        <p className="tp-onb-actions">
          <Link className="tp-btn" data-variant="spectrum" href="/login">
            Sign in
          </Link>
          <Link className="tp-btn" data-variant="ghost" href="/signup">
            Create an account
          </Link>
          <Link className="tp-btn" data-variant="ghost" href="/demo/margaret">
            See an example first
          </Link>
        </p>
      </main>
    );
  if (state.kind === "AUTHENTICATED_UNONBOARDED")
    return (
      <main className="tp-onb">
        <h1>Let&apos;s set up your taste.</h1>
        <p>
          Your account is ready, but it doesn&apos;t have any taste saved yet.
          It takes about two minutes.
        </p>
        <p>
          <Link className="tp-btn" data-variant="spectrum" href="/onboarding">
            Set up my taste
          </Link>
        </p>
      </main>
    );
  if (state.kind === "UNAVAILABLE")
    return (
      <main className="tp-onb">
        <h1>We couldn&apos;t open your home.</h1>
        <p role="alert">The service is unavailable. Nothing was changed.</p>
        <button className="tp-btn" onClick={() => void reload()}>
          Try again
        </button>
      </main>
    );
  if (!home)
    return (
      <p role="status" className="tp-home-loading">
        {loadError || "Opening your home…"}
      </p>
    );

  const ceiling = home.ceiling ?? "ADD_TO_DRAFT";
  const names = home.anchors.map((a) => a.name);
  return (
    <main className="tp-home">
      <header>
        <p className="tp-eyebrow">{state.passport.displayLabel}</p>
        <h1>{greeting()}.</h1>
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
              anchors={names}
              size={132}
              label="Your Tasteprint, a decorative pattern drawn from the things you chose. Not a score."
            />
            <div>
              <CultureTiles
                items={home.anchors.map((a) => ({
                  name: a.name,
                  kind: KIND[a.type] ?? a.type,
                }))}
              />
            </div>
          </div>
          <p>
            <Link className="tp-btn" data-size="sm" href="/experience">
              Find places that feel like you
            </Link>
          </p>
        </section>

        <section className="tp-home-card" aria-labelledby="h-now">
          <h2 id="h-now">What matters to you</h2>
          {!editing && (
            <>
              {home.needs.requirements.length === 0 ? (
                <p>
                  You haven&apos;t said what has to work yet. Add a few so every
                  check respects them.
                </p>
              ) : (
                <NeedChips>
                  {home.needs.requirements.map((r) => (
                    <NeedChip
                      key={r.key}
                      label={r.label ?? r.key}
                      status="pending"
                      detail={
                        r.importance === "hard" ? "required" : "preferred"
                      }
                    />
                  ))}
                </NeedChips>
              )}
              {home.needs.origin && (
                <p className="tp-muted">
                  Starting from {home.needs.origin.label}
                </p>
              )}
              <p>
                <button
                  className="tp-btn"
                  data-size="sm"
                  data-variant="ghost"
                  onClick={() => {
                    setSel(selectionFromRequirements(home.needs.requirements));
                    setOrigin(home.needs.origin);
                    setEditing(true);
                  }}
                >
                  Change what matters
                </button>
              </p>
            </>
          )}
          {editing && (
            <>
              <NeedsEditor value={sel} onChange={setSel} />
              <AreaPicker origin={origin} onPick={setOrigin} />
              <p className="tp-onb-actions">
                <button
                  className="tp-btn"
                  data-size="sm"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await call(
                        "needs-set",
                        {
                          passportRef: ref,
                          requirements: buildRequirements(sel),
                          origin,
                        },
                        true,
                      );
                      setEditing(false);
                      await load();
                      setNotice("Saved. New checks use these.");
                    })
                  }
                >
                  Save
                </button>
                <button
                  className="tp-btn"
                  data-size="sm"
                  data-variant="ghost"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
              </p>
            </>
          )}
          <p role="status" aria-live="polite">
            {notice}
          </p>
        </section>

        <section className="tp-home-card tp-home-wide" aria-labelledby="h-ask">
          <h2 id="h-ask">Needs your answer</h2>
          {home.pending.length === 0 ? (
            <p>Nothing is waiting on you.</p>
          ) : (
            <ul className="tp-home-list">
              {home.pending.map((p) => (
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
            {home.ceiling
              ? "Anything above this line asks you first."
              : "No limit is set yet, so the cautious default applies: it may add to a draft plan, never present a final choice."}{" "}
            <Link href="/account/rules">Change it</Link>
          </p>
        </section>

        <section className="tp-home-card" aria-labelledby="h-recent">
          <h2 id="h-recent">Recent decisions</h2>
          {home.events.length === 0 ? (
            <p>
              No decisions yet. When you or an assistant checks a choice, it
              shows up here.
            </p>
          ) : (
            <ul className="tp-home-list">
              {home.events.map((e) => (
                <li key={e.at + e.title}>
                  {e.title}
                  {e.detail && <small> — {e.detail}</small>}
                </li>
              ))}
            </ul>
          )}
          <p>
            <Link href="/account/timeline">History</Link> ·{" "}
            <Link href="/account/inspector">Decision details</Link>
          </p>
        </section>

        <section className="tp-home-card" aria-labelledby="h-agents">
          <h2 id="h-agents">Connected apps &amp; agents</h2>
          {home.agents.length === 0 ? (
            <p>No app is connected.</p>
          ) : (
            <ul className="tp-home-list">
              {home.agents.map((a) => (
                <li key={a.familyId}>
                  {a.clientName} · {a.active ? "Active" : "Disconnected"}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="tp-home-card" aria-labelledby="h-account">
          <h2 id="h-account">Your account</h2>
          <p className="tp-onb-actions">
            <button
              className="tp-btn"
              data-size="sm"
              data-variant="ghost"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const r = await fetch("/api/auth/sign-out", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: "{}",
                  });
                  if (!r.ok)
                    throw Error(
                      "Sign-out failed. Your session may still be active.",
                    );
                  router.replace("/");
                  router.refresh();
                })
              }
            >
              Sign out
            </button>
            <button
              className="tp-btn"
              data-size="sm"
              data-variant="ghost"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const data = await call("export", { passportRef: ref }, true);
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(data, null, 2)], {
                      type: "application/json",
                    }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "my-taste.json";
                  a.click();
                  URL.revokeObjectURL(url);
                })
              }
            >
              Download my data
            </button>
          </p>
          {confirm === "" ? (
            <p>
              <button
                className="tp-link"
                onClick={() => setConfirm("passport")}
              >
                Start over with different favourites
              </button>{" "}
              ·{" "}
              <button className="tp-link" onClick={() => setConfirm("account")}>
                Delete my account
              </button>
            </p>
          ) : (
            <div role="alertdialog" aria-labelledby="h-del">
              <p id="h-del">
                <b>
                  {confirm === "passport"
                    ? "This deletes your saved taste, rules and connected apps. You can set up again straight away."
                    : "This deletes your account and everything in it. It can't be undone."}
                </b>
              </p>
              <p className="tp-onb-actions">
                <button
                  className="tp-btn"
                  data-size="sm"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await call(
                        confirm === "passport"
                          ? "delete-passport"
                          : "delete-account",
                        {
                          passportRef: ref,
                          confirmation:
                            confirm === "passport"
                              ? "DELETE PASSPORT"
                              : "DELETE ACCOUNT",
                        },
                        true,
                      );
                      if (confirm === "account")
                        await fetch("/api/auth/sign-out", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: "{}",
                        }).catch(() => undefined);
                      router.replace(
                        confirm === "passport" ? "/onboarding" : "/",
                      );
                      router.refresh();
                    })
                  }
                >
                  Yes, delete
                </button>
                <button
                  className="tp-btn"
                  data-size="sm"
                  data-variant="ghost"
                  onClick={() => setConfirm("")}
                >
                  Keep it
                </button>
              </p>
            </div>
          )}
        </section>
      </div>

      <footer className="tp-home-adv">
        <p className="tp-section-title">Advanced</p>
        <p>
          <Link href="/account/rules">Your rules</Link> ·{" "}
          <Link href="/account/leases">What AI can do right now</Link> ·{" "}
          <Link href="/account/timeline">History</Link> ·{" "}
          <Link href="/developers/workspace">Developer workspace</Link>
        </p>
      </footer>
    </main>
  );
}
