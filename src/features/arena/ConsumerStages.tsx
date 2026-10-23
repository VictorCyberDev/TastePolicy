"use client";

import Link from "next/link";
import { useState } from "react";
import type { PointerEventHandler, ReactNode, Ref } from "react";
import type { QlooEntity } from "@/types/domain";
import { TASTE_IMAGE_LABEL, portraitSeed, tasteImageSrc } from "./portrait";

export type Stage =
  | "taste"
  | "confirm"
  | "discover"
  | "checking"
  | "ask"
  | "allow"
  | "handoff"
  | "reject"
  | "pause"
  | "noRepair";

type Heading = Ref<HTMLHeadingElement>;

const STEPS = ["Taste", "Discover", "Check", "Decision"] as const;
const STEP_OF: Record<Stage, number> = {
  taste: 0,
  confirm: 0,
  discover: 1,
  checking: 2,
  ask: 3,
  allow: 3,
  handoff: 3,
  reject: 3,
  pause: 3,
  noRepair: 3,
};

export function StageProgress({ stage }: { stage: Stage }) {
  const current = STEP_OF[stage];
  return (
    <ol
      className="stageProgress"
      aria-label={`Step ${current + 1} of ${STEPS.length}: ${STEPS[current]}`}
    >
      {STEPS.map((step, index) => (
        <li
          key={step}
          data-state={
            index < current ? "done" : index === current ? "current" : "next"
          }
          aria-current={index === current ? "step" : undefined}
        >
          <span aria-hidden="true" />
          <em>{step}</em>
        </li>
      ))}
    </ol>
  );
}

function Screen({ stage, children }: { stage: Stage; children: ReactNode }) {
  return (
    <section className="stageScreen" data-stage={stage}>
      {children}
    </section>
  );
}

