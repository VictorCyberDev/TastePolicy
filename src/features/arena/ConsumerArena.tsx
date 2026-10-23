"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CANONICAL_SIGNALS } from "@/features/demo/profile";
import type {
  EntityResolution,
  InferenceResult,
  ProviderResult,
  QlooEntity,
} from "@/types/domain";
import { boundedContinuation } from "@/lib/agent/continuation";
import { useConsumerAuthorization } from "./useConsumerAuthorization";
import ConsumerAuthorization from "./ConsumerAuthorization";
import "./consumer-arena.css";

const HUMAN_DECISION = {
  ALLOW: {
    title: "This fits",
    body: "Your concierge can recommend this. Booking or payment still needs your approval.",
  },
  ASK: {
    title: "One thing first…",
    body: "TastePolicy needs one explicit answer before the agent can continue.",
  },
  UNAVAILABLE: {
    title: "I don’t know enough yet",
    body: "Missing taste evidence is not the same as disliking this. Your concierge must pause without guessing.",
  },
  REJECT: {
    title: "Not this one",
    body: "TastePolicy found a boundary the agent must respect. It can offer another option instead.",
  },
} as const;

const NEXT_STEP_COPY: Record<string, string> = {
  recommend: "recommend this option",
  add_to_draft: "add it to a draft",
  request_clarification: "ask before continuing",
  do_not_proceed: "do not proceed",
  offer_repair: "offer a verifiable alternative",
  do_not_assume_negative_preference: "pause without assuming dislike",
};

function selectedEntity(
  result: ProviderResult<EntityResolution> | undefined,
  id: string,
) {
  return result?.status === "available"
    ? result.data.matches.find((match) => match.id === id)
    : undefined;
}

function defaultIdentity(
  result: ProviderResult<EntityResolution>,
  query: string,
  expectedType: QlooEntity["type"],
) {
  if (result.status !== "available") return "";
  const exact = result.data.matches.find(
    (match) =>
      match.type === expectedType &&
      match.name.trim().toLocaleLowerCase() ===
        query.trim().toLocaleLowerCase(),
  );
  if (exact) return exact.id;
  return result.data.state === "single"
    ? (result.data.matches[0]?.id ?? "")
    : "";
}

