import type { ContextInput } from "./context";

const num = (v: unknown, lo: number, hi: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null;

export function parsePlaceContextBody(text: string): ContextInput | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  if (Object.keys(r).some((k) => !["name", "address", "origin"].includes(k)))
    return null;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  const address = typeof r.address === "string" ? r.address.trim() : undefined;
  if (
    !name ||
    name.length > 160 ||
    (address !== undefined && address.length > 300)
  )
    return null;
  let origin: ContextInput["origin"];
  if (r.origin !== undefined) {
    const o = r.origin as Record<string, unknown> | null;
    const lat = num(o?.lat, -90, 90),
      lng = num(o?.lng, -180, 180);
    if (
      !o ||
      typeof o !== "object" ||
      lat === null ||
      lng === null ||
      typeof o.label !== "string" ||
      !o.label ||
      o.label.length > 80 ||
      Object.keys(o).some((k) => !["lat", "lng", "label"].includes(k))
    )
      return null;
    origin = { lat, lng, label: o.label };
  }
  return {
    entity: {
      id: "place-context",
      name,
      type: "place",
      ...(address ? { address } : {}),
    },
    ...(origin ? { origin } : {}),
  };
}
