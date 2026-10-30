"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "@/components/brand/brand.css";
import "./onboarding.css";
import Tasteprint from "@/components/brand/Tasteprint";
import { AuthorityLadder } from "@/components/brand/primitives";
import { useProductState } from "@/features/product/useProductState";
import { usePolicyApi } from "@/features/policy/usePolicyApi";
import { AreaPicker, NeedsEditor, type Origin } from "./NeedsEditor";
import {
  NEED_DEFAULTS,
  buildRequirements,
  type NeedSelection,
} from "@/lib/product/needs";
import { ACTION_HUMAN } from "@/lib/human/copy";
import { DEFAULT_POLICY, type SubjectiveAction } from "@/lib/policy/types";
import type {
  EntityResolution,
  EntityType,
  ProviderResult,
  QlooEntity,
} from "@/types/domain";

type Stage = "welcome" | "taste" | "confirm" | "needs" | "ceiling" | "done";
const ORDER: Stage[] = [
  "welcome",
  "taste",
  "confirm",
  "needs",
  "ceiling",
  "done",
];
const STEP_LABEL: Record<Stage, string> = {
  welcome: "Welcome",
  taste: "Your taste",
  confirm: "Check it's right",
  needs: "What matters",
  ceiling: "How far AI may go",
  done: "Ready",
};
const TYPES: { value: EntityType; label: string }[] = [
  { value: "artist", label: "Musician or band" },
  { value: "movie", label: "Film" },
  { value: "tv_show", label: "TV show" },
  { value: "book", label: "Book" },
  { value: "brand", label: "Brand or shop" },
  { value: "place", label: "Place" },
  { value: "destination", label: "City or destination" },
];
const HINT = [
  "A musician or band you love",
  "A film you could watch again",
  "A TV show you remember",
  "A book you recommend",
  "A brand or shop you like",
];
const START_TYPES: EntityType[] = [
  "artist",
  "movie",
  "tv_show",
  "book",
  "brand",
];

const typeLabel = (t: string) =>
  TYPES.find((x) => x.value === t)?.label.toLowerCase() ?? t;

