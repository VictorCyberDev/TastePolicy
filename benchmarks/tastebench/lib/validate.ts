import { hash } from "@/server/state/hash";
import { stateHash } from "@/server/state/service";
import { record, uuid } from "@/lib/validation";
import {
  isResolvedEntity,
  isResolvedProfile,
  snapshotEntity,
} from "@/server/taste/invariants";
import {
  evaluationInput,
  feedbackInput,
  money,
} from "@/server/state/validation";
import { readCapturedReceipt } from "@/lib/proof/receipt";
import {
  FEEDBACK_CATEGORIES,
  PERSISTENCE,
  SCOPES,
  type StateVersion,
} from "@/lib/state/types";
import { interactionInput } from "@/server/interactive/validation";
import {
  SYSTEMS,
  type Scenario,
  type Dataset,
  type AnnotationSet,
  type DatasetManifest,
  type Decision,
  type Input,
} from "./types";
export { hash };
export function requireThat(
  ok: unknown,
  message = "TASTEBENCH_INVALID_DATA",
): asserts ok {
  if (!ok) throw Error(message);
}
export function object(x: unknown, allowed: string[]) {
  const r = record(x);
  requireThat(r && Object.keys(r).every((k) => allowed.includes(k)));
  return r;
}
export const identifier = (x: unknown) =>
  typeof x === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(x);
export const timestamp = (x: unknown) =>
  typeof x === "string" &&
  /^\d{4}-\d\d-\d\dT/.test(x) &&
  Number.isFinite(Date.parse(x));
export const finite = (x: unknown) =>
  typeof x === "number" && Number.isFinite(x) && x >= 0;
export const isDecision = (x: unknown): x is Decision =>
  ["ALLOW", "ASK", "REJECT", "UNAVAILABLE"].includes(x as string);
export const hex = (x: unknown) =>
  typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
