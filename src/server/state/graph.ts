import type {
  StateVersion,
  StateEvaluation,
  FeedbackEvent,
} from "@/lib/state/types";
import { hash } from "./hash";
import { canonical } from "@/lib/state/canonical";
export type NodeKind =
  | "PROFILE"
  | "EXPLICIT_PREFERENCE"
  | "CONSTRAINT"
  | "FEEDBACK"
  | "CONTEXT"
  | "PROPOSAL"
  | "CANDIDATE"
  | "PROVIDER_EVIDENCE"
  | "DECISION"
  | "RECEIPT";
export type EdgeKind =
  | "EXPRESSES"
  | "APPLIES_TO"
  | "CONSTRAINS"
  | "PROPOSES"
  | "EVIDENCES"
  | "PRODUCED"
  | "DERIVED_FROM"
  | "SUPERSEDES";
export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  source: {
    kind: "STATE" | "FEEDBACK" | "EVALUATION";
    id: string;
    version: number;
  };
}
export interface GraphEdge {
  id: string;
  kind: EdgeKind;
  from: string;
  to: string;
  source: GraphNode["source"];
}
export function stateDiff(before: StateVersion | null, after: StateVersion) {
  if (before && before.profileId !== after.profileId)
    throw Error("Profile mismatch");
  const old = before?.entries ?? [],
    next = after.entries;
  const added = next.filter((e) => !old.some((o) => o.signalId === e.signalId));
  const removed = old.filter(
    (e) => !next.some((n) => n.signalId === e.signalId),
  );
  const changed = next.filter((e) =>
    old.some((o) => o.signalId === e.signalId && canonical(o) !== canonical(e)),
  );
  return {
    from: before?.stateVersion ?? null,
    to: after.stateVersion,
    added: added.sort((a, b) => a.signalId.localeCompare(b.signalId)),
    removed: removed.sort((a, b) => a.signalId.localeCompare(b.signalId)),
    changedConstraints: [...added, ...removed, ...changed]
      .filter((e) => e.kind === "CONSTRAINT")
      .sort((a, b) => a.signalId.localeCompare(b.signalId)),
    feedbackEventIds: [
      ...new Set(added.filter((e) => e.category).map((e) => e.sourceEventId)),
    ].sort(),
  };
}
export function contextGraph(
  state: StateVersion,
  feedback: FeedbackEvent[],
  evaluation?: StateEvaluation,
) {
  const nodes: GraphNode[] = [],
    edges: GraphEdge[] = [];
  const source = {
    kind: "STATE" as const,
    id: state.profileId,
    version: state.stateVersion,
  };
  const node = (
    id: string,
    kind: NodeKind,
    label: string,
    s = source as GraphNode["source"],
  ) => {
    nodes.push({ id, kind, label, source: s });
    return id;
  };
  const edge = (
    kind: EdgeKind,
    from: string,
    to: string,
    s = source as GraphNode["source"],
  ) =>
    edges.push({ id: kind + ":" + from + ":" + to, kind, from, to, source: s });
  const profile = node(
    "profile:" + state.profileId,
    "PROFILE",
    "Taste State " + state.stateVersion,
  );
  for (const e of state.entries.filter(
    (e) => e.kind !== "EXPLORATION_INTENT",
  )) {
    const id = node(
      "signal:" + e.signalId,
      e.kind === "CONSTRAINT"
        ? "CONSTRAINT"
        : e.category
          ? "FEEDBACK"
          : "EXPLICIT_PREFERENCE",
      e.entity?.name ?? e.constraint?.kind ?? e.category ?? e.kind,
      { kind: "STATE", id: e.signalId, version: state.stateVersion },
    );
    edge("EXPRESSES", profile, id);
    if (e.category) {
      const f = feedback.find((f) => f.eventId === e.sourceEventId);
      if (f) {
        const fid = node("feedback:" + f.eventId, "FEEDBACK", f.category, {
          kind: "FEEDBACK",
          id: f.eventId,
          version: f.stateVersion,
        });
        edge("DERIVED_FROM", id, fid, {
          kind: "FEEDBACK",
          id: f.eventId,
          version: f.stateVersion,
        });
      }
    }
  }
  if (evaluation) {
    if (
      evaluation.profileId !== state.profileId ||
      evaluation.stateVersion !== state.stateVersion
    )
      throw Error("Evaluation state mismatch");
    const s = {
      kind: "EVALUATION" as const,
      id: evaluation.evaluationId,
      version: state.stateVersion,
    };
    const candidate = node(
        "candidate:" + evaluation.action.candidate.id,
        "CANDIDATE",
        evaluation.action.candidate.name,
        s,
      ),
      proposal = node(
        "proposal:" + evaluation.evaluationId,
        "PROPOSAL",
        evaluation.agentId + " · SELECT_ENTITY",
        s,
      ),
      context = node(
        "context:" + evaluation.evaluationId,
        "CONTEXT",
        evaluation.context.key,
        s,
      ),
      decision = node(
        "decision:" + evaluation.evaluationId,
        "DECISION",
        evaluation.decision.outcome + " · " + evaluation.decision.basis,
        s,
      ),
      receipt = node(
        "receipt:" + evaluation.evaluationId,
        "RECEIPT",
        "State-linked evaluation",
        s,
      );
    edge("PROPOSES", proposal, candidate, s);
    edge("APPLIES_TO", context, proposal, s);
    edge("DERIVED_FROM", decision, profile, s);
    edge("PRODUCED", decision, receipt, s);
    for (const rule of evaluation.decision.rules) {
      const id = rule.split(":")[1];
      if (id && state.entries.some((e) => e.signalId === id))
        edge("CONSTRAINS", "signal:" + id, decision, s);
    }
    if (evaluation.cultural.status === "available") {
      const evidence = node(
        "evidence:" + evaluation.evaluationId,
        "PROVIDER_EVIDENCE",
        "Qloo candidate evidence",
        s,
      );
      edge("EVIDENCES", evidence, candidate, s);
      edge("DERIVED_FROM", receipt, evidence, s);
    }
  }
  nodes.sort((a, b) => a.id.localeCompare(b.id));
  edges.sort((a, b) => a.id.localeCompare(b.id));
  return { nodes, edges, semanticHash: hash({ nodes, edges }) };
}
