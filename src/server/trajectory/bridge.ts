import type { StateVersion, Context } from "@/lib/state/types";
import { StateFailure } from "@/lib/state/types";
import type { QlooEntity } from "@/types/domain";
import type {
  Breadth,
  Tolerance,
  TrajectoryFeedback,
  BridgeQuery,
  CapturedQuery,
  BridgeCandidate,
} from "@/lib/trajectory/types";
import { BREADTHS } from "@/lib/trajectory/types";
import {
  isResolvedProfile,
  isResolvedEntity,
  isSelectionTarget,
} from "@/server/taste/invariants";
import { stateDecision } from "@/server/state/policy";
import { hash } from "@/server/state/hash";
import { normalizeAffinity } from "@/server/policy/normalization";
export function anchorsFor(state: StateVersion) {
  const anchors = state.entries
    .filter((e) => e.kind === "EXPLICIT_LIKE")
    .map((e) => e.entity);
  if (!isResolvedProfile(anchors)) throw new StateFailure("INVALID_INPUT");
  return anchors.sort((a, b) => a.id.localeCompare(b.id));
}
export function bridgeQueries(
  anchors: QlooEntity[],
  target: QlooEntity,
): BridgeQuery[] {
  if (
    !isResolvedProfile(anchors) ||
    !isResolvedEntity(target) ||
    !isSelectionTarget(target.type) ||
    anchors.some((e) => e.id === target.id)
  )
    throw new StateFailure("INVALID_INPUT");
  return [...anchors]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((omit, i) => ({
      queryId: `Q${i + 1}`,
      omittedAnchorId: omit.id,
      signalIds: [
        target.id,
        ...anchors.filter((a) => a.id !== omit.id).map((a) => a.id),
      ].sort(),
    }));
}
export const SUPPORT_MINIMUM: Record<Breadth, number> = {
  STRICT: 4,
  MODERATE: 2,
  BROAD: 1,
};
export function permitted(tolerance: Tolerance, breadth: Breadth) {
  return (
    BREADTHS.indexOf(breadth) <=
    { CONSERVATIVE: 0, BALANCED: 1, OPEN: 2 }[tolerance]
  );
}
export function nextBreadth(
  current: Breadth,
  tolerance: Tolerance,
  feedback: TrajectoryFeedback,
): Breadth {
  const index = BREADTHS.indexOf(current),
    delta =
      feedback === "TOO_SAFE" ? 1 : feedback === "TOO_ADVENTUROUS" ? -1 : 0;
  return BREADTHS[
    Math.max(
      0,
      Math.min(
        { CONSERVATIVE: 0, BALANCED: 1, OPEN: 2 }[tolerance],
        index + delta,
      ),
    )
  ];
}
export function bridges(
  state: StateVersion,
  target: QlooEntity,
  context: Context,
  breadth: Breadth,
  queries: CapturedQuery[],
  at: string,
): BridgeCandidate[] {
  const anchors = anchorsFor(state),
    expected = bridgeQueries(anchors, target);
  if (queries.length !== 5 || new Set(queries.map((q) => q.queryId)).size !== 5)
    throw new StateFailure("INVALID_INPUT");
  const found = new Map<string, BridgeCandidate>();
  for (const q of queries) {
    const definition = expected.find((e) => e.queryId === q.queryId),
      p = q.result.provenance;
    if (
      !definition ||
      hash({ ...q, result: undefined }) !== hash(definition) ||
      p.provider !== "qloo" ||
      p.endpoint !== "/v2/insights" ||
      p.targetType !== target.type ||
      p.specificCandidateId !== undefined ||
      hash([...p.signalIds].sort()) !== hash(q.signalIds) ||
      q.result.candidates.length > 8
    )
      throw new StateFailure("INVALID_INPUT");
    const seen = new Set<string>();
    for (const c of q.result.candidates) {
      if (
        !isResolvedEntity(c.entity) ||
        !Number.isSafeInteger(c.rank) ||
        c.rank < 1 ||
        c.rank > 8 ||
        seen.has(c.entity.id) ||
        normalizeAffinity(c.rawAffinity, c.scale) !== c.alignmentScore
      )
        throw new StateFailure("INVALID_INPUT");
      seen.add(c.entity.id);
      if (
        c.entity.type !== target.type ||
        c.entity.id === target.id ||
        anchors.some((a) => a.id === c.entity.id) ||
        stateDecision(
          state,
          c.entity,
          context,
          { status: "unavailable", reason: "no_evidence" },
          at,
        ).outcome === "REJECT"
      )
        continue;
      const prior = found.get(c.entity.id);
      if (prior && hash(prior.entity) !== hash(c.entity))
        throw new StateFailure("INVALID_INPUT");
      const row = prior ?? {
        entity: c.entity,
        supportCount: 0,
        bestRank: c.rank,
        memberships: [],
        authorizationStatus: "UNVERIFIED" as const,
      };
      row.memberships.push({ queryId: q.queryId, rank: c.rank });
      row.supportCount++;
      row.bestRank = Math.min(row.bestRank, c.rank);
      found.set(c.entity.id, row);
    }
  }
  return [...found.values()]
    .filter((c) => c.supportCount >= SUPPORT_MINIMUM[breadth])
    .map((c) => ({
      ...c,
      memberships: c.memberships.sort((a, b) =>
        a.queryId.localeCompare(b.queryId),
      ),
    }))
    .sort(
      (a, b) =>
        b.supportCount - a.supportCount ||
        a.bestRank - b.bestRank ||
        a.entity.id.localeCompare(b.entity.id),
    );
}
export function canonicalQueries(queries: CapturedQuery[]) {
  return queries
    .map((q) => ({
      ...q,
      result: {
        ...q.result,
        candidates: [...q.result.candidates].sort(
          (a, b) => a.rank - b.rank || a.entity.id.localeCompare(b.entity.id),
        ),
      },
    }))
    .sort((a, b) => a.queryId.localeCompare(b.queryId));
}
export function generationHash(g: {
  feedbackCursor: number;
  stateVersion: number;
  stateHash: string;
  target: QlooEntity;
  anchors: QlooEntity[];
  breadth: Breadth;
  context: Context;
  queryDefinitions: BridgeQuery[];
  queries: CapturedQuery[];
  candidates: BridgeCandidate[];
  status: string;
  reason?: string;
}) {
  return hash({
    version: "taste-trajectory-v1",
    feedbackCursor: g.feedbackCursor,
    stateVersion: g.stateVersion,
    stateHash: g.stateHash,
    target: g.target,
    anchors: [...g.anchors].sort((a, b) => a.id.localeCompare(b.id)),
    breadth: g.breadth,
    context: g.context,
    queryDefinitions: [...g.queryDefinitions].sort((a, b) =>
      a.queryId.localeCompare(b.queryId),
    ),
    queries: canonicalQueries(g.queries),
    candidates: g.candidates,
    status: g.status,
    reason: g.reason ?? null,
  });
}
