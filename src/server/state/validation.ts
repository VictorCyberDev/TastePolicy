import { record, uuid } from "@/lib/validation";
import {
  isResolvedProfile,
  snapshotEntity,
  isResolvedEntity,
  isSelectionTarget,
} from "@/server/taste/invariants";
import {
  FEEDBACK_CATEGORIES,
  SCOPES,
  PERSISTENCE,
  type FeedbackInput,
  type MutationRequest,
  type Context,
} from "@/lib/state/types";
function keys(r: Record<string, unknown>, allowed: string[]) {
  return Object.keys(r).every((k) => allowed.includes(k));
}
export function money(value: unknown) {
  const r = record(value);
  return r &&
    keys(r, ["amount", "currency"]) &&
    typeof r.amount === "number" &&
    Number.isFinite(r.amount) &&
    r.amount >= 0 &&
    r.amount <= 1000000 &&
    typeof r.currency === "string" &&
    /^[A-Z]{3}$/.test(r.currency)
    ? { amount: r.amount, currency: r.currency }
    : null;
}
export function feedbackInput(value: unknown): FeedbackInput | null {
  const r = record(value);
  if (
    !r ||
    !keys(r, [
      "category",
      "scope",
      "persistence",
      "candidateId",
      "contextKey",
      "domain",
      "maxPrice",
      "comment",
      "confirmGlobal",
    ]) ||
    !FEEDBACK_CATEGORIES.includes(r.category as never) ||
    !SCOPES.includes(r.scope as never) ||
    !PERSISTENCE.includes(r.persistence as never)
  )
    return null;
  if (
    (r.candidateId !== undefined && !uuid(r.candidateId)) ||
    (r.contextKey !== undefined &&
      (typeof r.contextKey !== "string" ||
        !/^[a-zA-Z0-9_-]{1,64}$/.test(r.contextKey))) ||
    (r.domain !== undefined && !isSelectionTarget(r.domain)) ||
    (r.comment !== undefined &&
      (typeof r.comment !== "string" || r.comment.length > 300)) ||
    (r.confirmGlobal !== undefined && typeof r.confirmGlobal !== "boolean")
  )
    return null;
  if (
    (r.scope === "CANDIDATE_ONLY" && !r.candidateId) ||
    (r.scope === "CONTEXT" && !r.contextKey) ||
    (r.scope === "DOMAIN" && !r.domain) ||
    (r.scope === "GLOBAL_PREFERENCE" &&
      r.persistence === "DURABLE" &&
      r.confirmGlobal !== true)
  )
    return null;
  if (
    (r.persistence === "CONTEXT_SCOPED" && r.scope !== "CONTEXT") ||
    (r.persistence === "DOMAIN_SCOPED" && r.scope !== "DOMAIN")
  )
    return null;
  if (
    r.category === "SPECIFIC_DISLIKE" &&
    (r.scope !== "CANDIDATE_ONLY" || !r.candidateId)
  )
    return null;
  if (
    r.maxPrice !== undefined &&
    (r.category !== "TOO_EXPENSIVE" || !money(r.maxPrice))
  )
    return null;
  const f: FeedbackInput = {
    category: r.category as FeedbackInput["category"],
    scope: r.scope as FeedbackInput["scope"],
    persistence: r.persistence as FeedbackInput["persistence"],
  };
  if (r.candidateId) f.candidateId = uuid(r.candidateId)!;
  if (r.contextKey) f.contextKey = r.contextKey as string;
  if (r.domain) f.domain = r.domain as FeedbackInput["domain"];
  if (r.comment !== undefined) f.comment = r.comment as string;
  if (r.confirmGlobal !== undefined)
    f.confirmGlobal = r.confirmGlobal as boolean;
  if (r.maxPrice) f.maxPrice = money(r.maxPrice)!;
  return f;
}
export function mutationInput(
  value: unknown,
  requestId: string,
): MutationRequest | null {
  const r = record(value),
    p = record(r?.payload);
  if (
    !r ||
    !p ||
    !keys(r, ["expectedStateVersion", "idempotencyKey", "payload"]) ||
    !Number.isSafeInteger(r.expectedStateVersion) ||
    (r.expectedStateVersion as number) < 0 ||
    typeof r.idempotencyKey !== "string" ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(r.idempotencyKey)
  )
    return null;
  let payload: MutationRequest["payload"];
  if (
    p.kind === "INITIALIZE" &&
    keys(p, ["kind", "signals"]) &&
    isResolvedProfile(p.signals)
  )
    payload = { kind: "INITIALIZE", signals: p.signals.map(snapshotEntity) };
  else if (p.kind === "FEEDBACK" && keys(p, ["kind", "feedback"])) {
    const f = feedbackInput(p.feedback);
    if (!f) return null;
    payload = { kind: "FEEDBACK", feedback: f };
  } else if (
    p.kind === "REMOVE" &&
    keys(p, ["kind", "signalId"]) &&
    uuid(p.signalId)
  )
    payload = { kind: "REMOVE", signalId: uuid(p.signalId)! };
  else return null;
  return {
    expectedStateVersion: r.expectedStateVersion as number,
    idempotencyKey: r.idempotencyKey,
    payload,
    requestId,
  };
}
export function evaluationInput(value: unknown) {
  const r = record(value),
    c = record(r?.context);
  if (
    !r ||
    !keys(r, ["agentId", "candidate", "context", "expectedStateVersion"]) ||
    typeof r.agentId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(r.agentId) ||
    !isResolvedEntity(r.candidate) ||
    !isSelectionTarget(r.candidate.type) ||
    !Number.isSafeInteger(r.expectedStateVersion) ||
    (r.expectedStateVersion as number) < 0 ||
    !c ||
    !keys(c, ["key", "domain", "price"]) ||
    typeof c.key !== "string" ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(c.key) ||
    c.domain !== r.candidate.type ||
    (c.price !== undefined && !money(c.price))
  )
    return null;
  return {
    agentId: r.agentId,
    candidate: snapshotEntity(r.candidate),
    expectedStateVersion: r.expectedStateVersion as number,
    context: {
      key: c.key,
      domain: c.domain,
      ...(c.price ? { price: money(c.price)! } : {}),
    } as Context,
  };
}
