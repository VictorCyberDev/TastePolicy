import { record, uuid } from "@/lib/validation";
import { StateFailure } from "@/lib/state/types";
export function input(raw: unknown, fields: string[]) {
  const q = record(raw);
  if (!q || Object.keys(q).some((k) => !fields.includes(k)))
    throw new StateFailure("INVALID_INPUT");
  return q;
}
export function id(value: unknown) {
  const v = uuid(value);
  if (!v) throw new StateFailure("INVALID_INPUT");
  return v;
}
export function mutation(q: Record<string, unknown>) {
  if (
    !Number.isSafeInteger(q.expectedStateVersion) ||
    (q.expectedStateVersion as number) < 0 ||
    typeof q.idempotencyKey !== "string" ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(q.idempotencyKey)
  )
    throw new StateFailure("INVALID_INPUT");
  return {
    expectedStateVersion: q.expectedStateVersion as number,
    key: q.idempotencyKey,
  };
}
