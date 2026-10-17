import { randomUUID } from "node:crypto";
import type { StateStore, Repositories } from "@/server/state/repositories";
import { TasteStateService, stateHash } from "@/server/state/service";
import {
  StateFailure,
  type StateVersion,
  type Context,
  type StateEvaluation,
} from "@/lib/state/types";
import { hash } from "@/server/state/hash";
import type { QlooProvider } from "@/server/qloo/contracts";
import type {
  TrajectoryIntent,
  TrajectoryGeneration,
  TrajectoryEvent,
  TrajectoryView,
  Breadth,
  Tolerance,
  TrajectoryFeedback,
  CapturedQuery,
} from "@/lib/trajectory/types";
import {
  TOLERANCES,
  BREADTHS,
  TRAJECTORY_FEEDBACK,
} from "@/lib/trajectory/types";
import {
  anchorsFor,
  bridgeQueries,
  bridges,
  permitted,
  nextBreadth,
  generationHash,
} from "./bridge";
import { input, id, mutation } from "./validation";
import {
  isResolvedEntity,
  isSelectionTarget,
  snapshotEntity,
} from "@/server/taste/invariants";
export class TrajectoryFailure extends Error {
  constructor(
    readonly code:
      | "STALE"
      | "STOPPED"
      | "COMPLETE"
      | "INTEGRITY_ERROR"
      | "TOLERANCE_EXCEEDED"
      | "TRAJECTORY_UNAVAILABLE",
  ) {
    super(code);
  }
}
export class TrajectoryService {
  constructor(
    readonly store: StateStore,
    readonly clock = () => new Date().toISOString(),
  ) {}
  private async auth(r: Repositories, token: string) {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new StateFailure("SESSION_EXPIRED");
    const session = await r.sessions.find(hash(token), true);
    if (!session || session.expiresAt <= this.clock())
      throw new StateFailure("SESSION_EXPIRED");
    const profile = await r.states.profile(session.profileId, true);
    if (!profile || profile.expiresAt <= this.clock())
      throw new StateFailure("SESSION_EXPIRED");
    const state = (await r.states.version(
      profile.profileId,
      profile.currentStateVersion,
    ))!;
    return { profile, session, state };
  }
  private async consume(
    r: Repositories,
    s: { mutations: number; tokenHash: string },
  ) {
    if (s.mutations >= 100) throw new StateFailure("RATE_LIMITED");
    await r.sessions.consume(s.tokenHash);
  }
  private async intent(r: Repositories, p: string, tid: string) {
    const t = await r.trajectories.intent(p, tid);
    if (!t) throw new StateFailure("NOT_FOUND");
    return t;
  }
  private active(
    t: TrajectoryIntent,
    state: StateVersion,
    events: TrajectoryEvent[],
  ) {
    if (events.some((e) => e.kind === "TRAJECTORY_STOPPED"))
      throw new TrajectoryFailure("STOPPED");
    if (
      events.some(
        (e) =>
          e.kind === "TARGET_SELECTED" && e.stateVersion === state.stateVersion,
      )
    )
      throw new TrajectoryFailure("COMPLETE");
    const entry = state.entries.find(
      (e) => e.signalId === t.signalId && e.kind === "EXPLORATION_INTENT",
    );
    if (!entry || (entry.expiresAt && entry.expiresAt <= this.clock()))
      throw new TrajectoryFailure("STOPPED");
  }
  async resolve(token: string, raw: unknown, factory: () => QlooProvider) {
    const q = input(raw, ["query", "type"]);
    if (
      typeof q.query !== "string" ||
      q.query.trim().length < 1 ||
      q.query.length > 120 ||
      !isSelectionTarget(q.type)
    )
      throw new StateFailure("INVALID_INPUT");
    return this.store.transaction(async (r) => {
      const { session } = await this.auth(r, token);
      await this.consume(r, session);
      return factory().resolve({
        query: q.query as string,
        expectedType: q.type as "brand" | "destination" | "place",
      });
    });
  }
  async create(
    token: string,
    raw: unknown,
    factory: () => QlooProvider,
    requestId: string,
  ): Promise<TrajectoryIntent> {
    const q = input(raw, [
        "expectedStateVersion",
        "idempotencyKey",
        "targetId",
        "targetType",
        "reviewed",
        "contextKey",
        "tolerance",
      ]),
      m = mutation(q),
      targetId = id(q.targetId);
    if (
      q.reviewed !== true ||
      !isSelectionTarget(q.targetType) ||
      !TOLERANCES.includes(q.tolerance as never) ||
      typeof q.contextKey !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(q.contextKey)
    )
      throw new StateFailure("INVALID_INPUT");
    return this.store.transaction(async (r) => {
      const { profile, session, state } = await this.auth(r, token),
        ph = hash(q),
        old = await r.trajectories.intentByKey(profile.profileId, m.key);
      if (old) {
        if (old.payloadHash !== ph)
          throw new StateFailure("IDEMPOTENCY_KEY_CONFLICT");
        return old;
      }
      if (state.stateVersion !== m.expectedStateVersion)
        throw new StateFailure("STATE_VERSION_CONFLICT");
      const anchors = anchorsFor(state);
      if (anchors.some((e) => e.id === targetId))
        throw new StateFailure("INVALID_INPUT");
      await this.consume(r, session);
      const lookup = await factory().entities([targetId]);
      if (lookup.status === "unavailable")
        throw new TrajectoryFailure("TRAJECTORY_UNAVAILABLE");
      const target = lookup.data[0];
      if (
        lookup.data.length !== 1 ||
        !isResolvedEntity(target) ||
        target.id !== targetId ||
        target.type !== q.targetType
      )
        throw new StateFailure("INVALID_INPUT");
      const now = this.clock(),
        mutationId = randomUUID(),
        signalId = randomUUID(),
        context: Context = {
          key: q.contextKey as string,
          domain: q.targetType as Context["domain"],
        },
        tolerance = q.tolerance as Tolerance;
      const entries = [
        ...state.entries,
        {
          signalId,
          kind: "EXPLORATION_INTENT" as const,
          scope: "CONTEXT" as const,
          persistence: "CONTEXT_SCOPED" as const,
          contextKey: context.key,
          domain: context.domain,
          exploration: { target: snapshotEntity(target), tolerance, context },
          source: "USER" as const,
          sourceEventId: mutationId,
          createdAt: now,
        },
      ];
      const next: StateVersion = {
        profileId: profile.profileId,
        stateVersion: state.stateVersion + 1,
        parentVersion: state.stateVersion,
        mutationId,
        createdAt: now,
        entries,
        stateHash: stateHash(entries),
      };
      const t: TrajectoryIntent = {
        trajectoryId: randomUUID(),
        profileId: profile.profileId,
        intentStateVersion: next.stateVersion,
        intentStateHash: next.stateHash,
        signalId,
        target: snapshotEntity(target),
        tolerance,
        context,
        createdAt: now,
        requestId,
        key: m.key,
        payloadHash: ph,
      };
      await r.states.insertVersion(next);
      await r.mutations.insert({
        profileId: profile.profileId,
        key: "trajectory-" + t.trajectoryId,
        payloadHash: ph,
        result: { state: next, mutationId },
      });
      await r.states.advance(profile.profileId, next.stateVersion);
      await r.trajectories.insertIntent(t);
      await this.auth(r, token);
      return t;
    });
  }
  private replayGeneration(g: TrajectoryGeneration, state: StateVersion) {
    try {
      if (
        g.stateHash !== state.stateHash ||
        stateHash(state.entries) !== state.stateHash ||
        hash(g.anchors) !== hash(anchorsFor(state)) ||
        hash(
          [...g.queryDefinitions].sort((a, b) =>
            a.queryId.localeCompare(b.queryId),
          ),
        ) !== hash(bridgeQueries(anchorsFor(state), g.target))
      )
        throw Error();
      const expected =
        g.status === "TRAJECTORY_UNAVAILABLE"
          ? []
          : bridges(
              state,
              g.target,
              g.context,
              g.breadth,
              g.queries,
              g.generatedAt,
            );
      if (
        hash(expected) !== hash(g.candidates) ||
        generationHash(g) !== g.semanticHash ||
        (g.status === "TRAJECTORY_UNAVAILABLE" &&
          (g.queries.length !== 0 || !g.reason))
      )
        throw Error();
      return g;
    } catch {
      throw new TrajectoryFailure("INTEGRITY_ERROR");
    }
  }
  async read(token: string, raw: unknown): Promise<TrajectoryView> {
    const q = input(raw, ["trajectoryId"]),
      tid = id(q.trajectoryId);
    return this.store.transaction(async (r) => {
      const { profile, state } = await this.auth(r, token),
        t = await this.intent(r, profile.profileId, tid),
        events = await r.trajectories.events(profile.profileId, tid),
        gs = await r.trajectories.generations(profile.profileId, tid),
        g = gs.at(-1) ?? null;
      if (g)
        this.replayGeneration(
          g,
          (await r.states.version(profile.profileId, g.stateVersion))!,
        );
      const activeIntent = state.entries.some((e) => e.signalId === t.signalId);
      const status =
        events.some((e) => e.kind === "TRAJECTORY_STOPPED") || !activeIntent
          ? "STOPPED"
          : events.some(
                (e) =>
                  e.kind === "TARGET_SELECTED" &&
                  e.stateVersion === state.stateVersion,
              )
            ? "COMPLETE"
            : (g?.stateVersion ?? t.intentStateVersion) !== state.stateVersion
              ? "STALE"
              : "ACTIVE";
      const candidates = new Set([
        t.target.id,
        ...(g?.candidates.map((c) => c.entity.id) ?? []),
      ]);
      const evaluations = (await r.receipts.list(profile.profileId)).filter(
        (e) =>
          e.stateVersion === (g?.stateVersion ?? state.stateVersion) &&
          hash(e.context) === hash(t.context) &&
          candidates.has(e.action.candidate.id),
      );
      return {
        intent: t,
        generation: g,
        events,
        stateVersion: state.stateVersion,
        stateHash: state.stateHash,
        anchors: anchorsFor(state),
        breadth:
          events
            .slice(g?.feedbackCursor ?? 0)
            .filter((e) => e.breadth)
            .at(-1)?.breadth ??
          g?.breadth ??
          "STRICT",
        status,
        evaluations,
        evidenceSource: "CAPTURED",
      };
    });
  }
  async plan(
    token: string,
    raw: unknown,
    factory: () => QlooProvider,
    requestId: string,
  ) {
    const q = input(raw, [
        "trajectoryId",
        "expectedStateVersion",
        "idempotencyKey",
        "breadth",
        "refresh",
      ]),
      m = mutation(q),
      tid = id(q.trajectoryId);
    if (
      !BREADTHS.includes(q.breadth as never) ||
      (q.refresh !== undefined && typeof q.refresh !== "boolean")
    )
      throw new StateFailure("INVALID_INPUT");
    return this.store.transaction(async (r) => {
      const { profile, session, state } = await this.auth(r, token),
        ph = hash(q),
        existing = await r.trajectories.generationByKey(
          profile.profileId,
          m.key,
        );
      if (existing) {
        if (existing.payloadHash !== ph)
          throw new StateFailure("IDEMPOTENCY_KEY_CONFLICT");
        return this.replayGeneration(
          existing,
          (await r.states.version(profile.profileId, existing.stateVersion))!,
        );
      }
      const t = await this.intent(r, profile.profileId, tid),
        events = await r.trajectories.events(profile.profileId, tid),
        gs = await r.trajectories.generations(profile.profileId, tid);
      this.active(t, state, events);
      if (state.stateVersion !== m.expectedStateVersion)
        throw new StateFailure("STATE_VERSION_CONFLICT");
      if (
        (gs.at(-1)?.stateVersion ?? t.intentStateVersion) !==
          state.stateVersion &&
        q.refresh !== true
      )
        throw new TrajectoryFailure("STALE");
      const breadth = q.breadth as Breadth;
      if (!permitted(t.tolerance, breadth))
        throw new TrajectoryFailure("TOLERANCE_EXCEEDED");
      const targetEvaluation = (await r.receipts.list(profile.profileId)).find(
        (e) =>
          e.stateVersion === state.stateVersion &&
          e.action.candidate.id === t.target.id &&
          hash(e.context) === hash(t.context) &&
          e.decision.outcome === "ALLOW",
      );
      if (targetEvaluation)
        return {
          status: "DIRECT_TARGET_AVAILABLE" as const,
          evaluation: targetEvaluation,
        };
      await this.consume(r, session);
      const anchors = anchorsFor(state),
        definitions = bridgeQueries(anchors, t.target),
        captured: CapturedQuery[] = [];
      let reason: TrajectoryGeneration["reason"];
      try {
        const provider = factory();
        const results = await Promise.all(
          definitions.map(async (definition) => {
            try {
              return {
                definition,
                result: await provider.infer({
                  signalIds: definition.signalIds,
                  targetType: t.target.type,
                }),
              };
            } catch {
              return {
                definition,
                result: {
                  status: "unavailable" as const,
                  reason: "provider_error" as const,
                },
              };
            }
          }),
        );
        for (const { definition, result } of results) {
          if (result.status === "unavailable") {
            reason ??= result.reason;
          } else captured.push({ ...definition, result: result.data });
        }
      } catch {
        reason = "provider_error";
      }
      const at = this.clock();
      let candidates: TrajectoryGeneration["candidates"] = [];
      if (!reason) {
        try {
          candidates = bridges(
            state,
            t.target,
            t.context,
            breadth,
            captured,
            at,
          );
        } catch {
          reason = "invalid_response";
        }
      }
      const g: TrajectoryGeneration = {
        feedbackCursor: events.length,
        ordinal: gs.length + 1,
        schemaVersion: "taste-trajectory-v1",
        generationId: randomUUID(),
        trajectoryId: tid,
        profileId: profile.profileId,
        stateVersion: state.stateVersion,
        stateHash: state.stateHash,
        target: t.target,
        anchors,
        breadth,
        context: t.context,
        queryDefinitions: definitions,
        queries: reason ? [] : captured,
        candidates: reason ? [] : candidates,
        status: reason
          ? "TRAJECTORY_UNAVAILABLE"
          : candidates.length
            ? "BRIDGES_AVAILABLE"
            : "NO_BRIDGE_AT_CURRENT_BREADTH",
        ...(reason ? { reason } : {}),
        generatedAt: at,
        requestId,
        semanticHash: "",
        key: m.key,
        payloadHash: ph,
        evidenceSource: "CAPTURED",
      };
      g.semanticHash = generationHash(g);
      await this.auth(r, token);
      await r.trajectories.insertGeneration(g);
      return g;
    });
  }
  async evaluate(
    token: string,
    raw: unknown,
    factory: () => QlooProvider,
    requestId: string,
  ): Promise<StateEvaluation> {
    const q = input(raw, [
        "trajectoryId",
        "generationId",
        "candidateId",
        "expectedStateVersion",
      ]),
      tid = id(q.trajectoryId),
      candidateId = id(q.candidateId);
    const proposal = await this.store.transaction(async (r) => {
      const { profile, state, session } = await this.auth(r, token),
        t = await this.intent(r, profile.profileId, tid);
      if (session.mutations >= 100) throw new StateFailure("RATE_LIMITED");
      this.active(
        t,
        state,
        await r.trajectories.events(profile.profileId, tid),
      );
      if (q.expectedStateVersion !== state.stateVersion)
        throw new StateFailure("STATE_VERSION_CONFLICT");
      let candidate = t.target;
      if (candidateId !== t.target.id) {
        const g = await r.trajectories.generation(
          profile.profileId,
          id(q.generationId),
        );
        if (!g || g.trajectoryId !== tid) throw new StateFailure("NOT_FOUND");
        if (g.stateVersion !== state.stateVersion)
          throw new TrajectoryFailure("STALE");
        this.replayGeneration(g, state);
        const c = g.candidates.find((c) => c.entity.id === candidateId);
        if (!c) throw new StateFailure("NOT_FOUND");
        candidate = c.entity;
      }
      return {
        agentId: "TasteTrajectory",
        expectedStateVersion: state.stateVersion,
        candidate,
        context: t.context,
      };
    });
    return new TasteStateService(this.store, this.clock).evaluate(
      token,
      proposal,
      factory,
      requestId,
    );
  }
  async event(token: string, raw: unknown, requestId: string) {
    const q = input(raw, [
        "trajectoryId",
        "expectedStateVersion",
        "idempotencyKey",
        "feedback",
        "evaluationId",
        "clarificationId",
        "generationId",
      ]),
      m = mutation(q),
      tid = id(q.trajectoryId);
    if (
      q.feedback !== undefined &&
      !TRAJECTORY_FEEDBACK.includes(q.feedback as never)
    )
      throw new StateFailure("INVALID_INPUT");
    if (
      q.feedback !== undefined &&
      (q.evaluationId !== undefined ||
        q.clarificationId !== undefined ||
        q.generationId !== undefined)
    )
      throw new StateFailure("INVALID_INPUT");
    return this.store.transaction(async (r) => {
      const { profile, session, state } = await this.auth(r, token),
        ph = hash(q),
        old = await r.trajectories.eventByKey(profile.profileId, m.key);
      if (old) {
        if (old.payloadHash !== ph)
          throw new StateFailure("IDEMPOTENCY_KEY_CONFLICT");
        return old;
      }
      const t = await this.intent(r, profile.profileId, tid),
        events = await r.trajectories.events(profile.profileId, tid);
      this.active(t, state, events);
      if (m.expectedStateVersion !== state.stateVersion)
        throw new StateFailure("STATE_VERSION_CONFLICT");
      const e: TrajectoryEvent = {
        ordinal: events.length + 1,
        eventId: randomUUID(),
        trajectoryId: tid,
        profileId: profile.profileId,
        stateVersion: state.stateVersion,
        generationId: null,
        candidateId: null,
        evaluationId: null,
        clarificationId: null,
        kind: "TRAJECTORY_FEEDBACK",
        createdAt: this.clock(),
        requestId,
        key: m.key,
        payloadHash: ph,
      };
      if (q.feedback !== undefined) {
        const gs = await r.trajectories.generations(profile.profileId, tid),
          g = gs.at(-1);
        if (
          g &&
          g.stateVersion !== state.stateVersion &&
          q.feedback !== "STOP_EXPLORING"
        )
          throw new TrajectoryFailure("STALE");
        e.feedback = q.feedback as TrajectoryFeedback;
        e.breadth = nextBreadth(
          events
            .slice(g?.feedbackCursor ?? 0)
            .filter((e) => e.breadth)
            .at(-1)?.breadth ??
            g?.breadth ??
            "STRICT",
          t.tolerance,
          e.feedback,
        );
        if (e.feedback === "STOP_EXPLORING") e.kind = "TRAJECTORY_STOPPED";
      } else {
        const evaluation = await r.receipts.find(
          profile.profileId,
          id(q.evaluationId),
        );
        if (!evaluation) throw new StateFailure("NOT_FOUND");
        if (
          evaluation.stateVersion !== state.stateVersion ||
          evaluation.stateHash !== state.stateHash ||
          hash(evaluation.context) !== hash(t.context)
        )
          throw new TrajectoryFailure("STALE");
        let outcome = evaluation.decision.outcome;
        if (q.clarificationId !== undefined) {
          const c = await r.clarifications.find(
            profile.profileId,
            id(q.clarificationId),
          );
          if (
            !c ||
            c.evaluationId !== evaluation.evaluationId ||
            c.stateVersion !== state.stateVersion
          )
            throw new StateFailure("NOT_FOUND");
          outcome = c.result.finalDecision.outcome;
          e.clarificationId = c.id;
        }
        if (outcome !== "ALLOW") throw new StateFailure("INVALID_INPUT");
        e.evaluationId = evaluation.evaluationId;
        e.candidateId = evaluation.action.candidate.id;
        if (e.candidateId === t.target.id) e.kind = "TARGET_SELECTED";
        else {
          const g = await r.trajectories.generation(
            profile.profileId,
            id(q.generationId),
          );
          if (!g || g.trajectoryId !== tid) throw new StateFailure("NOT_FOUND");
          if (g.stateVersion !== state.stateVersion)
            throw new TrajectoryFailure("STALE");
          this.replayGeneration(g, state);
          if (!g.candidates.some((c) => c.entity.id === e.candidateId))
            throw new StateFailure("NOT_FOUND");
          e.generationId = g.generationId;
          e.kind = "STEP_AUTHORIZED";
        }
      }
      await this.consume(r, session);
      await r.trajectories.insertEvent(e);
      return e;
    });
  }
  async replay(token: string, raw: unknown) {
    const q = input(raw, ["generationId"]);
    return this.store.transaction(async (r) => {
      const { profile } = await this.auth(r, token);
      const g = await r.trajectories.generation(
        profile.profileId,
        id(q.generationId),
      );
      if (!g) throw new StateFailure("NOT_FOUND");
      const state = (await r.states.version(
        profile.profileId,
        g.stateVersion,
      ))!;
      this.replayGeneration(g, state);
      const events = (
        await r.trajectories.events(profile.profileId, g.trajectoryId)
      ).filter(
        (e) =>
          e.stateVersion === g.stateVersion &&
          (e.generationId === g.generationId || e.kind === "TARGET_SELECTED"),
      );
      const evaluations = [] as StateEvaluation[];
      for (const event of events) {
        if (!event.evaluationId) continue;
        const evaluation = await r.receipts.find(
          profile.profileId,
          event.evaluationId,
        );
        if (
          !evaluation ||
          evaluation.stateVersion !== g.stateVersion ||
          evaluation.stateHash !== g.stateHash ||
          event.candidateId !== evaluation.action.candidate.id ||
          hash(evaluation.context) !== hash(g.context)
        )
          throw new TrajectoryFailure("INTEGRITY_ERROR");
        const decision = event.clarificationId
          ? await r.clarifications.find(
              profile.profileId,
              event.clarificationId,
            )
          : null;
        if (
          event.clarificationId &&
          (!decision ||
            decision.evaluationId !== evaluation.evaluationId ||
            decision.stateVersion !== g.stateVersion)
        )
          throw new TrajectoryFailure("INTEGRITY_ERROR");
        if (
          (decision?.result.finalDecision.outcome ??
            evaluation.decision.outcome) !== "ALLOW"
        )
          throw new TrajectoryFailure("INTEGRITY_ERROR");
        evaluations.push(
          await new TasteStateService(
            { transaction: (fn) => fn(r) },
            this.clock,
          ).replay(token, evaluation.evaluationId),
        );
      }
      const recorded = (await r.receipts.list(profile.profileId)).filter(
        (e) =>
          e.stateVersion === g.stateVersion &&
          hash(e.context) === hash(g.context),
      );
      const candidateStatuses = g.candidates.map((c) => ({
        candidateId: c.entity.id,
        status: events.some(
          (e) => e.candidateId === c.entity.id && e.kind === "STEP_AUTHORIZED",
        )
          ? "AUTHORIZED_STEP"
          : (recorded
              .filter((e) => e.action.candidate.id === c.entity.id)
              .at(-1)?.decision.outcome ?? "UNVERIFIED"),
      }));
      return {
        generation: g,
        events,
        evaluations,
        candidateStatuses,
        evidenceSource: "CAPTURED" as const,
      };
    });
  }
}
