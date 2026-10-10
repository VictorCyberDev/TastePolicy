import { ENTITY_TYPES, type QlooEntity, type EntityType } from "@/types/domain";
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
export function normalizeEntity(value: unknown): QlooEntity | null {
  const item = record(value);
  if (!item) return null;
  const rawType = typeof item.subtype === "string" ? item.subtype : item.type;
  const type =
    typeof rawType === "string" ? rawType.replace(/^urn:entity:/, "") : "";
  if (
    typeof item.entity_id !== "string" ||
    !UUID_PATTERN.test(item.entity_id) ||
    typeof item.name !== "string" ||
    item.name.trim().length < 1 ||
    item.name.length > 250 ||
    !ENTITY_TYPES.includes(type as EntityType)
  )
    return null;
  const properties = record(item.properties);
  return {
    id: item.entity_id.toLowerCase(),
    name: item.name.trim(),
    type: type as EntityType,
    ...(typeof properties?.release_year === "number" &&
    Number.isInteger(properties.release_year)
      ? { releaseYear: properties.release_year }
      : {}),
    ...(typeof properties?.address === "string" &&
    properties.address.length <= 300
      ? { address: properties.address }
      : {}),
  };
}
export function entityList(payload: unknown): unknown[] | null {
  const root = record(payload);
  if (!root || root.success === false || root.error) return null;
  if (Array.isArray(root.results)) return root.results;
  const results = record(root.results);
  return Array.isArray(results?.entities) ? results.entities : null;
}
