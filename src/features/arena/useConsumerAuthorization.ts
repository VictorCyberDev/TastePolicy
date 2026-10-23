"use client";

import { useRef, useState } from "react";
import type { QlooEntity } from "@/types/domain";
import type {
  MutationRequest,
  MutationResult,
  StateEvaluation,
  StateVersion,
} from "@/lib/state/types";
import type {
  Answer,
  ClarificationPlan,
  InteractiveAuthorization,
  RepairResult,
} from "@/lib/interactive/types";

export type ConsumerCall = <T>(path: string, body: unknown) => Promise<T>;

// Presentation orchestration only: decisions always come from existing services.
export function useConsumerAuthorization(
  call: ConsumerCall,
  signals: QlooEntity[],
  onAlternative: (candidate: QlooEntity) => void,
) {
  const [state, setState] = useState<StateVersion | null>(null);
  const [evaluation, setEvaluation] = useState<StateEvaluation | null>(null);
  const [interaction, setInteraction] =
    useState<InteractiveAuthorization | null>(null);
  const [plan, setPlan] = useState<ClarificationPlan | null>(null);
  const [repair, setRepair] = useState<RepairResult | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const keys = useRef(new Map<string, string>());

  async function write<T>(
    path: string,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const fingerprint = path + JSON.stringify(payload);
    if (!keys.current.has(fingerprint))
      keys.current.set(fingerprint, crypto.randomUUID());
    return call<T>(path, {
      ...payload,
      idempotencyKey: keys.current.get(fingerprint),
    });
  }
  function clearEvaluation() {
    setEvaluation(null);
    setInteraction(null);
    setPlan(null);
    setUnavailable(false);
  }
  function resetCandidate() {
    clearEvaluation();
    setRepair(null);
  }
  function verifyAnchors(current: StateVersion) {
    const stored = current.entries
      .filter((e) => e.kind === "EXPLICIT_LIKE")
      .map((e) => e.entity!.id)
      .sort();
    const reviewed = signals.map((e) => e.id).sort();
    if (
      signals.length !== 5 ||
      new Set(reviewed).size !== 5 ||
      JSON.stringify(stored) !== JSON.stringify(reviewed)
    )
      throw Error(
        "Your saved preferences are different. They were not changed or replaced. Open the engineering view to review this demo profile.",
      );
  }
  async function ensureState(): Promise<StateVersion> {
    if (state) return state;
    await call("/api/state/session", {});
    const current = (await call<{ state: StateVersion }>("/api/state/read", {}))
      .state;
    let next = current;
    if (!current.entries.length && current.stateVersion === 0) {
      next = (
        await write<MutationResult>("/api/state/mutate", {
          expectedStateVersion: current.stateVersion,
          payload: { kind: "INITIALIZE", signals },
        })
      ).state;
    }
    verifyAnchors(next);
    setState(next);
    return next;
  }
  async function refresh() {
    resetCandidate();
    const current = (await call<{ state: StateVersion }>("/api/state/read", {}))
      .state;
    verifyAnchors(current);
    setState(current);
  }
  async function question(
    e: StateEvaluation,
    parent?: InteractiveAuthorization,
  ) {
    const p = await call<ClarificationPlan>("/api/state/interactive/plan", {
      evaluationId: e.evaluationId,
      ...(parent ? { parentClarificationId: parent.interactionId } : {}),
    });
    setPlan(p);
  }
  async function evaluate(
    candidate: QlooEntity,
    current: StateVersion,
    verified?: StateEvaluation,
  ) {
    clearEvaluation();
    let e: StateEvaluation;
    try {
      e = await call<StateEvaluation>("/api/state/evaluate", {
        agentId: verified?.agentId ?? "Arena-Concierge",
        expectedStateVersion: verified?.stateVersion ?? current.stateVersion,
        candidate: verified?.action.candidate ?? candidate,
        context: verified?.context ?? { key: "arena_dinner", domain: "place" },
      });
      setEvaluation(e);
    } catch (error) {
      setUnavailable(true);
      throw error;
    }
    // Planning is captured-only. A plan failure must not erase a genuine ASK.
    if (e.decision.outcome === "ASK") await question(e);
    return e;
  }
  async function check(candidate: QlooEntity) {
    const current = await ensureState();
    const verified =
      repair?.status === "REPAIR_AVAILABLE" &&
      repair.verification?.action.candidate.id === candidate.id
        ? repair.verification
        : undefined;
    return evaluate(candidate, current, verified);
  }
  async function rule(
    candidate: QlooEntity,
    payload: MutationRequest["payload"],
  ) {
    resetCandidate();
    const current = await ensureState();
    if (payload.kind === "FEEDBACK") {
      const f = payload.feedback;
      const alreadySaved = current.entries.some((entry) =>
        f.category === "SPECIFIC_DISLIKE"
          ? entry.constraint?.kind === "EXCLUDE_CANDIDATE" &&
            entry.candidateId === candidate.id
          : f.category === "TOO_EXPENSIVE" &&
            entry.constraint?.kind === "MAX_PRICE" &&
            entry.contextKey === f.contextKey &&
            entry.constraint.amount === f.maxPrice?.amount &&
            entry.constraint.currency === f.maxPrice?.currency,
      );
      if (alreadySaved) {
        await evaluate(candidate, current);
        return;
      }
    }
    const next = (
      await write<MutationResult>("/api/state/mutate", {
        expectedStateVersion: current.stateVersion,
        payload,
      })
    ).state;
    setState(next);
    await evaluate(candidate, next);
  }
  async function budget(candidate: QlooEntity) {
    return rule(candidate, {
      kind: "FEEDBACK",
      feedback: {
        category: "TOO_EXPENSIVE",
        scope: "CONTEXT",
        persistence: "CONTEXT_SCOPED",
        contextKey: "arena_dinner",
        maxPrice: { amount: 100, currency: "USD" },
      },
    });
  }
  async function exclude(candidate: QlooEntity) {
    return rule(candidate, {
      kind: "FEEDBACK",
      feedback: {
        category: "SPECIFIC_DISLIKE",
        scope: "CANDIDATE_ONLY",
        persistence: "DURABLE",
        candidateId: candidate.id,
      },
    });
  }
  async function answer(value: Answer) {
    if (!evaluation || plan?.status !== "ACTIONABLE" || !plan.factor) return;
    const result = await write<InteractiveAuthorization>(
      "/api/state/interactive/answer",
      {
        evaluationId: evaluation.evaluationId,
        expectedStateVersion: evaluation.stateVersion,
        planId: plan.planId,
        ...(interaction
          ? { parentClarificationId: interaction.interactionId }
          : {}),
        answer: value,
      },
    );
    setInteraction(result);
    setPlan(null);
    if (result.finalDecision.outcome === "ASK" && value.kind !== "UNKNOWN")
      await question(evaluation, result);
  }
  async function findAlternative() {
    if (!evaluation || evaluation.decision.outcome !== "REJECT" || repair)
      return;
    const result = await write<RepairResult>("/api/state/interactive/repair", {
      evaluationId: evaluation.evaluationId,
      expectedStateVersion: evaluation.stateVersion,
    });
    setRepair(result);
    setInteraction(null);
    setPlan(null);
    if (
      result.status === "REPAIR_AVAILABLE" &&
      result.verification &&
      result.verification.stateVersion === evaluation.stateVersion &&
      result.verification.action.candidate.id !== evaluation.action.candidate.id
    ) {
      onAlternative(result.verification.action.candidate);
    }
  }
  return {
    state,
    evaluation,
    interaction,
    plan,
    repair,
    unavailable,
    setUnavailable,
    clearEvaluation,
    resetCandidate,
    ensureState,
    refresh,
    check,
    budget,
    exclude,
    answer,
    findAlternative,
    question,
  };
}
