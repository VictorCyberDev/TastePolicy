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
import { useConsumerAuthorization } from "./useConsumerAuthorization";
import {
  ClarifyPanel,
  DemoBoundaries,
  EvidencePanel,
} from "./ConsumerAuthorization";
import {
  AllowStage,
  AskStage,
  CheckingStage,
  ConfirmStage,
  DiscoverCard,
  HandoffStage,
  NoRepairStage,
  PauseStage,
  RejectStage,
  StageFooter,
  StageProgress,
  TasteStage,
  type Stage,
} from "./ConsumerStages";
import "./consumer-arena.css";

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

function money(currency: string, amount: number) {
  return currency === "USD" ? `$${amount}` : `${currency} ${amount}`;
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
    [checking, setChecking] = useState(""),
    [handoff, setHandoff] = useState(false),
    [notice, setNotice] = useState(""),
    [needsRefresh, setNeedsRefresh] = useState(false);
  const last = useRef(0);
  const inFlight = useRef(false);
  const swipeStart = useRef<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);

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
  const constraint = auth.state?.entries.find(
    (entry) => entry.signalId === auth.plan?.factor?.constraintId,
  )?.constraint;
  const hasBudget = Boolean(
    auth.state?.entries.some((entry) => entry.constraint?.kind === "MAX_PRICE"),
  );
  const replacement =
    auth.repair?.status === "REPAIR_AVAILABLE" &&
    auth.repair.verification?.action.candidate.id === candidate?.id;
  const repairBlocked = Boolean(
    auth.repair && auth.repair.status !== "REPAIR_AVAILABLE",
  );

  // One moment per screen. The stage is derived from the accepted authorization
  // state; the only UI-owned facts are "a request is running" and "handoff".
  const stage: Stage = checking
    ? "checking"
    : !resolutions.length
      ? "taste"
      : !candidate
        ? "confirm"
        : repairBlocked && evaluation
          ? "noRepair"
          : outcome === "ALLOW"
            ? handoff
              ? "handoff"
              : "allow"
            : outcome === "ASK"
              ? "ask"
              : outcome === "REJECT"
                ? "reject"
                : outcome === "UNAVAILABLE"
                  ? "pause"
                  : "discover";

  const askLead =
    auth.plan?.factor?.answerSchema === "MONEY_OR_UNKNOWN" &&
    constraint?.kind === "MAX_PRICE"
      ? `Your budget is ${money(constraint.currency, constraint.amount)}.`
      : "TastePolicy needs one explicit answer before your agent continues.";
  const rejectLead =
    (interaction?.finalDecision.basis ?? evaluation?.decision.basis) ===
    "USER_HARD_BLOCK"
      ? "You told TastePolicy not to choose this place."
      : "TastePolicy found a boundary your agent has to respect.";

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (busy && stage !== "checking") return;
    if (stage === "ask" && auth.plan?.status === "ACTIONABLE") return;
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, [
    stage,
    busy,
    candidate?.id,
    evaluation?.evaluationId,
    interaction?.interactionId,
    auth.plan?.status,
    auth.repair?.repairId,
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

  // `checkingTitle` puts the dedicated CHECKING stage on screen for exactly as
  // long as the real request runs; there is no artificial delay.
  async function run(
    label: string,
    operation: () => Promise<void>,
    checkingTitle?: string,
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNotice(checkingTitle ? "" : label);
    setNeedsRefresh(false);
    if (checkingTitle) setChecking(checkingTitle);
    try {
      await operation();
      setNotice("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Operation unavailable.";
      setNotice(message);
      setNeedsRefresh(message.startsWith("Your saved rules changed"));
    } finally {
      setChecking("");
      setBusy(false);
      inFlight.current = false;
    }
  }

  async function resolveTaste() {
    await run("Finding the exact things you meant…", async () => {
      setCandidates(null);
      setAlternative(null);
      setHandoff(false);
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
      setHandoff(false);
      auth.resetCandidate();
      setCandidateIndex(0);
    });
  }

  async function checkChoice() {
    if (!candidate) return;
    setHandoff(false);
    await run(
      "Checking what your agent is actually allowed to do…",
      async () => {
        await auth.check(candidate);
      },
      "TastePolicy is checking your boundaries…",
    );
  }

  function nextCandidate() {
    if (!candidates?.candidates.length) return;
    setCandidateIndex((index) => (index + 1) % candidates.candidates.length);
    setAlternative(null);
    setHandoff(false);

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

  const evidence = (
    <EvidencePanel
      auth={auth}
      evaluation={evaluation}
      interaction={interaction}
      cultural={cultural}
    />
  );
  function backToChoice() {
    // Navigation only: drops the displayed decision, never a saved rule. A
    // verified replacement keeps its repair context so it is still checked
    // through the same fresh evaluation.
    setHandoff(false);
    setNotice("");
    if (replacement) auth.clearEvaluation();
    else auth.resetCandidate();
  }
  const runPlain = (
    label: string,
    operation: () => Promise<void>,
    checkingTitle?: string,
  ) => run(label, operation, checkingTitle);

  return (
    <main className="consumerArena">
      <header className="consumerTop">
        <Link href="/">TastePolicy</Link>
        <span>CONSUMER ARENA · WG-B PROTOTYPE</span>
        <Link href="/arena">Engineering view</Link>
      </header>
      <StageProgress stage={stage} />

      {stage === "taste" && (
        <TasteStage
          signals={CANONICAL_SIGNALS.map((signal) => signal.query)}
          busy={busy}
          onStart={() => void resolveTaste()}
          headingRef={heading}
        />
      )}

      {stage === "confirm" && (
        <ConfirmStage
          headingRef={heading}
          items={CANONICAL_SIGNALS.map((signal, index) => {
            const entity = selectedEntity(resolutions[index], selected[index]);
            return {
              query: signal.query,
              name: entity ? entity.name : "Choose the exact match",
              detail: entity
                ? `${entity.type}${entity.releaseYear ? ` · ${entity.releaseYear}` : ""}`
                : "Needs your review",
            };
          })}
          identities={resolutions.map((result, index) => (
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
          reviewed={reviewed}
          onReviewed={setReviewed}
          disabled={busy || !reviewed || selected.some((value) => !value)}
          onDiscover={() => void discoverPlaces()}
        />
      )}

      {stage === "discover" && candidate && (
        <DiscoverCard
          key={candidate.id}
          candidate={candidate}
          basedOn={reviewedEntities.map((entity) => entity.name)}
          proposal={Boolean(replacement)}
          busy={busy}
          onNext={nextCandidate}
          onCheck={() => void checkChoice()}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          headingRef={heading}
        >
          <DemoBoundaries
            auth={auth}
            candidate={candidate}
            busy={busy}
            run={run}
            runPlain={runPlain}
            locked={Boolean(replacement)}
          />
        </DiscoverCard>
      )}

      {stage === "checking" && (
        <CheckingStage title={checking} headingRef={heading} />
      )}

      {stage === "allow" && candidate && (
        <AllowStage
          candidate={candidate}
          exclusionKept={Boolean(replacement)}
          onContinue={() => setHandoff(true)}
          evidence={evidence}
          headingRef={heading}
        />
      )}

      {stage === "handoff" && candidate && (
        <HandoffStage
          candidate={candidate}
          onBack={nextCandidate}
          headingRef={heading}
        />
      )}

      {stage === "ask" && candidate && evaluation && (
        <AskStage
          candidate={candidate}
          lead={askLead}
          clarify={
            <ClarifyPanel
              auth={auth}
              evaluation={evaluation}
              interaction={interaction}
              busy={busy}
              run={run}
            />
          }
          evidence={evidence}
          headingRef={heading}
        />
      )}

      {stage === "reject" && candidate && (
        <RejectStage
          candidate={candidate}
          lead={rejectLead}
          canRepair={evaluation?.decision.outcome === "REJECT" && !auth.repair}
          busy={busy}
          onRepair={() =>
            void run(
              "Looking for one alternative that keeps your rule…",
              auth.findAlternative,
              "Looking for something that respects that…",
            )
          }
          onAnother={nextCandidate}
          evidence={evidence}
          headingRef={heading}
        />
      )}

      {stage === "noRepair" && candidate && auth.repair && (
        <NoRepairStage
          candidate={candidate}
          status={auth.repair.status}
          budget={hasBudget}
          busy={busy}
          onAnother={nextCandidate}
          onRefresh={() => {
            auth.clearEvaluation();
            void run("Reading your saved rules…", auth.refresh);
          }}
          evidence={evidence}
          headingRef={heading}
        />
      )}

      {stage === "pause" && (
        <PauseStage
          candidate={candidate}
          busy={busy}
          onAgain={() => void checkChoice()}
          evidence={evidence}
          headingRef={heading}
        />
      )}

      {(["ask", "allow", "reject", "pause", "noRepair"] as Stage[]).includes(
        stage,
      ) && (
        <p className="stageBack">
          <button
            className="quietAction"
            disabled={busy}
            onClick={backToChoice}
          >
            ← Back to the choice
          </button>
        </p>
      )}

      {notice && (
        <div className="consumerNotice" role="status">
          <p>{notice}</p>
          {needsRefresh && auth.state && (
            <button
              disabled={busy}
              onClick={() => {
                auth.clearEvaluation();
                void run("Reading your saved rules…", auth.refresh);
              }}
            >
              Refresh my saved rules
            </button>
          )}
        </div>
      )}

      <StageFooter />
    </main>
  );
}