function ChosenPlace({ candidate }: { candidate: QlooEntity }) {
  return (
    <div className="chosenPlace">
      {/* Presentation only: an authored illustrative image, never property photography. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="chosenImage"
        src={tasteImageSrc(candidate.id)}
        alt=""
        width={40}
        height={40}
      />
      <strong>{candidate.name}</strong>
    </div>
  );
}

const SPECTRUM_TILES = [
  "vermilion",
  "cobalt",
  "saffron",
  "violet",
  "aqua",
] as const;

export function TasteStage({
  signals,
  busy,
  onStart,
  headingRef,
}: {
  signals: string[];
  busy: boolean;
  onStart: () => void;
  headingRef: Heading;
}) {
  return (
    <Screen stage="taste">
      <div className="heroText">
        <p className="stageEyebrow">TastePolicy</p>
        <h1 ref={headingRef} tabIndex={-1}>
          Taste is plural. Permission is precise.
        </h1>
        <p className="stageLead">Start with five things you already chose.</p>
        <div className="stageActions">
          <button className="primaryAction" disabled={busy} onClick={onStart}>
            Use my reviewed taste
          </button>
        </div>
      </div>
      <ul className="tasteTiles" aria-label="Taste signals">
        {signals.map((signal, index) => (
          <li key={signal} data-tone={SPECTRUM_TILES[index % 5]}>
            <span>{signal}</span>
          </li>
        ))}
      </ul>
    </Screen>
  );
}

export function ConfirmStage({
  items,
  identities,
  reviewed,
  disabled,
  onReviewed,
  onDiscover,
  headingRef,
}: {
  items: { query: string; name: string; detail: string }[];
  identities: ReactNode;
  reviewed: boolean;
  disabled: boolean;
  onReviewed: (value: boolean) => void;
  onDiscover: () => void;
  headingRef: Heading;
}) {
  return (
    <Screen stage="confirm">
      <p className="stageEyebrow">Quick identity check</p>
      <h1 ref={headingRef} tabIndex={-1}>
        Are these the five things you meant?
      </h1>
      <div className="resolvedGrid">
        {items.map((item, index) => (
          <article
            key={item.query}
            className="resolvedItem"
            data-tone={SPECTRUM_TILES[index % 5]}
          >
            <strong>{item.name}</strong>
            <small>{item.detail}</small>
          </article>
        ))}
      </div>
      <details className="identityDetails">
        <summary>Something looks wrong?</summary>
        {identities}
      </details>
      <label className="confirmTaste">
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(event) => onReviewed(event.target.checked)}
        />
        Yes — these are my five explicit taste signals.
      </label>
      <div className="stageActions">
        <button
          className="primaryAction"
          disabled={disabled}
          onClick={onDiscover}
        >
          Find a place through my taste
        </button>
      </div>
      <p className="stageFine">Kept in a temporary demo profile.</p>
    </Screen>
  );
}

export function DiscoverCard({
  candidate,
  basedOn,
  proposal,
  busy,
  onNext,
  onCheck,
  onPointerDown,
  onPointerUp,
  headingRef,
  children,
}: {
  candidate: QlooEntity;
  basedOn: string[];
  proposal: boolean;
  busy: boolean;
  onNext: () => void;
  onCheck: () => void;
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
  headingRef: Heading;
  children?: ReactNode;
}) {
  const [why, setWhy] = useState(false);
  const seed = portraitSeed(candidate.id);
  return (
    <section
      className="choiceStage"
      data-stage="discover"
      data-entry={proposal ? "proposal" : "card"}
      aria-label="Agent recommendation"
    >
      <h1 className="srOnly">
        {proposal ? "A new proposal" : "Something for your taste"}
      </h1>
      <div
        className="placeCard"
        data-portrait={seed.palette}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <div className="placePortrait">
          {/* A real, authored image asset; the licensed photo (when valid) layers above it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="tasteImage"
            src={tasteImageSrc(candidate.id)}
            alt="Illustrative taste image, not property photography"
            width={800}
            height={1000}
            decoding="async"
          />
          <span className="portraitScrim" />
          <div className="portraitCopy">
            <span>{TASTE_IMAGE_LABEL}</span>
          </div>
        </div>
        <div className="cardBoundary" aria-hidden="true">
          <i />
        </div>

        <div className="placeContent">
          <div className="placeMeta">
            <span>
              {proposal ? "New proposal · not checked yet" : candidate.type}
            </span>
            {candidate.address && <span>{candidate.address}</span>}
          </div>
          <h3 ref={headingRef} tabIndex={-1}>
            {candidate.name}
          </h3>
          <p className="framing">
            {proposal
              ? "Your excluded choice stays excluded. This one still needs its own check."
              : "A match for your five confirmed tastes."}
          </p>
          <ul className="tasteCues" aria-label="Based on your taste">
            {basedOn.slice(0, 3).map((name, index) => (
              <li key={name} data-tone={SPECTRUM_TILES[index % 5]}>
                {name}
              </li>
            ))}
            {basedOn.length > 3 && <li>+{basedOn.length - 3}</li>}
          </ul>

          <div className="cardActions" data-proposal={proposal}>
            {!proposal && (
              <button className="quietAction" disabled={busy} onClick={onNext}>
                ← Another one
              </button>
            )}
            <button
              className="quietAction"
              aria-expanded={why}
              onClick={() => setWhy((value) => !value)}
            >
              Why this?
            </button>
            <button className="primaryAction" disabled={busy} onClick={onCheck}>
              {proposal ? "Check this alternative →" : "Looks good →"}
            </button>
          </div>

          {why && (
            <div className="whyPanel">
              <p>
                Qloo matched this to the five things you confirmed. TastePolicy
                has not checked it yet.
              </p>
              <p className="stageFine">
                Swipe right checks this choice. Swipe left shows another.
                Neither grants booking, payment or any other authority.
              </p>
            </div>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

export function CheckingStage({
  title,
  headingRef,
}: {
  title: string;
  headingRef: Heading;
}) {
  return (
    <Screen stage="checking">
      <div className="checkingPlane" aria-hidden="true">
        <span className="cpTaste" />
        <span className="cpLine" />
        <span className="cpPermission" />
      </div>
      <h1 ref={headingRef} tabIndex={-1}>
        {title}
      </h1>
      <p className="stageSupport">Nothing is booked or paid while this runs.</p>
    </Screen>
  );
}

function Mark({ glyph, label }: { glyph: string; label: string }) {
  return (
    <>
      <span className="markGlyph" aria-hidden="true">
        {glyph}
      </span>
      {label}
    </>
  );
}

export function AllowStage({
  candidate,
  exclusionKept,
  onContinue,
  evidence,
  headingRef,
}: {
  candidate: QlooEntity;
  exclusionKept: boolean;
  onContinue: () => void;
  evidence: ReactNode;
  headingRef: Heading;
}) {
  return (
    <Screen stage="allow">
      <section
        className="humanDecision"
        data-decision="ALLOW"
        aria-live="polite"
      >
        <ChosenPlace candidate={candidate} />
        <h1 ref={headingRef} tabIndex={-1}>
          <Mark glyph="✓" label="This fits" />
        </h1>
        <p className="stageLead">
          Your concierge can continue with this choice.
        </p>
        <p className="stageSupport">
          Booking and payment still need separate authority.
        </p>
        {exclusionKept && (
          <p className="stageFine">Your earlier exclusion is still saved.</p>
        )}
        <div className="stageActions">
          <button className="primaryAction" onClick={onContinue}>
            Continue with this choice →
          </button>
        </div>
        <span className="machineOutcome">Internal policy: ALLOW</span>
      </section>
      {evidence}
    </Screen>
  );
}

export function HandoffStage({
  candidate,
  onBack,
  headingRef,
}: {
  candidate: QlooEntity;
  onBack: () => void;
  headingRef: Heading;
}) {
  return (
    <Screen stage="handoff">
      <ChosenPlace candidate={candidate} />
      <p className="stageEyebrow">Handoff</p>
      <h1 ref={headingRef} tabIndex={-1}>
        Preference check complete.
      </h1>
      <p className="stageLead">Your agent may continue with this choice.</p>
      <div className="handoffBoundary" aria-label="Where TastePolicy ends">
        <div data-side="done">
          <span>TastePolicy</span>
          <strong>Taste approved</strong>
          <small>The subjective choice may continue.</small>
        </div>
        <i aria-hidden="true" />
        <div data-side="next">
          <span>Next, elsewhere</span>
          <strong>
            Booking, purchase or payment needs separate execution authorization
          </strong>
          <small>Not granted here.</small>
        </div>
      </div>
      <p className="stageFine">
        Nothing was booked, reserved, purchased or paid. No card or dates were
        collected.
      </p>
      <div className="stageActions">
        <button className="quietAction" onClick={onBack}>
          Choose something else
        </button>
      </div>
    </Screen>
  );
}

export function AskStage({
  candidate,
  lead,
  clarify,
  evidence,
  headingRef,
}: {
  candidate: QlooEntity;
  lead: string;
  clarify: ReactNode;
  evidence: ReactNode;
  headingRef: Heading;
}) {
  return (
    <Screen stage="ask">
      <section className="humanDecision" data-decision="ASK" aria-live="polite">
        <ChosenPlace candidate={candidate} />
        <h1 ref={headingRef} tabIndex={-1}>
          <Mark glyph="?" label="One thing first" />
        </h1>
        <p className="stageLead">{lead}</p>
        {clarify}
        <span className="machineOutcome">Internal policy: ASK</span>
      </section>
      {evidence}
    </Screen>
  );
}

export function RejectStage({
  candidate,
  lead,
  canRepair,
  busy,
  onRepair,
  onAnother,
  evidence,
  headingRef,
}: {
  candidate: QlooEntity;
  lead: string;
  canRepair: boolean;
  busy: boolean;
  onRepair: () => void;
  onAnother: () => void;
  evidence: ReactNode;
  headingRef: Heading;
}) {
  return (
    <Screen stage="reject">
      <section
        className="humanDecision"
        data-decision="REJECT"
        aria-live="polite"
      >
        <ChosenPlace candidate={candidate} />
        <h1 ref={headingRef} tabIndex={-1}>
          <Mark glyph="×" label="Not this one" />
        </h1>
        <p className="stageLead">{lead}</p>
        <div className="stageActions">
          {canRepair ? (
            <button
              className="primaryAction repairAction"
              disabled={busy}
              onClick={onRepair}
            >
              Find something that respects that →
            </button>
          ) : (
            <button
              className="primaryAction"
              disabled={busy}
              onClick={onAnother}
            >
              Show me another place →
            </button>
          )}
        </div>
        <span className="machineOutcome">Internal policy: REJECT</span>
      </section>
      {evidence}
    </Screen>
  );
}

export function NoRepairStage({
  candidate,
  status,
  budget,
  busy,
  onAnother,
  onRefresh,
  evidence,
  headingRef,
}: {
  candidate: QlooEntity;
  status: string;
  budget: boolean;
  busy: boolean;
  onAnother: () => void;
  onRefresh: () => void;
  evidence: ReactNode;
  headingRef: Heading;
}) {
  const stale = status === "STALE";
  return (
    <Screen stage="noRepair">
      <section
        className="humanDecision"
        data-decision="REJECT"
        data-repair={status}
        aria-live="polite"
      >
        <ChosenPlace candidate={candidate} />
        <h1 ref={headingRef} tabIndex={-1}>
          {stale
            ? "Your saved rules changed."
            : budget
              ? "I can’t verify another option within your budget yet."
              : "I couldn’t verify another option yet."}
        </h1>
        <p className="stageLead">
          {stale
            ? "Refresh them, then check again."
            : budget
              ? "Your rule is still active. I won’t guess a price."
              : "Your rule has not been weakened. No automatic retry will run."}
        </p>
        <div className="stageActions">
          {stale ? (
            <button
              className="primaryAction"
              disabled={busy}
              onClick={onRefresh}
            >
              Refresh my saved rules
            </button>
          ) : (
            <button
              className="primaryAction"
              disabled={busy}
              onClick={onAnother}
            >
              Show me another place →
            </button>
          )}
        </div>
        <span className="machineOutcome">Internal policy: REJECT</span>
      </section>
      {evidence}
    </Screen>
  );
}

export function PauseStage({
  candidate,
  busy,
  onAgain,
  evidence,
  headingRef,
}: {
  candidate: QlooEntity | null;
  busy: boolean;
  onAgain: () => void;
  evidence: ReactNode;
  headingRef: Heading;
}) {
  return (
    <Screen stage="pause">
      <section
        className="humanDecision"
        data-decision="UNAVAILABLE"
        aria-live="polite"
      >
        {candidate && <ChosenPlace candidate={candidate} />}
        <h1 ref={headingRef} tabIndex={-1}>
          <Mark glyph="—" label="I don’t know enough yet" />
        </h1>
        <p className="stageLead">
          Missing taste evidence is not the same as disliking this.
        </p>
        <p className="stageSupport">
          Your concierge pauses. Nothing was guessed.
        </p>
        <div className="stageActions">
          <button className="quietAction" disabled={busy} onClick={onAgain}>
            Check again
          </button>
        </div>
        <span className="machineOutcome">Internal policy: UNAVAILABLE</span>
      </section>
      {evidence}
    </Screen>
  );
}

export function StageFooter() {
  return (
    <p className="stageFooter">
      <Link href="/arena">Receipts and mechanics: engineering view →</Link>
    </p>
  );
}