function entity(x: unknown) {
  requireThat(isResolvedEntity(x));
  requireThat(hash(x) === hash(snapshotEntity(x)));
}
export function validateState(x: unknown): asserts x is StateVersion {
  const r = object(x, [
    "profileId",
    "stateVersion",
    "parentVersion",
    "createdAt",
    "mutationId",
    "stateHash",
    "entries",
  ]);
  requireThat(
    uuid(r.profileId) &&
      Number.isSafeInteger(r.stateVersion) &&
      (r.stateVersion as number) >= 0 &&
      timestamp(r.createdAt) &&
      hex(r.stateHash) &&
      Array.isArray(r.entries) &&
      r.entries.length <= 100,
  );
  requireThat(
    r.stateVersion === 0
      ? r.parentVersion === null && r.mutationId === null
      : r.parentVersion === (r.stateVersion as number) - 1 &&
          !!uuid(r.mutationId),
  );
  const seen = new Set();
  for (const entry of r.entries) {
    const s = object(entry, [
      "signalId",
      "kind",
      "entity",
      "scope",
      "persistence",
      "candidateId",
      "contextKey",
      "domain",
      "constraint",
      "category",
      "source",
      "sourceEventId",
      "createdAt",
      "expiresAt",
    ]);
    requireThat(
      uuid(s.signalId) &&
        !seen.has(s.signalId) &&
        uuid(s.sourceEventId) &&
        s.source === "USER" &&
        timestamp(s.createdAt) &&
        (s.createdAt as string) <= (r.createdAt as string) &&
        [
          "EXPLICIT_LIKE",
          "DURABLE_FEEDBACK",
          "CONTEXTUAL_PREFERENCE",
          "CONSTRAINT",
        ].includes(s.kind as string) &&
        SCOPES.includes(s.scope as never) &&
        PERSISTENCE.includes(s.persistence as never),
    );
    seen.add(s.signalId);
    requireThat(s.expiresAt === undefined || timestamp(s.expiresAt));
    if (s.kind === "EXPLICIT_LIKE") {
      entity(s.entity);
      requireThat(
        s.constraint === undefined &&
          s.scope === "GLOBAL_PREFERENCE" &&
          s.persistence === "DURABLE",
      );
    } else {
      requireThat(FEEDBACK_CATEGORIES.includes(s.category as never));
      const c =
        s.constraint === undefined
          ? null
          : object(s.constraint, ["kind", "amount", "currency"]);
      requireThat(
        !c ||
          (c.kind === "MAX_PRICE" &&
            money({ amount: c.amount, currency: c.currency })) ||
          (c.kind === "EXCLUDE_CANDIDATE" && Object.keys(c).length === 1),
      );
      requireThat(
        feedbackInput({
          category: s.category,
          scope: s.scope,
          persistence: s.persistence,
          ...(s.candidateId ? { candidateId: s.candidateId } : {}),
          ...(s.contextKey ? { contextKey: s.contextKey } : {}),
          ...(s.domain ? { domain: s.domain } : {}),
          ...(s.scope === "GLOBAL_PREFERENCE" && s.persistence === "DURABLE"
            ? { confirmGlobal: true }
            : {}),
          ...(c?.kind === "MAX_PRICE"
            ? { maxPrice: { amount: c.amount, currency: c.currency } }
            : {}),
        }),
      );
      requireThat(
        (s.kind === "CONSTRAINT") === !!c &&
          (s.category !== "SPECIFIC_DISLIKE" ||
            c?.kind === "EXCLUDE_CANDIDATE"),
      );
      requireThat(
        (c?.kind === "MAX_PRICE") === (s.category === "TOO_EXPENSIVE" && !!c),
      );
      requireThat(
        c?.kind !== "EXCLUDE_CANDIDATE" || s.category === "SPECIFIC_DISLIKE",
      );
    }
  }
  const state = x as StateVersion;
  requireThat(state.stateHash === stateHash(state.entries));
  requireThat(
    isResolvedProfile(
      state.entries
        .filter((e) => e.kind === "EXPLICIT_LIKE")
        .map((e) => e.entity),
    ),
  );
}
export function validateInput(x: unknown): asserts x is Input {
  const r = object(x, [
    "candidate",
    "signals",
    "context",
    "state",
    "cultural",
    "evaluatedAt",
  ]);
  entity(r.candidate);
  requireThat(isResolvedProfile(r.signals));
  r.signals.forEach(entity);
  validateState(r.state);
  requireThat(
    timestamp(r.evaluatedAt) && r.state.createdAt <= (r.evaluatedAt as string),
  );
  requireThat(
    evaluationInput({
      agentId: "TasteBench",
      candidate: r.candidate,
      context: r.context,
      expectedStateVersion: r.state.stateVersion,
    }),
  );
  requireThat(
    hash(r.signals.map((e) => e.id).sort()) ===
      hash(
        r.state.entries
          .filter((e) => e.kind === "EXPLICIT_LIKE")
          .map((e) => e.entity!.id)
          .sort(),
      ) && !r.signals.some((e) => e.id === (r.candidate as { id: string }).id),
  );
  const c = object(r.cultural, ["status", "data", "reason"]);
  if (c.status === "available") {
    requireThat(Object.keys(c).length === 2);
    const checked = readCapturedReceipt(c.data);
    requireThat(checked.status === "available");
    requireThat(hash(checked.data) === hash(c.data));
    requireThat(
      checked.data.candidate.id === (r.candidate as { id: string }).id &&
        checked.data.candidate.type ===
          (r.candidate as { type: string }).type &&
        hash(checked.data.inputSignals.map((e) => e.id).sort()) ===
          hash(r.signals.map((e) => e.id).sort()) &&
        checked.data.evaluatedAt <= (r.evaluatedAt as string),
    );
  } else
    requireThat(
      c.status === "unavailable" &&
        Object.keys(c).length === 2 &&
        [
          "not_configured",
          "host_not_configured",
          "affinity_scale_unverified",
          "auth_failed",
          "rate_limited",
          "request_budget_exhausted",
          "timeout",
          "provider_error",
          "invalid_response",
          "no_evidence",
          "unsupported_entity",
          "unresolved_profile",
        ].includes(c.reason as string),
    );
}
export function contentOf(s: Scenario) {
  return {
    kind: s.kind,
    source: s.source,
    input: s.input,
    feedback: s.feedback
      ? {
          event: s.feedback.event,
          after: s.feedback.after,
          evaluatedAt: s.feedback.evaluatedAt,
        }
      : null,
    clarification: s.clarification ? { answer: s.clarification.answer } : null,
    repair: s.repair ? { mode: s.repair.mode } : null,
    perturbations: s.perturbations.map((p) => ({
      field: p.field,
      value: p.value,
    })),
  };
}
export function scenarioHash(s: Scenario) {
  return hash(contentOf(s));
}
export function validateScenario(x: unknown): asserts x is Scenario {
  const r = object(x, [
    "schemaVersion",
    "id",
    "split",
    "kind",
    "source",
    "input",
    "feedback",
    "clarification",
    "repair",
    "perturbations",
    "contract",
    "contentHash",
    "constraintExpected",
  ]);
  requireThat(
    r.schemaVersion === "tastebench-scenario-v1" &&
      identifier(r.id) &&
      ["CALIBRATION", "EVALUATION"].includes(r.split as string) &&
      ["ENGINEERING", "HUMAN"].includes(r.kind as string) &&
      ["SYNTHETIC", "CAPTURED"].includes(r.source as string) &&
      !(r.kind === "HUMAN" && r.source === "SYNTHETIC"),
  );
  validateInput(r.input);
  const s = x as Scenario;
  requireThat(
    r.constraintExpected === undefined ||
      (r.kind === "ENGINEERING" && isDecision(r.constraintExpected)),
  );
  const contract = object(r.contract, [...SYSTEMS]);
  requireThat(Object.values(contract).every(isDecision));
  if (s.kind === "HUMAN") requireThat(Object.keys(contract).length === 0);
  if (s.feedback) {
    const f = object(s.feedback, ["event", "after", "evaluatedAt", "expected"]);
    validateState(f.after);
    const event = object(f.event, [
      "eventId",
      "profileId",
      "stateVersion",
      "createdAt",
      "requestId",
      "category",
      "scope",
      "persistence",
      "candidateId",
      "contextKey",
      "domain",
      "maxPrice",
      "comment",
      "confirmGlobal",
      "expiresAt",
    ]);
    const {
      eventId,
      profileId,
      stateVersion: version,
      createdAt,
      requestId,
      expiresAt,
      ...input
    } = event;
    requireThat(
      (expiresAt === undefined || timestamp(expiresAt)) &&
        feedbackInput(input) &&
        uuid(eventId) &&
        uuid(requestId) &&
        profileId === s.input.state.profileId &&
        timestamp(createdAt) &&
        s.input.evaluatedAt < (createdAt as string) &&
        timestamp(f.evaluatedAt) &&
        (createdAt as string) <= (f.evaluatedAt as string) &&
        isDecision(f.expected),
    );
    const after = f.after as StateVersion;
    requireThat(
      after.profileId === profileId &&
        after.stateVersion === s.input.state.stateVersion + 1 &&
        version === after.stateVersion &&
        after.parentVersion === s.input.state.stateVersion &&
        after.createdAt === createdAt &&
        after.mutationId !== s.input.state.mutationId,
    );
    const added = after.entries.filter(
      (e) => !s.input.state.entries.some((old) => old.signalId === e.signalId),
    );
    requireThat(
      added.length === 1 &&
        added[0].sourceEventId === eventId &&
        added[0].createdAt === createdAt,
    );
    requireThat(
      s.input.state.entries.every((old) =>
        after.entries.some((e) => hash(e) === hash(old)),
      ),
    );
    const a = added[0];
    requireThat(
      a.category === event.category &&
        a.scope === event.scope &&
        a.persistence === event.persistence &&
        a.candidateId === event.candidateId &&
        a.contextKey === event.contextKey &&
        a.domain === event.domain,
    );
    requireThat(
      event.category === "SPECIFIC_DISLIKE"
        ? a.constraint?.kind === "EXCLUDE_CANDIDATE"
        : event.maxPrice
          ? hash(a.constraint) ===
            hash({ kind: "MAX_PRICE", ...(event.maxPrice as object) })
          : a.constraint === undefined,
    );
  }
  if (s.clarification) {
    const c = object(s.clarification, ["answer", "expectedFactor", "expected"]);
    requireThat(
      [
        "PRICE_REQUIRED",
        "PRICE_CURRENCY_REQUIRED",
        "CULTURAL_BORDERLINE",
        "NONE",
      ].includes(c.expectedFactor as string) && isDecision(c.expected),
    );
    requireThat(
      interactionInput(
        {
          evaluationId: s.input.state.profileId,
          expectedStateVersion: s.input.state.stateVersion,
          idempotencyKey: "test",
          planId: "a".repeat(64),
          answer: c.answer,
        },
        "answer",
      ),
    );
  }
  if (s.repair) {
    const c = object(s.repair, ["mode", "expected"]);
    requireThat(
      ["ALLOW", "ASK", "MISS", "UNVERIFIABLE_PRICE", "UNAVAILABLE"].includes(
        c.mode as string,
      ) &&
        [
          "REPAIR_AVAILABLE",
          "NO_VERIFIED_REPAIR_WITHIN_BOUND",
          "NO_VERIFIABLE_REPAIR",
          "UNAVAILABLE",
          "STALE",
        ].includes(c.expected as string) &&
        s.kind === "ENGINEERING" &&
        s.source === "SYNTHETIC",
    );
  }
  requireThat(Array.isArray(s.perturbations) && s.perturbations.length <= 20);
  const seen = new Set();
  for (const p of s.perturbations) {
    object(p, ["id", "field", "value", "expected"]);
    requireThat(
      identifier(p.id) &&
        !seen.has(p.id) &&
        ["score", "price"].includes(p.field) &&
        finite(p.value) &&
        isDecision(p.expected),
    );
    requireThat(
      p.field === "score"
        ? p.value <= 1 && s.input.cultural.status === "available"
        : !!s.input.context.price,
    );
    seen.add(p.id);
  }
  requireThat(s.contentHash === scenarioHash(s));
}
export function validateAnnotations(
  x: unknown,
  scenarios: Scenario[],
): asserts x is AnnotationSet {
  const r = object(x, ["schemaVersion", "version", "records", "adjudications"]);
  requireThat(
    r.schemaVersion === "tastebench-annotations-v1" &&
      identifier(r.version) &&
      Array.isArray(r.records) &&
      Array.isArray(r.adjudications),
  );
  const a = x as AnnotationSet,
    seen = new Set();
  for (const v of a.records) {
    object(v, [
      "schemaVersion",
      "version",
      "scenarioId",
      "source",
      "annotator",
      "label",
      "reasons",
      "comment",
      "annotatedAt",
    ]);
    const s = scenarios.find((s) => s.id === v.scenarioId);
    requireThat(
      s?.kind === "HUMAN" &&
        s.source === "CAPTURED" &&
        v.schemaVersion === "tastebench-annotation-v1" &&
        v.version === a.version &&
        v.source === "HUMAN" &&
        identifier(v.annotator) &&
        !seen.has(v.scenarioId + ":" + v.annotator) &&
        ["ALLOW", "ASK", "REJECT", "UNSCORABLE"].includes(v.label) &&
        Array.isArray(v.reasons) &&
        v.reasons.every((r) =>
          [
            "EXPLICIT_CONSTRAINT",
            "CONTEXT",
            "CULTURAL_FIT",
            "INSUFFICIENT_CONTEXT",
            "OTHER",
          ].includes(r),
        ) &&
        timestamp(v.annotatedAt) &&
        (v.comment === undefined ||
          (typeof v.comment === "string" && v.comment.length <= 300)),
    );
    seen.add(v.scenarioId + ":" + v.annotator);
  }
  seen.clear();
  for (const v of a.adjudications) {
    object(v, [
      "scenarioId",
      "label",
      "source",
      "reviewer",
      "annotationHashes",
      "adjudicatedAt",
    ]);
    const refs = a.records.filter((a) => a.scenarioId === v.scenarioId);
    requireThat(
      !seen.has(v.scenarioId) &&
        v.source === "HUMAN_ADJUDICATION" &&
        identifier(v.reviewer) &&
        timestamp(v.adjudicatedAt) &&
        refs.length > 1 &&
        refs.every((a) => a.annotatedAt <= v.adjudicatedAt) &&
        ["ALLOW", "ASK", "REJECT", "UNSCORABLE"].includes(v.label) &&
        Array.isArray(v.annotationHashes) &&
        hash([...v.annotationHashes].sort()) === hash(refs.map(hash).sort()),
    );
    seen.add(v.scenarioId);
  }
}
export function manifest(d: Dataset, a: AnnotationSet): DatasetManifest {
  object(d, [
    "schemaVersion",
    "benchmarkId",
    "version",
    "createdAt",
    "metricVersion",
    "annotationVersion",
    "provenance",
    "scenarios",
  ]);
  requireThat(
    d.schemaVersion === "tastebench-dataset-v1" &&
      d.benchmarkId === "tastebench-v1" &&
      identifier(d.version) &&
      timestamp(d.createdAt) &&
      d.metricVersion === "tastebench-metrics-v1" &&
      d.annotationVersion === a.version &&
      typeof d.provenance === "string" &&
      d.provenance.length <= 300 &&
      Array.isArray(d.scenarios) &&
      d.scenarios.length > 0 &&
      d.scenarios.length <= 500,
  );
  const ids = new Set(),
    hashes = new Set();
  for (const s of d.scenarios) {
    validateScenario(s);
    requireThat(
      !ids.has(s.id) && !hashes.has(s.contentHash),
      "TASTEBENCH_DUPLICATE_SCENARIO",
    );
    ids.add(s.id);
    hashes.add(s.contentHash);
  }
  validateAnnotations(a, d.scenarios);
  const scenarios = [...d.scenarios]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => ({
      id: s.id,
      split: s.split,
      contentHash: s.contentHash,
      recordHash: hash(s),
    }));
  const counts = (values: string[]) =>
    Object.fromEntries(
      [...new Set(values)]
        .sort()
        .map((v) => [v, values.filter((x) => x === v).length]),
    );
  const body = {
    schemaVersion: "tastebench-manifest-v1" as const,
    benchmarkId: d.benchmarkId,
    datasetVersion: d.version,
    annotationVersion: a.version,
    annotationHash: hash({
      ...a,
      records: [...a.records].sort((a, b) => hash(a).localeCompare(hash(b))),
      adjudications: [...a.adjudications].sort((a, b) =>
        a.scenarioId.localeCompare(b.scenarioId),
      ),
    }),
    metricVersion: d.metricVersion,
    createdAt: d.createdAt,
    provenance: d.provenance,
    scenarioCount: scenarios.length,
    splitCounts: {
      CALIBRATION: scenarios.filter((s) => s.split === "CALIBRATION").length,
      EVALUATION: scenarios.filter((s) => s.split === "EVALUATION").length,
    },
    domainCounts: counts(d.scenarios.map((s) => s.input.context.domain)),
    sourceCounts: counts(d.scenarios.map((s) => s.source)),
    scenarios,
  };
  return { ...body, datasetHash: hash(body) };
}