export default function ConsumerArena() {
  const [resolutions, setResolutions] = useState<
      ProviderResult<EntityResolution>[]
    >([]),
    [selected, setSelected] = useState<string[]>(Array(5).fill("")),
    [reviewed, setReviewed] = useState(false),
    [candidates, setCandidates] = useState<InferenceResult | null>(null),
    [candidateIndex, setCandidateIndex] = useState(0),
    [alternative, setAlternative] = useState<QlooEntity | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const last = useRef(0);
  const inFlight = useRef(false);
  const swipeStart = useRef<number | null>(null);
  const outcomeHeading = useRef<HTMLHeadingElement>(null);
  const candidateHeading = useRef<HTMLHeadingElement>(null);

  const candidate =
    alternative ?? candidates?.candidates[candidateIndex]?.entity ?? null;
  const reviewedEntities = selected
    .map((id, index) => selectedEntity(resolutions[index], id))
    .filter((entity): entity is QlooEntity => Boolean(entity));

  const auth = useConsumerAuthorization(call, reviewedEntities, (next) => {
    setAlternative(next);
  });
  const evaluation =
    auth.evaluation?.action.candidate.id === candidate?.id
      ? auth.evaluation
      : null;
  const interaction = evaluation ? auth.interaction : null;
  const cultural =
    evaluation?.cultural.status === "available"
      ? evaluation.cultural.data
      : null;
  const outcome = auth.unavailable
    ? "UNAVAILABLE"
    : (interaction?.finalDecision.outcome ?? evaluation?.decision.outcome);
  const decision = outcome ? HUMAN_DECISION[outcome] : null;
  const continuation = outcome ? boundedContinuation(outcome) : null;
  const constraint = auth.state?.entries.find(
    (entry) => entry.signalId === auth.plan?.factor?.constraintId,
  )?.constraint;
  const humanReason =
    outcome === "ASK" &&
    auth.plan?.factor?.answerSchema === "MONEY_OR_UNKNOWN" &&
    constraint?.kind === "MAX_PRICE"
      ? `Your budget for this choice is ${constraint.currency} ${constraint.amount}, but this place’s price is not known in that currency yet.`
      : outcome === "REJECT" &&
          (interaction?.finalDecision.basis ?? evaluation?.decision.basis) ===
            "USER_HARD_BLOCK"
        ? "You told TastePolicy not to choose this place. Your agent has to respect that."
        : interaction && outcome === "ALLOW"
          ? "Your concierge can recommend this within the boundary you gave. Your explicit answer applies only to this choice."
          : decision?.body;

  useEffect(() => {
    if (busy || auth.plan?.status === "ACTIONABLE") return;
    if (outcome) outcomeHeading.current?.focus();
    else if (alternative) candidateHeading.current?.focus();
  }, [
    busy,
    outcome,
    evaluation?.evaluationId,
    interaction?.interactionId,
    auth.plan?.status,
    alternative,
  ]);

  async function call<T>(path: string, body: unknown): Promise<T> {
    const delay = 1100 - (Date.now() - last.current);
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok || data.status !== "available") {
        const code = data.reason ?? data.code;
        throw Error(
          code === "not_configured"
            ? "Live Qloo is not configured. No synthetic fallback is used."
            : code === "persistence_not_configured"
              ? "Saved rules are not available in this environment. No temporary substitute was used."
              : code === "STATE_VERSION_CONFLICT"
                ? "Your saved rules changed. Refresh them and explicitly check this choice again."
                : code === "SESSION_EXPIRED"
                  ? "This temporary demo profile has expired. Open the engineering view to start a new one."
                  : "This operation is unavailable. No answer was guessed, no evidence was invented and no automatic retry was made.",
        );
      }
      return data.data as T;
    } finally {
      last.current = Date.now();
    }
  }

  async function run(label: string, operation: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNotice(label);
    try {
      await operation();
      setNotice("");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Operation unavailable.",
      );
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  async function resolveTaste() {
    await run("Finding the exact things you meant…", async () => {
      setCandidates(null);
      setAlternative(null);
      auth.resetCandidate();

      setReviewed(false);
      const found = await call<ProviderResult<EntityResolution>[]>(
        "/api/demo/resolve",
        { signals: CANONICAL_SIGNALS },
      );
      setResolutions(found);
      setSelected(
        found.map((result, index) =>
          defaultIdentity(
            result,
            CANONICAL_SIGNALS[index].query,
            CANONICAL_SIGNALS[index].expectedType,
          ),
        ),
      );
    });
  }

  async function discoverPlaces() {
    await run("Finding a place through your taste…", async () => {
      const found = await call<InferenceResult>("/api/demo/discover", {
        signalIds: selected,
        targetType: "place",
      });
      setCandidates(found);
      setAlternative(null);
      auth.resetCandidate();
      setCandidateIndex(0);
    });
  }

  async function checkChoice() {
    if (!candidate) return;
    await run(
      "Checking what your agent is actually allowed to do…",
      async () => {
        await auth.check(candidate);
      },
    );
  }

  function nextCandidate() {
    if (!candidates?.candidates.length) return;
    setCandidateIndex((index) => (index + 1) % candidates.candidates.length);
    setAlternative(null);

    auth.resetCandidate();
    setNotice("");
  }

  function onPointerDown(event: React.PointerEvent<HTMLElement>) {
    swipeStart.current = event.clientX;
  }

  function onPointerUp(event: React.PointerEvent<HTMLElement>) {
    if (swipeStart.current === null || busy || !candidate) return;
    const distance = event.clientX - swipeStart.current;
    swipeStart.current = null;
    if (distance <= -70) nextCandidate();
    if (distance >= 70) void checkChoice();
  }

  return (
    <main className="consumerArena">
      <header className="consumerTop">
        <Link href="/">TastePolicy</Link>
        <span>CONSUMER ARENA · WG-B PROTOTYPE</span>
        <Link href="/arena">Engineering view</Link>
      </header>

      <section className="consumerHero">
        <p className="consumerEyebrow">
          Preference authority, without the policy jargon
        </p>
        <h1>
          Your AI concierge found something for you. Should it use your taste to
          recommend it?
        </h1>
        <p>
          Qloo helps the agent understand cultural fit. TastePolicy decides what
          the agent may actually do with that understanding.
        </p>
      </section>

      {!resolutions.length && (
        <section className="tasteSetup">
          <p className="consumerEyebrow">Your taste lens</p>
          <h2>Start with five things you already chose yourself.</h2>
          <div className="tasteChips" aria-label="Taste signals">
            {CANONICAL_SIGNALS.map((signal) => (
              <span key={signal.query}>{signal.query}</span>
            ))}
          </div>
          <button
            className="primaryAction"
            disabled={busy}
            onClick={() => void resolveTaste()}
          >
            Use my reviewed taste
          </button>
        </section>
      )}

      {resolutions.length > 0 && !candidates && (
        <section className="tasteSetup">
          <p className="consumerEyebrow">Quick identity check</p>
          <h2>Are these the five things you meant?</h2>
          <div className="resolvedGrid">
            {CANONICAL_SIGNALS.map((signal, index) => {
              const entity = selectedEntity(
                resolutions[index],
                selected[index],
              );
              return (
                <article key={signal.query} className="resolvedItem">
                  <span>{signal.query}</span>
                  <strong>
                    {entity ? entity.name : "Choose the exact match"}
                  </strong>
                  <small>
                    {entity
                      ? `${entity.type}${entity.releaseYear ? ` · ${entity.releaseYear}` : ""}`
                      : "Needs your review"}
                  </small>
                </article>
              );
            })}
          </div>

          <details className="identityDetails">
            <summary>
              Something looks wrong? Review the exact identities
            </summary>
            {resolutions.map((result, index) => (
              <label key={CANONICAL_SIGNALS[index].query}>
                {CANONICAL_SIGNALS[index].query}
                <select
                  aria-label={`Identity for ${CANONICAL_SIGNALS[index].query}`}
                  value={selected[index]}
                  onChange={(event) => {
                    setSelected(
                      selected.map((value, itemIndex) =>
                        itemIndex === index ? event.target.value : value,
                      ),
                    );
                    setReviewed(false);
                  }}
                >
                  <option value="">Choose the exact match</option>
                  {result.status === "available"
                    ? result.data.matches.map((match) => (
                        <option key={match.id} value={match.id}>
                          {match.name} · {match.type}
                          {match.releaseYear ? ` · ${match.releaseYear}` : ""}
                        </option>
                      ))
                    : null}
                </select>
              </label>
            ))}
          </details>

          <label className="confirmTaste">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
            />
            Yes — these are my five explicit taste signals.
          </label>
          <p>
            Checking a choice keeps these five preferences in a temporary demo
            profile and respects its saved rules.
          </p>
          <button
            className="primaryAction"
            disabled={busy || !reviewed || selected.some((value) => !value)}
            onClick={() => void discoverPlaces()}
          >
            Find a place through my taste
          </button>
        </section>
      )}

      {candidate && (
        <section className="choiceStage" aria-label="Agent recommendation">
          <div
            className="placeCard"
            data-portrait={candidateIndex % 6}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
          >
            <div
              className="placePortrait"
              aria-label={`Visual mood portrait for ${candidate.name}`}
            >
              <span className="portraitGlow" />
              <span className="portraitHorizon" />
              <span className="portraitFrame" />
              <div className="portraitCopy">
                <p>Your version of</p>
                <h2>{candidate.name}</h2>
                <span>Visual mood artwork — presentation only.</span>
              </div>
            </div>

            <div className="placeContent">
              <div className="placeMeta">
                <span>{candidate.type}</span>
                {candidate.address && <span>{candidate.address}</span>}
              </div>
              <h3 ref={candidateHeading} tabIndex={-1}>
                {candidate.name}
              </h3>
              <p>
                Your concierge wants to recommend this. TastePolicy checks the
                boundary before the agent continues.
              </p>

              <div
                className="tasteChips compact"
                aria-label="Based on your taste"
              >
                {reviewedEntities.map((entity) => (
                  <span key={entity.id}>{entity.name}</span>
                ))}
              </div>

              {decision ? (
                <section
                  className="humanDecision"
                  data-decision={outcome}
                  aria-live="polite"
                >
                  <p className="consumerEyebrow">TastePolicy says</p>
                  <h4 ref={outcomeHeading} tabIndex={-1}>
                    <span aria-hidden="true">
                      {outcome === "ALLOW"
                        ? "✓ "
                        : outcome === "ASK"
                          ? "? "
                          : outcome === "REJECT"
                            ? "× "
                            : "— "}
                    </span>
                    {decision.title}
                  </h4>
                  <p>{humanReason}</p>
                  <p className="consumerNext">
                    <strong>What your concierge may do next:</strong>{" "}
                    {continuation!.permitted
                      .map((action) => NEXT_STEP_COPY[action])
                      .join(" · ")}
                  </p>
                  <p>
                    Booking, payment, purchase and other execution still require
                    separate authority.
                  </p>
                  {interaction && (
                    <p className="consumerCaptured">
                      Explicit answer for this choice · Original decision:{" "}
                      {interaction.originalEvaluation.decision.outcome} · Final
                      interaction decision: {interaction.finalDecision.outcome}
                    </p>
                  )}
                  {outcome === "UNAVAILABLE" && (
                    <p>
                      No cultural evidence or Cultural Receipt was fabricated.
                      No automatic retry.
                    </p>
                  )}
                  <span className="machineOutcome">
                    Internal policy: {outcome}
                  </span>
                </section>
              ) : (
                <p className="swipeHint">
                  Swipe right to check this choice · Swipe left for another
                </p>
              )}

              <div className="cardActions">
                <button
                  disabled={busy}
                  onClick={nextCandidate}
                  aria-label="Show another place"
                >
                  ← Another one
                </button>
                <details>
                  <summary>Why this?</summary>
                  {cultural ? (
                    <div className="whyPanel">
                      <p>
                        <strong>
                          {interaction ? "CAPTURED QLOO EVIDENCE" : "LIVE QLOO"}
                        </strong>{" "}
                        candidate-specific cultural evidence
                        {interaction
                          ? " — reused with your explicit interaction answer; no new Qloo request."
                          : "."}
                      </p>
                      <p>
                        Affinity {cultural.alignmentScore.toFixed(4)} ·{" "}
                        {cultural.qlooEvidence.scale}. This is not confidence or
                        preference probability.
                      </p>
                      {cultural.explainability.status !== "unavailable" && (
                        <ul>
                          {cultural.explainability.contributions
                            .slice(0, 3)
                            .map((item) => (
                              <li key={item.signalId}>
                                {cultural.inputSignals.find(
                                  (signal) => signal.id === item.signalId,
                                )?.name ?? "Reviewed signal"}
                                : {item.score.toFixed(3)}
                              </li>
                            ))}
                        </ul>
                      )}
                      <p className="technicalNote">
                        Provider: Qloo ·{" "}
                        {cultural.qlooEvidence.provenance.endpoint} · receipt{" "}
                        {cultural.receiptId}
                      </p>
                    </div>
                  ) : (
                    <p>
                      Check this choice to capture candidate-specific Qloo
                      evidence and the TastePolicy decision.
                    </p>
                  )}
                </details>
                <button
                  className="primaryAction"
                  disabled={busy}
                  onClick={() => void checkChoice()}
                  aria-label="Check this choice with TastePolicy"
                >
                  {alternative && !evaluation
                    ? "Check this alternative →"
                    : "Check this choice →"}
                </button>
              </div>
              <ConsumerAuthorization
                key={candidate.id}
                auth={auth}
                candidate={candidate}
                busy={busy}
                run={run}
                clearBaseline={auth.clearEvaluation}
              />
            </div>
          </div>

          <p className="gestureBoundary">
            Swipes express what you want to inspect or skip. They do not grant
            booking, payment, purchase, private-data, account, legal, or
            execution authority.
          </p>
        </section>
      )}

      {notice && (
        <p className="consumerNotice" role="status">
          {notice}
        </p>
      )}

      <section className="consumerExplainer">
        <article>
          <strong>Qloo</strong>
          <span>What culturally fits?</span>
        </article>
        <span aria-hidden="true">→</span>
        <article>
          <strong>TastePolicy</strong>
          <span>What may the agent do with that fit?</span>
        </article>
        <span aria-hidden="true">→</span>
        <article>
          <strong>Bounded action</strong>
          <span>Recommend, ask, stop, or admit missing evidence.</span>
        </article>
      </section>

      <footer className="consumerFooter">
        <p>
          Want the receipts, state versions, fault rehearsal and repair
          mechanics?
        </p>
        <Link href="/arena">Open the full engineering Decision Arena →</Link>
      </footer>
    </main>
  );
}
