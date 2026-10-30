"use client";

import { useCallback, useRef, useState } from "react";
import type {
  EntityResolution,
  InferenceResult,
  ProviderResult,
  QlooEntity,
} from "@/types/domain";
import type {
  MutationResult,
  StateEvaluation,
  StateVersion,
} from "@/lib/state/types";
import type { CandidateFact, FactValue } from "@/lib/requirements/types";
import type { SubjectiveAction } from "@/lib/policy/types";
import type { OpenPlaceContext as PlaceContext } from "@/server/open/context";
import { DEFAULT_POLICY } from "@/lib/policy/types";
import type { TargetType } from "@/types/domain";
import type { Persona } from "./personas";

// A signed-in person's own Passport. When present, nothing here uses the
// anonymous demo state: checks run against their saved taste and ceiling.
export interface PersonalLink {
  call: <T>(
    op: string,
    body?: Record<string, unknown>,
    mutation?: boolean,
  ) => Promise<T>;
  passportRef: string;
  stateVersion: number;
  anchors: QlooEntity[];
}

export type Step = "meet" | "anchors" | "discover";

function defaultIdentity(
  result: ProviderResult<EntityResolution>,
  query: string,
  expectedType: QlooEntity["type"],
) {
  if (result.status !== "available") return "";
  const exact = result.data.matches.find(
    (m) =>
      m.type === expectedType &&
      m.name.trim().toLocaleLowerCase() === query.trim().toLocaleLowerCase(),
  );
  if (exact) return exact.id;
  return result.data.state === "single"
    ? (result.data.matches[0]?.id ?? "")
    : "";
}

const MESSAGES: Record<string, string> = {
  not_configured:
    "Live Qloo is not configured here. No synthetic fallback is used.",
  persistence_not_configured:
    "Saved rules are not available in this environment. No temporary substitute was used.",
  STATE_VERSION_CONFLICT:
    "Your saved rules changed. Start again to check this choice with the latest rules.",
  SESSION_EXPIRED:
    "This temporary demo profile has expired. Start again to begin a new one.",
};

