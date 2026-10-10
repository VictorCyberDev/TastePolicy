import { record, uuid } from "@/lib/validation";
import { ENTITY_TYPES, type QlooEntity, type TargetType } from "@/types/domain";

export const SIGNAL_COUNT = 5;
export function signalIdentitySet(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length !== SIGNAL_COUNT) return null;
  const ids = value.map(uuid);
  return ids.every((id) => id !== null) && new Set(ids).size === SIGNAL_COUNT
    ? (ids as string[])
    : null;
}
export function isSelectionTarget(value: unknown): value is TargetType {
  return ["brand", "destination", "place"].includes(value as string);
}
export function isResolvedEntity(value: unknown): value is QlooEntity {
  const e = record(value);
  return (
    !!e &&
    uuid(e.id) !== null &&
    uuid(e.id) === e.id &&
    typeof e.name === "string" &&
    e.name.trim().length > 0 &&
    e.name.length <= 250 &&
    ENTITY_TYPES.includes(e.type as never) &&
    (e.releaseYear === undefined ||
      (typeof e.releaseYear === "number" && Number.isInteger(e.releaseYear))) &&
    (e.address === undefined ||
      (typeof e.address === "string" && e.address.length <= 300))
  );
}
export function isResolvedProfile(signals: unknown): signals is QlooEntity[] {
  return (
    Array.isArray(signals) &&
    signals.every(isResolvedEntity) &&
    signalIdentitySet(signals.map((s) => s.id)) !== null &&
    new Set(signals.map((s) => s.type)).size >= 2
  );
}
export function snapshotEntity(e: QlooEntity): QlooEntity {
  return {
    id: e.id,
    name: e.name,
    type: e.type,
    ...(e.releaseYear !== undefined ? { releaseYear: e.releaseYear } : {}),
    ...(e.address !== undefined ? { address: e.address } : {}),
  };
}
