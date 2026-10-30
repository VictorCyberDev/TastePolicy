"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "@/components/brand/brand.css";
import "./experience.css";
import Tasteprint from "@/components/brand/Tasteprint";
import BoundaryRibbon, {
  type RibbonState,
} from "@/components/brand/BoundaryRibbon";
import {
  AuthorityLadder,
  CultureTiles,
  DecisionSeal,
  NeedChip,
  NeedChips,
  SourceNote,
  type NeedStatus,
} from "@/components/brand/primitives";
import PlaceCanvas from "@/components/brand/PlaceCanvas";
import JourneyLine from "@/components/brand/JourneyLine";
import ExplorePanel from "./ExplorePanel";
import PlaceGallery from "./PlaceGallery";
import { areaFromDisplayName } from "./relation";
import type { MapState } from "./JourneyMap";
import { evaluateRequirements } from "@/lib/requirements/evaluate";
import type {
  CandidateFact,
  Requirement,
  RequirementReport,
} from "@/lib/requirements/types";
import {
  ACTION_HUMAN,
  OUTCOME_HUMAN,
  REQUIREMENT_HUMAN,
  humanKey,
  type Outcome,
} from "@/lib/human/copy";
import { SUBJECTIVE_ACTIONS, type SubjectiveAction } from "@/lib/policy/types";
import type { StateEvaluation } from "@/lib/state/types";
import type { QlooEntity, TargetType } from "@/types/domain";
import type { OpenPlaceContext as PlaceContext } from "@/server/open/context";
import { useAssistedChoice, type PersonalLink } from "./useAssistedChoice";
import { PERSONAS, type AnswerSpec, type Persona } from "./personas";

const STATUS: Record<string, NeedStatus> = {
  SATISFIED: "met",
  VIOLATED: "unmet",
  UNKNOWN: "unknown",
  UNAVAILABLE: "unavailable",
};
const needLabel = (r: Requirement) => r.label ?? humanKey(r.key);

function finalOutcome(e: StateEvaluation): Outcome {
  return (e.authority?.outcome ?? e.decision.outcome) as Outcome;
}