// Orchestration only. Every decision comes from the existing server services:
// Qloo for taste, /api/places for place facts, /api/state for the evaluator.
export function useAssistedChoice(persona: Persona, personal?: PersonalLink) {
  const [step, setStep] = useState<Step>("meet");
  const [resolutions, setResolutions] = useState<
    ProviderResult<EntityResolution>[]
  >([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [candidates, setCandidates] = useState<InferenceResult | null>(null);
  const [index, setIndex] = useState(0);
  const [places, setPlaces] = useState<
    Record<string, PlaceContext | "loading">
  >({});
  const [answers, setAnswers] = useState<Record<string, CandidateFact[]>>({});
  const [ceiling, setCeiling] = useState(persona.ceiling);
  const [evaluation, setEvaluation] = useState<StateEvaluation | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const last = useRef(0);
  const inFlight = useRef(false);
  const state = useRef<StateVersion | null>(null);
  const keys = useRef(new Map<string, string>());

  const anchors = personal
    ? personal.anchors
    : selected
        .map((id, i) => {
          const r = resolutions[i];
          return r?.status === "available"
            ? r.data.matches.find((m) => m.id === id)
            : undefined;
        })
        .filter((e): e is QlooEntity => Boolean(e));
  const candidate = candidates?.candidates[index]?.entity ?? null;
  const evidence = candidates?.candidates[index] ?? null;

  const call = useCallback(async function call<T>(path: string, body: unknown) {
    const delay = 1100 - (Date.now() - last.current);
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
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
          MESSAGES[code] ??
            "This operation is unavailable. Nothing was guessed and no evidence was invented.",
        );
      }
      return data.data as T;
    } finally {
      last.current = Date.now();
    }
  }, []);

  async function run(label: string, op: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(label);
    setNotice("");
    try {
      await op();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Operation unavailable.");
    } finally {
      setBusy("");
      inFlight.current = false;
    }
  }

  async function ensureState(): Promise<StateVersion> {
    if (state.current) return state.current;
    await call("/api/state/session", {});
    let s = (await call<{ state: StateVersion }>("/api/state/read", {})).state;
    if (!s.entries.length && s.stateVersion === 0) {
      const fingerprint = "init" + anchors.map((a) => a.id).join();
      if (!keys.current.has(fingerprint))
        keys.current.set(fingerprint, crypto.randomUUID());
      s = (
        await call<MutationResult>("/api/state/mutate", {
          expectedStateVersion: s.stateVersion,
          idempotencyKey: keys.current.get(fingerprint),
          payload: { kind: "INITIALIZE", signals: anchors },
        })
      ).state;
    }
    const stored = s.entries
      .filter((e) => e.kind === "EXPLICIT_LIKE")
      .map((e) => e.entity!.id)
      .sort();
    if (
      JSON.stringify(stored) !== JSON.stringify(anchors.map((a) => a.id).sort())
    )
      throw Error(
        "Your saved taste is different from what you just reviewed. Nothing was changed. Start again to review it.",
      );
    state.current = s;
    return s;
  }

  const begin = () =>
    run("Finding the exact things you meant…", async () => {
      setStep("anchors");
      setReviewed(false);
      const found = await call<ProviderResult<EntityResolution>[]>(
        "/api/demo/resolve",
        {
          signals: persona.anchors.map(({ query, expectedType }) => ({
            query,
            expectedType,
          })),
        },
      );
      setResolutions(found);
      setSelected(
        found.map((r, i) =>
          defaultIdentity(
            r,
            persona.anchors[i].query,
            persona.anchors[i].expectedType,
          ),
        ),
      );
    }).then(() => undefined);

  const loadPlace = useCallback(
    async (entity: QlooEntity) => {
      setPlaces((p) => (p[entity.id] ? p : { ...p, [entity.id]: "loading" }));
      try {
        const ctx = await call<PlaceContext>("/api/places/context", {
          name: entity.name,
          ...(entity.address ? { address: entity.address } : {}),
          ...(persona.origin ? { origin: persona.origin } : {}),
        });
        setPlaces((p) => ({ ...p, [entity.id]: ctx }));
      } catch {
        // Place context is enrichment. Failing leaves facts unknown.
        setPlaces((p) => {
          const { [entity.id]: _drop, ...rest } = p;
          void _drop;
          return rest;
        });
      }
    },
    [call, persona.origin],
  );

  const discover = (kind: TargetType = "place") =>
    run("Asking Qloo where this taste lives…", async () => {
      const found = await call<InferenceResult>("/api/demo/discover", {
        signalIds: personal ? personal.anchors.map((a) => a.id) : selected,
        targetType: kind,
      });
      state.current = null;
      setCandidates(found);
      setIndex(0);
      setEvaluation(null);
      setStep("discover");
      const first = found.candidates[0]?.entity;
      if (first) void loadPlace(first);
    }).then(() => undefined);

  const show = (next: number) => {
    if (!candidates) return;
    const i =
      (next + candidates.candidates.length) % candidates.candidates.length;
    setIndex(i);
    setEvaluation(null);
    setNotice("");
    void loadPlace(candidates.candidates[i].entity);
  };

  function factsFor(entity: QlooEntity, extra: CandidateFact[] = []) {
    const ctx = places[entity.id];
    const provider = ctx && ctx !== "loading" ? ctx.facts : [];
    return [...provider, ...(answers[entity.id] ?? []), ...extra];
  }

  const check = (
    requested: SubjectiveAction = persona.ceiling === "SUGGEST"
      ? "SUGGEST"
      : "SHORTLIST",
    opts: { extra?: CandidateFact[]; ceilingOverride?: SubjectiveAction } = {},
  ) =>
    candidate
      ? run("TastePolicy is checking the boundary…", async () => {
          if (personal) {
            const next = await personal.call<{ evaluation: StateEvaluation }>(
              "choose",
              {
                passportRef: personal.passportRef,
                requestedAction: requested,
                proposal: {
                  agentId: "Concierge",
                  expectedStateVersion: personal.stateVersion,
                  candidate,
                  context: {
                    key: persona.contextKey,
                    domain: candidate.type,
                    requirements: persona.requirements,
                    facts: factsFor(candidate, opts.extra),
                  },
                },
              },
              true,
            );
            setEvaluation(next.evaluation);
            return;
          }
          const s = await ensureState();
          const next = await call<StateEvaluation>("/api/state/evaluate", {
            agentId: "Concierge",
            expectedStateVersion: s.stateVersion,
            candidate,
            context: {
              key: persona.contextKey,
              domain: "place",
              requirements: persona.requirements,
              facts: factsFor(candidate, opts.extra),
            },
            sessionAuthority: {
              requestedAction: requested,
              ceiling: opts.ceilingOverride ?? ceiling,
            },
          });
          setEvaluation(next);
        })
      : Promise.resolve();

  // The person answers a missing fact. It is recorded as their word, never as
  // a provider's, and the same evaluator then re-checks the same choice.
  const answer = (key: string, value: FactValue) => {
    if (!candidate) return Promise.resolve();
    const fact: CandidateFact = {
      key,
      value,
      state: "known",
      evidence: "USER_CONFIRMED",
      source: "your answer",
      sourceType: "USER",
      observedAt: new Date().toISOString(),
    };
    setAnswers((a) => ({
      ...a,
      [candidate.id]: [
        ...(a[candidate.id] ?? []).filter((f) => f.key !== key),
        fact,
      ],
    }));
    return check("SHORTLIST", { extra: [fact] });
  };

  // For a signed-in person the ceiling is their saved rule, so widening it is
  // a real, recorded change (and may ask them to sign in again first).
  const widen = async (to: SubjectiveAction) => {
    if (personal) {
      await run("Saving your new limit…", async () => {
        const cur = await personal.call<{
          active: {
            version: number;
            document: typeof DEFAULT_POLICY;
          } | null;
        }>("policy-get", { passportRef: personal.passportRef });
        const doc = cur.active?.document ?? DEFAULT_POLICY;
        await personal.call(
          "policy-publish",
          {
            passportRef: personal.passportRef,
            expectedVersion: cur.active?.version ?? 0,
            document: {
              ...doc,
              actions: {
                byDomain: {},
                byAgent: {},
                ...doc.actions,
                default: to,
              },
            },
          },
          true,
        );
        setCeiling(to);
      });
      return check(to);
    }
    setCeiling(to);
    return check(to, { ceilingOverride: to });
  };

  const restart = () => {
    state.current = null;
    setStep("meet");
    setCandidates(null);
    setEvaluation(null);
    setAnswers({});
    setCeiling(persona.ceiling);
    setNotice("");
  };

  return {
    step,
    resolutions,
    selected,
    setSelected,
    reviewed,
    setReviewed,
    anchors,
    candidates,
    candidate,
    evidence,
    index,
    places,
    answers,
    ceiling,
    evaluation,
    busy,
    notice,
    begin,
    discover,
    show,
    check,
    answer,
    widen,
    restart,
    factsFor,
    clearEvaluation: () => setEvaluation(null),
  };
}
