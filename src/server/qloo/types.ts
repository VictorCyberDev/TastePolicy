import { ENTITY_TYPES, type QlooEntity, type EntityType } from "@/types/domain";
import { record, UUID_PATTERN } from "@/lib/validation";
export function normalizeEntity(
  value: unknown,
  format: "lookup" | "insights" = "lookup",
): QlooEntity | null {
  const item = record(value);
  if (!item) return null;
  // Verified event-host search/lookup and Insights use different entity shapes.
  const rawType =
    format === "lookup"
      ? Array.isArray(item.types) && item.types.length === 1
        ? item.types[0]
        : undefined
      : item.type === "urn:entity"
        ? item.subtype
        : undefined;
  const type =
    typeof rawType === "string"
      ? rawType.startsWith("urn:entity:")
        ? rawType.slice("urn:entity:".length)
        : ""
      : "";
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