export default function AssistedChoice({
  persona,
  personal,
}: {
  persona: Persona;
  personal?: PersonalLink;
}) {
  const h = useAssistedChoice(persona, personal);
  const [kind, setKind] = useState<TargetType>("place");
  const you = persona.id === "you";
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const e = h.evaluation;
  const outcome = e ? finalOutcome(e) : null;

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: false });
  }, [h.step, h.index, outcome]);

  const ribbon: RibbonState = h.busy.includes("checking")
    ? "checking"
    : outcome === "ALLOW"
      ? "allow"
      : outcome === "ASK"
        ? "ask"
        : outcome === "REJECT"
          ? "reject"
          : outcome === "UNAVAILABLE"
            ? "unavailable"
            : "discover";
  const reach = Math.max(0, SUBJECTIVE_ACTIONS.indexOf(h.ceiling)) / 4;

  return (
    <main className="tp tp-exp" data-step={h.step} data-persona={persona.id}>
      <header className="tp-exp-top">
        <Link href="/" className="tp-exp-brand">
          TastePolicy<span aria-hidden="true">.</span>
        </Link>
        <nav aria-label="Experiences">
          {you ? (
            <Link href="/dashboard">My home</Link>
          ) : (
            PERSONAS.map((p) => (
              <Link
                key={p.id}
                href={p.path}
                aria-current={p.id === persona.id ? "page" : undefined}
              >
                {p.id === "margaret"
                  ? "Margaret"
                  : p.id === "sensory-aware"
                    ? "Sensory-aware"
                    : "Low-energy"}
              </Link>
            ))
          )}
          {!you && <Link href="/judge">Judge walkthrough</Link>}
        </nav>
      </header>

      <BoundaryRibbon state={ribbon} reach={reach} />

      {h.step === "meet" && (
        <section className="tp-exp-meet" aria-labelledby="meet-h">
          <div className="tp-exp-meet-copy">
            <p className="tp-eyebrow">Assisted choice</p>
            <h1 id="meet-h" tabIndex={-1} ref={heading}>
              {persona.id === "margaret"
                ? "Meet Margaret."
                : you
                  ? "Find somewhere that feels like you."
                  : persona.name}
            </h1>
            <p className="tp-exp-tagline">{persona.tagline}</p>
            {persona.story && <p>{persona.story}</p>}
            {persona.quote && (
              <blockquote>&ldquo;{persona.quote}&rdquo;</blockquote>
            )}
          </div>
          <div className="tp-exp-meet-print">
            <Tasteprint
              anchors={persona.anchors.map((a) => a.query)}
              size={176}
            />
            <p className="tp-muted">
              {you
                ? "Your Tasteprint, drawn from the things you love. Decoration only."
                : `${persona.id === "margaret" ? "Margaret" : "This person"}\u2019s Tasteprint, drawn from the things they love. Decoration only.`}
            </p>
          </div>
          <div className="tp-exp-card">
            <h2>{you ? "What you love" : "What she loves"}</h2>
            <CultureTiles
              items={persona.anchors.map((a) => ({
                name: a.query,
                kind: a.caption,
              }))}
            />
          </div>
          <div className="tp-exp-card">
            <h2>What matters right now</h2>
            <NeedChips>
              {persona.requirements.map((r) => (
                <NeedChip
                  key={r.key}
                  label={needLabel(r)}
                  status="pending"
                  detail={r.importance === "soft" ? "preferred" : "required"}
                />
              ))}
            </NeedChips>
          </div>
          <div className="tp-exp-card">
            <h2>How far AI may go</h2>
            <AuthorityLadder ceiling={persona.ceiling} />
          </div>
          <div className="tp-exp-actions">
            <button
              className="tp-btn"
              data-variant="spectrum"
              disabled={!!h.busy}
              onClick={() => void (you ? h.discover(kind) : h.begin())}
            >
              {persona.cta}
            </button>
            {you && (
              <label className="tp-exp-kind">
                What are you looking for?
                <select
                  value={kind}
                  onChange={(ev) => setKind(ev.target.value as TargetType)}
                >
                  <option value="place">A place to go</option>
                  <option value="destination">A destination to visit</option>
                  <option value="brand">A brand or shop</option>
                </select>
              </label>
            )}
            <p className="tp-muted">
              Qloo reads real cultural relationships. Nothing is faked: if a
              service can&apos;t answer, you&apos;ll see that.
            </p>
          </div>
        </section>
      )}

      {h.step === "anchors" && (
        <section
          className="tp-exp-card tp-exp-wide"
          aria-labelledby="anchors-h"
        >
          <p className="tp-eyebrow">Step 1 · Qloo understands the taste</p>
          <h2 id="anchors-h" tabIndex={-1} ref={heading}>
            Are these exactly the things she means?
          </h2>
          {h.resolutions.length === 0 ? (
            <p role="status">{h.busy || "Waiting for Qloo…"}</p>
          ) : (
            <>
              <div className="tp-exp-pick">
                {h.resolutions.map((r, i) => (
                  <label key={persona.anchors[i].query}>
                    <span>
                      {persona.anchors[i].query}{" "}
                      <small>· {persona.anchors[i].caption}</small>
                    </span>
                    <select
                      value={h.selected[i]}
                      onChange={(ev) => {
                        h.setSelected(
                          h.selected.map((v, j) =>
                            j === i ? ev.target.value : v,
                          ),
                        );
                        h.setReviewed(false);
                      }}
                    >
                      <option value="">Choose the exact match</option>
                      {r.status === "available" &&
                        r.data.matches.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} · {m.type}
                            {m.releaseYear ? ` · ${m.releaseYear}` : ""}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
              </div>
              <label className="tp-exp-check">
                <input
                  type="checkbox"
                  checked={h.reviewed}
                  onChange={(ev) => h.setReviewed(ev.target.checked)}
                />
                <span>
                  These are the right ones. Use them as Qloo&apos;s starting
                  point.
                </span>
              </label>
              <div className="tp-exp-actions">
                <button
                  className="tp-btn"
                  disabled={
                    !!h.busy || !h.reviewed || h.selected.some((v) => !v)
                  }
                  onClick={() => void h.discover()}
                >
                  Find places that feel like this
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {h.step === "discover" && h.candidate && (
        <PlaceStage persona={persona} h={h} heading={heading} />
      )}

      <div className="tp-exp-status" role="status" aria-live="polite">
        {h.busy && <p>{h.busy}</p>}
        {h.notice && (
          <p className="tp-exp-error">
            {h.notice}{" "}
            <button className="tp-link" onClick={h.restart}>
              Start again
            </button>
          </p>
        )}
      </div>
    </main>
  );
}

type Hook = ReturnType<typeof useAssistedChoice>;

function PlaceStage({
  persona,
  h,
  heading,
}: {
  persona: Persona;
  h: Hook;
  heading: React.RefObject<HTMLHeadingElement | null>;
}) {
  const c = h.candidate as QlooEntity;
  const ctx = h.places[c.id];
  const place: PlaceContext | null = ctx && ctx !== "loading" ? ctx : null;
  const e = h.evaluation;
  const outcome = e ? finalOutcome(e) : null;
  const known: RequirementReport = evaluateRequirements(
    persona.requirements,
    h.factsFor(c),
    new Date().toISOString(),
  );
  const report = e?.requirements ?? known;
  const cues =
    h.evidence && h.evidence.explainability.status !== "unavailable"
      ? [...h.evidence.explainability.contributions]
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map((x) => h.anchors.find((a) => a.id === x.signalId)?.name)
          .filter((n): n is string => Boolean(n))
      : [];
  // The recommendation's own address reads best; the map address is a fallback.
  const locality = c.address ?? place?.place?.address;
  const area = areaFromDisplayName(place?.open?.identity.displayName);
  const mapState: MapState = h.busy.includes("checking")
    ? "checking"
    : outcome === "ALLOW"
      ? "allow"
      : outcome === "ASK"
        ? "ask"
        : outcome === "REJECT"
          ? "reject"
          : outcome === "UNAVAILABLE"
            ? "unavailable"
            : "discover";
  return (
    <section
      className="tp-exp-stage"
      aria-labelledby="place-h"
      data-outcome={outcome ?? "none"}
    >
      <p className="tp-eyebrow">
        {outcome
          ? persona.id === "you"
            ? "Step 2 · TastePolicy protects your agency"
            : "Step 3 · TastePolicy protects her agency"
          : persona.id === "you"
            ? "Step 1 · A place that feels like you"
            : "Step 2 · A place that feels like her"}
      </p>
      <h2
        id="place-h"
        tabIndex={-1}
        ref={heading}
        className="tp-visually-hidden"
      >
        Place suggestion
      </h2>
      <PlaceCanvas
        id={c.id}
        name={c.name}
        address={c.address}
        locality={locality}
        providerPhoto={place?.photo}
        hero={
          place?.open?.media.length ? (
            <PlaceGallery items={place.open.media} place={c.name} area={area} />
          ) : undefined
        }
      >
        <div className="tp-why">
          <h4>
            Why it feels like {persona.id === "margaret" ? "Margaret" : "you"}
          </h4>
          <p>
            {cues.length
              ? `Qloo finds it close to ${cues.join(", ")}.`
              : "Qloo surfaced it from the things reviewed above."}{" "}
            {persona.id === "margaret" &&
              "A cultural match is a reason to look, not a reason to go."}
          </p>
        </div>

        <div>
          <p className="tp-section-title">Will it work today?</p>
          <NeedChips>
            {report.results.map((r) => (
              <NeedChip
                key={r.requirement.key}
                label={needLabel(r.requirement)}
                status={STATUS[r.status]}
                detail={
                  r.status === "UNKNOWN" || r.status === "UNAVAILABLE"
                    ? undefined
                    : r.fact
                      ? factText(r.fact)
                      : undefined
                }
              />
            ))}
          </NeedChips>
          {ctx === "loading" && (
            <p className="tp-muted">Looking up factual place details…</p>
          )}
          {place?.status === "unavailable" && (
            <p className="tp-muted">
              Factual place details aren&apos;t attached ({reasonText(place)}).
              Anything we can&apos;t confirm stays unknown.
            </p>
          )}
        </div>

        {place?.open ? (
          <ExplorePanel
            key={c.id}
            context={place}
            name={c.name}
            address={c.address}
            mapState={mapState}
          />
        ) : null}
        {place?.status === "available" && !place.open && (
          <JourneyLine
            polyline={place.route?.polyline}
            minutes={place.route?.minutes}
            meters={place.route?.meters}
            originLabel={place.route?.originLabel}
            destinationLabel={c.name}
            unavailableReason={place.routeUnavailable}
          />
        )}

        {!e && (
          <div className="tp-exp-actions">
            <button
              className="tp-btn"
              disabled={!!h.busy || ctx === "loading"}
              onClick={() => void h.check()}
            >
              {persona.id === "you"
                ? "Check it against what matters to you"
                : "Check it against her needs"}
            </button>
            <button
              className="tp-btn"
              data-variant="ghost"
              disabled={!!h.busy}
              onClick={() => h.show(h.index + 1)}
            >
              Show me another
            </button>
          </div>
        )}

        {e && outcome && (
          <DecisionArea persona={persona} h={h} e={e} outcome={outcome} />
        )}
        {e && <Receipt persona={persona} e={e} place={place} h={h} />}
      </PlaceCanvas>
    </section>
  );
}

// "true" is not an answer a person reads: say Yes / No, with units for numbers.
const factText = (f: CandidateFact) =>
  typeof f.value === "boolean"
    ? f.value
      ? "Yes"
      : "No"
    : `${f.value}${f.unit ? " " + f.unit : ""}`;

const factSources = (facts: CandidateFact[]) => {
  const names = [
    ...new Set(
      facts.map((f) =>
        f.sourceType === "USER"
          ? "you"
          : f.source === "openstreetmap"
            ? "OpenStreetMap"
            : f.source === "openrouteservice"
              ? "openrouteservice"
              : f.source,
      ),
    ),
  ];
  return names.length ? names.join(", ") : "none attached";
};

const reasonText = (p: PlaceContext) =>
  p.reason === "not_configured"
    ? "no place provider is configured"
    : p.reason === "no_identity"
      ? "we couldn't be sure it's the same place"
      : "the provider didn't answer";

function DecisionArea({
  persona,
  h,
  e,
  outcome,
}: {
  persona: Persona;
  h: Hook;
  e: StateEvaluation;
  outcome: Outcome;
}) {
  const factAsk = e.decision.outcome === "ASK";
  const a = e.authority;
  const c = e.action.candidate;
  const unknownKeys = e.requirements?.hardUnknown ?? [];
  const asked = a?.requestedAction as SubjectiveAction | undefined;
  return (
    <div className="tp-exp-decision">
      <DecisionSeal
        outcome={outcome}
        headline={
          outcome === "ALLOW"
            ? `Go ahead: ${ACTION_HUMAN[(a?.permitted.at(-1) ?? "SUGGEST") as SubjectiveAction].label.toLowerCase()} it`
            : OUTCOME_HUMAN[outcome].label
        }
      >
        {outcome === "ASK" && factAsk
          ? `This feels like ${persona.id === "you" ? "you" : "her"}, but I need to confirm a few things before your assistant shortlists it.`
          : outcome === "ASK"
            ? `Your assistant wanted to ${ACTION_HUMAN[asked ?? "SUGGEST"].label.toLowerCase()} it, which is further than you allowed.`
            : outcome === "ALLOW"
              ? `It fits ${persona.id === "you" ? "your" : "her"} taste and what works today. Your assistant may go as far as ${ACTION_HUMAN[(a?.ceiling ?? "SUGGEST") as SubjectiveAction].label.toLowerCase()}, and no further.`
              : outcome === "REJECT"
                ? `${c.name} breaks something you told us you need. A strong cultural match can't override that.`
                : OUTCOME_HUMAN.UNAVAILABLE.line}
      </DecisionSeal>

      {factAsk && unknownKeys.length > 0 && (
        <div className="tp-exp-ask tp-authority" data-surface="authority">
          <h3>A few quick questions</h3>
          <ul>
            {unknownKeys.map((k) => (
              <li key={k}>
                <AskControl
                  k={k}
                  spec={persona.answers[k] ?? defaultSpec(persona, k)}
                  busy={!!h.busy}
                  onAnswer={(v) => void h.answer(k, v)}
                />
              </li>
            ))}
          </ul>
          <p className="tp-muted">
            Your answer is recorded as your word, not as a verified fact. It
            only applies to this choice.
          </p>
        </div>
      )}

      {a && !factAsk && (
        <div className="tp-exp-ladder tp-authority" data-surface="authority">
          <h3>How far {persona.id === "you" ? "your" : "her"} AI may go</h3>
          <AuthorityLadder ceiling={h.ceiling} requested={asked} />
          {outcome === "ASK" && a.basis === "ACTION_CEILING" && (
            <div className="tp-exp-actions">
              <button
                className="tp-btn"
                disabled={!!h.busy}
                onClick={() => void h.widen(asked!)}
              >
                I allow it: {ACTION_HUMAN[asked!].label.toLowerCase()}
              </button>
              <button
                className="tp-btn"
                data-variant="ghost"
                disabled={!!h.busy}
                onClick={() => void h.check("SHORTLIST")}
              >
                Keep it at {ACTION_HUMAN[h.ceiling].label.toLowerCase()}
              </button>
            </div>
          )}
        </div>
      )}

      {outcome === "ALLOW" &&
        a &&
        SUBJECTIVE_ACTIONS.indexOf(h.ceiling) < SUBJECTIVE_ACTIONS.length - 1 &&
        a.requestedAction !== "PRESENT_AS_SELECTED" && (
          <div className="tp-exp-actions">
            <button
              className="tp-btn"
              data-variant="ghost"
              disabled={!!h.busy}
              onClick={() => void h.check("PRESENT_AS_SELECTED")}
            >
              Simulate: the agent tries to present it as the final choice
            </button>
            <p className="tp-muted">
              This is what an over-eager agent would do. Watch the limit hold.
            </p>
          </div>
        )}

      {(outcome === "REJECT" || outcome === "UNAVAILABLE") && (
        <div className="tp-exp-actions">
          <button
            className="tp-btn"
            disabled={!!h.busy}
            onClick={() => h.show(h.index + 1)}
          >
            Try another place
          </button>
          {outcome === "UNAVAILABLE" && (
            <button
              className="tp-btn"
              data-variant="ghost"
              disabled={!!h.busy}
              onClick={() => void h.check()}
            >
              Check again
            </button>
          )}
        </div>
      )}
      <p>
        <button className="tp-link" onClick={h.clearEvaluation}>
          ← Back to the place
        </button>
      </p>
    </div>
  );
}

function defaultSpec(persona: Persona, key: string): AnswerSpec {
  const r = persona.requirements.find((x) => x.key === key);
  if (typeof r?.expected === "number")
    return { type: "number", unit: r.unit ?? "", max: 100000 };
  if (Array.isArray(r?.expected))
    return {
      type: "choice",
      options: r.expected.map((v) => ({ value: String(v), label: String(v) })),
    };
  return { type: "yesno", yes: "Yes", no: "No" };
}

function AskControl({
  k,
  spec,
  busy,
  onAnswer,
}: {
  k: string;
  spec: AnswerSpec;
  busy: boolean;
  onAnswer: (v: string | number | boolean) => void;
}) {
  const [n, setN] = useState("");
  const question =
    REQUIREMENT_HUMAN[k]?.question ?? `What is the value for ${humanKey(k)}?`;
  return (
    <fieldset className="tp-ask-q">
      <legend>{question}</legend>
      {spec.type === "yesno" && (
        <div className="tp-ask-row">
          <button
            className="tp-btn"
            disabled={busy}
            onClick={() => onAnswer(true)}
          >
            {spec.yes}
          </button>
          <button
            className="tp-btn"
            data-variant="ghost"
            disabled={busy}
            onClick={() => onAnswer(false)}
          >
            {spec.no}
          </button>
        </div>
      )}
      {spec.type === "choice" && (
        <div className="tp-ask-row">
          {spec.options.map((o) => (
            <button
              key={o.value}
              className="tp-btn"
              data-variant="ghost"
              disabled={busy}
              onClick={() => onAnswer(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      {spec.type === "number" && (
        <form
          className="tp-ask-row"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (n !== "") onAnswer(Number(n));
          }}
        >
          <label>
            <span className="tp-visually-hidden">{question}</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={spec.max}
              step="any"
              required
              value={n}
              onChange={(ev) => setN(ev.target.value)}
              aria-label={`${spec.unit}`}
            />{" "}
            {spec.unit}
          </label>
          <button className="tp-btn" type="submit" disabled={busy || n === ""}>
            Use this
          </button>
        </form>
      )}
      <p className="tp-muted">
        Not sure? Leave it. Your assistant will keep asking instead of guessing.
      </p>
    </fieldset>
  );
}

// "Why this happened": each kind of evidence keeps its own source.
function Receipt({
  persona,
  e,
  place,
  h,
}: {
  persona: Persona;
  e: StateEvaluation;
  place: PlaceContext | null;
  h: Hook;
}) {
  const q = e.cultural.status === "available" ? e.cultural.data : null;
  const facts: CandidateFact[] = e.context.facts ?? [];
  const a = e.authority;
  return (
    <details className="tp-receipt">
      <summary>Why this happened</summary>
      <div className="tp-receipt-grid">
        <SourceNote kind="Cultural evidence" source="Qloo">
          {q
            ? `Affinity ${q.alignmentScore.toFixed(3)} (${q.qlooEvidence.scale} scale). This is taste similarity, not a promise and not a fact about the place.`
            : "Qloo evidence was not available for this check."}
        </SourceNote>
        <SourceNote kind="Place facts" source={factSources(facts)}>
          {facts.length
            ? facts
                .map(
                  (f) =>
                    `${humanKey(f.key)}: ${f.state === "known" ? factText(f) : f.state} (${f.sourceType === "USER" ? "your answer" : f.source}${f.note ? `; ${f.note.replace(/\.$/, "")}` : ""})`,
                )
                .join("; ")
            : "No factual place details were available. Unknown stays unknown."}
        </SourceNote>
        <SourceNote
          kind="Place imagery"
          source={
            place?.open?.media.length
              ? [...new Set(place.open.media.map((m) => m.attribution))].join(
                  ", ",
                )
              : "illustration or none"
          }
        >
          Presentation only. Photos are labelled by how they relate to the place
          (photo of it, near it, or around it) and are never used as evidence
          about access, noise or safety.
        </SourceNote>
        <SourceNote kind="Your requirements" source="you">
          {persona.requirements
            .map(
              (r) =>
                `${needLabel(r)} (${r.importance === "hard" ? "required" : "preferred"})`,
            )
            .join("; ")}
        </SourceNote>
        <SourceNote kind="Authority" source="TastePolicy rules you set">
          {a
            ? `Your AI may go as far as “${ACTION_HUMAN[a.ceiling as SubjectiveAction].label}”. It asked for “${ACTION_HUMAN[a.requestedAction as SubjectiveAction].label}”.`
            : "No action level was requested."}
        </SourceNote>
        <SourceNote kind="Final decision" source="TastePolicy evaluator">
          {OUTCOME_HUMAN[finalOutcome(e)].label}.{" "}
          {e.authority?.basis ?? e.decision.basis}
          {" · "}
          {(e.authority?.rules ?? e.decision.rules).join(", ")}
        </SourceNote>
      </div>
      <details className="tp-dev">
        <summary>Developer details</summary>
        <p>
          Evaluation {e.evaluationId} · state v{e.stateVersion}. Preference
          authority only: no booking, payment or messaging power.
        </p>
        <pre>
          {JSON.stringify(
            {
              decision: e.decision,
              authority: e.authority,
              requirements: e.requirements,
              context: e.context,
              placeIdentity: place?.identity,
            },
            null,
            2,
          )}
        </pre>
        <button className="tp-link" onClick={h.restart}>
          Start over
        </button>
      </details>
    </details>
  );
}