export default function Onboarding() {
  const { state, reload } = useProductState();
  const call = usePolicyApi();
  const [stage, setStage] = useState<Stage>("welcome");
  const [queries, setQueries] = useState(["", "", "", "", ""]);
  const [types, setTypes] = useState<EntityType[]>(START_TYPES);
  const [found, setFound] = useState<ProviderResult<EntityResolution>[]>([]);
  const [picked, setPicked] = useState<string[]>(["", "", "", "", ""]);
  const [reviewed, setReviewed] = useState(false);
  const [label, setLabel] = useState("My taste");
  const [needs, setNeeds] = useState<NeedSelection[]>(NEED_DEFAULTS);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [ceiling, setCeiling] = useState<SubjectiveAction>("SHORTLIST");
  const [passportRef, setPassportRef] = useState("");
  const [anchors, setAnchors] = useState<QlooEntity[]>([]);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const resumed = useRef(false);

  // A signed-in person who already has a Passport but never finished setup
  // resumes where they left off; one who finished is sent home.
  useEffect(() => {
    if (state.kind !== "ACTIVE" || resumed.current) return;
    resumed.current = true;
    const ref = state.passport.passportRef;
    setPassportRef(ref);
    void (async () => {
      try {
        const [taste, policy] = await Promise.all([
          call<{ anchors: QlooEntity[]; needs: { requirements: unknown[] } }>(
            "taste",
            { passportRef: ref },
          ),
          call<{ active: unknown | null }>("policy-get", { passportRef: ref }),
        ]);
        setAnchors(taste.anchors);
        setStage(
          policy.active
            ? "done"
            : taste.needs.requirements.length
              ? "ceiling"
              : "needs",
        );
      } catch {
        setStage("needs");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind]);

  useEffect(() => {
    heading.current?.focus();
  }, [stage]);

  async function run(label: string, op: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    setNotice("");
    try {
      await op();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy("");
    }
  }

  if (state.kind === "LOADING")
    return (
      <main className="tp-onb" aria-busy="true">
        <p role="status">Opening setup…</p>
      </main>
    );
  if (state.kind === "VISITOR")
    return (
      <main className="tp-onb">
        <h1 tabIndex={-1} ref={heading}>
          Sign in to set up your taste
        </h1>
        <p>Your taste is private and saved to your own account.</p>
        <p className="tp-onb-actions">
          <Link className="tp-btn" data-variant="spectrum" href="/signup">
            Create an account
          </Link>
          <Link className="tp-btn" data-variant="ghost" href="/login">
            Sign in
          </Link>
        </p>
      </main>
    );
  if (state.kind === "UNAVAILABLE")
    return (
      <main className="tp-onb">
        <h1 tabIndex={-1} ref={heading}>
          Setup is unavailable right now
        </h1>
        <p role="alert">
          We couldn&apos;t reach your account. Nothing was changed.
        </p>
        <button className="tp-btn" onClick={() => void reload()}>
          Try again
        </button>
      </main>
    );

  const index = ORDER.indexOf(stage);
  const results = found.map((r) => (r.status === "available" ? r.data : null));
  const chosen = results.map(
    (r, i) => r?.matches.find((m) => m.id === picked[i]) ?? null,
  );
  const distinct = new Set(picked.filter(Boolean)).size === 5;
  const enoughKinds = new Set(chosen.map((c) => c?.type)).size >= 2;

  const resolve = () =>
    run("Finding exactly what you meant…", async () => {
      const r = await fetch("/api/demo/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signals: queries.map((query, i) => ({
            query,
            expectedType: types[i],
          })),
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || body.status !== "available")
        throw Error(
          body.reason === "not_configured"
            ? "Taste matching isn't available in this environment, so nothing was created."
            : "We couldn't reach the taste service. Nothing was created. Try again in a moment.",
        );
      const list = body.data as ProviderResult<EntityResolution>[];
      setFound(list);
      setPicked(
        list.map((x, i) => {
          if (x.status !== "available") return "";
          const exact = x.data.matches.find(
            (m) =>
              m.name.trim().toLowerCase() === queries[i].trim().toLowerCase(),
          );
          if (exact) return exact.id;
          return x.data.state === "single" ? (x.data.matches[0]?.id ?? "") : "";
        }),
      );
      setReviewed(false);
      setStage("confirm");
    });

  const create = () =>
    run("Saving your taste…", async () => {
      const made = await call<{ passportRef: string }>(
        "create",
        {
          displayLabel: label.trim(),
          signalIds: picked,
          identitiesReviewed: true,
        },
        true,
      );
      setPassportRef(made.passportRef);
      setAnchors(chosen.filter((c): c is QlooEntity => Boolean(c)));
      setStage("needs");
      void reload();
    });

  const saveNeeds = () =>
    run("Saving what matters…", async () => {
      await call(
        "needs-set",
        { passportRef, requirements: buildRequirements(needs), origin },
        true,
      );
      setStage("ceiling");
    });

  const saveCeiling = () =>
    run("Saving your limit…", async () => {
      const current = await call<{ active: { version: number } | null }>(
        "policy-get",
        { passportRef },
      );
      await call(
        "policy-publish",
        {
          passportRef,
          expectedVersion: current.active?.version ?? 0,
          document: {
            ...DEFAULT_POLICY,
            actions: { default: ceiling, byDomain: {}, byAgent: {} },
          },
        },
        true,
      );
      setStage("done");
      void reload();
    });

  return (
    <main className="tp-onb" data-stage={stage}>
      <ol className="tp-onb-steps" aria-label="Setup progress">
        {ORDER.slice(0, -1).map((s, i) => (
          <li
            key={s}
            aria-current={s === stage ? "step" : undefined}
            data-done={i < index}
          >
            {STEP_LABEL[s]}
          </li>
        ))}
      </ol>

      {stage === "welcome" && (
        <section>
          <p className="tp-eyebrow">Welcome</p>
          <h1 tabIndex={-1} ref={heading}>
            Let&apos;s set up your taste.
          </h1>
          <p className="tp-onb-lead">
            It takes about two minutes. You&apos;ll name five things you love,
            say what matters when you go out, and choose how far an AI helper
            may go on your behalf.
          </p>
          <ul className="tp-onb-points">
            <li>Everything stays private to your account.</li>
            <li>Nothing is bought, booked or sent for you. Ever.</li>
            <li>You can change any of it later.</li>
          </ul>
          <button
            className="tp-btn"
            data-variant="spectrum"
            onClick={() => setStage("taste")}
          >
            Start
          </button>
        </section>
      )}

      {stage === "taste" && (
        <section>
          <p className="tp-eyebrow">Step 1 of 4</p>
          <h1 tabIndex={-1} ref={heading}>
            Name five things you love.
          </h1>
          <p className="tp-onb-lead">
            Use your own words. Next we&apos;ll show what we found so you can
            confirm the exact ones you mean. Mix at least two kinds.
          </p>
          <div className="tp-onb-grid">
            {queries.map((q, i) => (
              <div key={i} className="tp-onb-row">
                <label>
                  {`Favourite ${i + 1}`}
                  <input
                    value={q}
                    maxLength={120}
                    autoComplete="off"
                    placeholder={HINT[i]}
                    onChange={(e) =>
                      setQueries(
                        queries.map((x, j) => (j === i ? e.target.value : x)),
                      )
                    }
                  />
                </label>
                <label>
                  Kind
                  <select
                    value={types[i]}
                    onChange={(e) =>
                      setTypes(
                        types.map((x, j) =>
                          j === i ? (e.target.value as EntityType) : x,
                        ),
                      )
                    }
                  >
                    {TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </div>
          <p role="alert">{notice}</p>
          <button
            className="tp-btn"
            data-variant="spectrum"
            disabled={
              !!busy ||
              queries.some((q) => !q.trim()) ||
              new Set(queries.map((q) => q.trim().toLowerCase())).size < 5 ||
              new Set(types).size < 2
            }
            onClick={() => void resolve()}
          >
            {busy || "Find them"}
          </button>
          <p className="tp-muted">
            {new Set(types).size < 2
              ? "Choose at least two different kinds."
              : new Set(queries.map((q) => q.trim().toLowerCase())).size < 5 &&
                  queries.every((q) => q.trim())
                ? "Each favourite should be different."
                : ""}
          </p>
        </section>
      )}

      {stage === "confirm" && (
        <section>
          <p className="tp-eyebrow">Step 2 of 4</p>
          <h1 tabIndex={-1} ref={heading}>
            Are these exactly the ones you mean?
          </h1>
          <div className="tp-onb-grid">
            {found.map((r, i) => (
              <div key={i} className="tp-onb-row">
                <label>
                  <span>
                    You wrote <b>{queries[i]}</b> ({typeLabel(types[i])})
                  </span>
                  <select
                    value={picked[i]}
                    disabled={r.status !== "available"}
                    onChange={(e) => {
                      setPicked(
                        picked.map((v, j) => (j === i ? e.target.value : v)),
                      );
                      setReviewed(false);
                    }}
                  >
                    <option value="">Choose the exact match</option>
                    {r.status === "available" &&
                      r.data.matches.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                          {m.releaseYear ? ` (${m.releaseYear})` : ""} ·{" "}
                          {typeLabel(m.type)}
                        </option>
                      ))}
                  </select>
                </label>
                <small>
                  {r.status !== "available"
                    ? "We couldn't look this one up. Go back and try again."
                    : r.data.state === "no_match"
                      ? "No match found. Go back and reword it."
                      : r.data.state === "ambiguous" && !picked[i]
                        ? "More than one could fit. Please choose."
                        : ""}
                </small>
              </div>
            ))}
          </div>
          <label className="tp-onb-check">
            <input
              type="checkbox"
              checked={reviewed}
              disabled={!distinct}
              onChange={(e) => setReviewed(e.target.checked)}
            />{" "}
            These are the five I mean.
          </label>
          {distinct && !enoughKinds && (
            <p role="alert">Choose at least two different kinds.</p>
          )}
          <label className="tp-onb-name">
            Name this taste
            <input
              value={label}
              maxLength={80}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <p role="alert">{notice}</p>
          <p className="tp-onb-actions">
            <button
              className="tp-btn"
              data-variant="ghost"
              onClick={() => setStage("taste")}
            >
              Back
            </button>
            <button
              className="tp-btn"
              data-variant="spectrum"
              disabled={
                !!busy ||
                !reviewed ||
                !distinct ||
                !enoughKinds ||
                !label.trim()
              }
              onClick={() => void create()}
            >
              {busy || "Save my taste"}
            </button>
          </p>
        </section>
      )}

      {stage === "needs" && (
        <section>
          <p className="tp-eyebrow">Step 3 of 4</p>
          <h1 tabIndex={-1} ref={heading}>
            What matters when you go out?
          </h1>
          <p className="tp-onb-lead">
            Your taste says what you&apos;d love. These say what has to work.
            Choose any that apply. A required one is never overridden by taste.
          </p>
          <NeedsEditor value={needs} onChange={setNeeds} />
          <AreaPicker origin={origin} onPick={setOrigin} />
          <p role="alert">{notice}</p>
          <p className="tp-onb-actions">
            <button
              className="tp-btn"
              data-variant="ghost"
              disabled={!!busy}
              onClick={() => setStage("ceiling")}
            >
              Skip for now
            </button>
            <button
              className="tp-btn"
              data-variant="spectrum"
              disabled={!!busy}
              onClick={() => void saveNeeds()}
            >
              {busy || "Save and continue"}
            </button>
          </p>
        </section>
      )}

      {stage === "ceiling" && (
        <section>
          <p className="tp-eyebrow">Step 4 of 4</p>
          <h1 tabIndex={-1} ref={heading}>
            How far may an AI helper go?
          </h1>
          <p className="tp-onb-lead">
            Anything above this line, it asks you first. You can move the line
            any time.
          </p>
          <AuthorityLadder
            ceiling={ceiling}
            onChange={setCeiling}
            name="onboarding-ceiling"
          />
          <p className="tp-muted">
            Chosen: <b>{ACTION_HUMAN[ceiling].label}</b>.{" "}
            {ceiling === "SHORTLIST" && "A good place to start."}
          </p>
          <p role="alert">{notice}</p>
          <button
            className="tp-btn"
            data-variant="spectrum"
            disabled={!!busy}
            onClick={() => void saveCeiling()}
          >
            {busy || "Finish setup"}
          </button>
        </section>
      )}

      {stage === "done" && (
        <section>
          <p className="tp-eyebrow">All set</p>
          <h1 tabIndex={-1} ref={heading}>
            Your taste is ready.
          </h1>
          <div className="tp-onb-done">
            <Tasteprint
              anchors={anchors.map((a) => a.name)}
              size={160}
              label="Your Tasteprint, a decorative pattern drawn from the things you chose. Not a score."
            />
            <ul className="tp-onb-points">
              {anchors.map((a) => (
                <li key={a.id}>
                  {a.name} <small>· {typeLabel(a.type)}</small>
                </li>
              ))}
            </ul>
          </div>
          <p className="tp-onb-actions">
            <Link className="tp-btn" data-variant="spectrum" href="/experience">
              Find somewhere that feels like you
            </Link>
            <Link className="tp-btn" data-variant="ghost" href="/dashboard">
              Open my home
            </Link>
          </p>
        </section>
      )}
    </main>
  );
}
