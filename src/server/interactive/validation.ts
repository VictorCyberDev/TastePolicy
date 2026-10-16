import { record, uuid } from "@/lib/validation";
import { money } from "@/server/state/validation";
import type { Answer } from "@/lib/interactive/types";
export function interactionInput(
  value: unknown,
  operation: "plan" | "answer" | "repair",
) {
  const r = record(value);
  const allowed =
    operation === "plan"
      ? ["evaluationId", "parentClarificationId"]
      : operation === "answer"
        ? [
            "evaluationId",
            "parentClarificationId",
            "expectedStateVersion",
            "planId",
            "idempotencyKey",
            "answer",
          ]
        : ["evaluationId", "expectedStateVersion", "idempotencyKey"];
  if (
    !r ||
    Object.keys(r).some((k) => !allowed.includes(k)) ||
    !uuid(r.evaluationId) ||
    (r.parentClarificationId !== undefined && !uuid(r.parentClarificationId))
  )
    return null;
  const base = {
    evaluationId: uuid(r.evaluationId)!,
    ...(r.parentClarificationId
      ? { parentClarificationId: uuid(r.parentClarificationId)! }
      : {}),
  };
  if (operation === "plan")
    return {
      ...base,
      expectedStateVersion: 0,
      idempotencyKey: "",
      planId: "",
      answer: undefined as Answer | undefined,
    };
  if (
    !Number.isSafeInteger(r.expectedStateVersion) ||
    (r.expectedStateVersion as number) < 0 ||
    typeof r.idempotencyKey !== "string" ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(r.idempotencyKey)
  )
    return null;
  let answer: Answer | undefined;
  if (operation === "answer") {
    if (typeof r.planId !== "string" || !/^[a-f0-9]{64}$/.test(r.planId))
      return null;
    const a = record(r.answer);
    if (!a) return null;
    if (
      a.kind === "PRICE" &&
      Object.keys(a).every((k) => ["kind", "amount", "currency"].includes(k))
    ) {
      const m = money({ amount: a.amount, currency: a.currency });
      if (!m) return null;
      answer = { kind: "PRICE", ...m };
    } else if (a.kind === "UNKNOWN" && Object.keys(a).length === 1)
      answer = { kind: "UNKNOWN" };
    else if (
      a.kind === "DISPOSITION" &&
      Object.keys(a).every((k) => ["kind", "value"].includes(k)) &&
      ["ACCEPTABLE", "UNACCEPTABLE", "STILL_UNSURE"].includes(a.value as string)
    )
      answer = {
        kind: "DISPOSITION",
        value: a.value as "ACCEPTABLE" | "UNACCEPTABLE" | "STILL_UNSURE",
      };
    else return null;
  }
  return {
    ...base,
    expectedStateVersion: r.expectedStateVersion as number,
    idempotencyKey: r.idempotencyKey,
    planId: typeof r.planId === "string" ? r.planId : "",
    answer,
  };
}
