import type { QlooEntity } from "@/types/domain";
import type { IdentityVerdict, ProviderPlace } from "./types";

// Deterministic Qloo-candidate -> factual-place identity. A false match would
// attach another business's photos and accessibility facts to a recommendation,
// so the bridge refuses unless one place is clearly and uniquely the same.
const STOP = new Set(["the", "a", "an", "and", "of", "at", "le", "la", "el"]);
export const MIN_CONFIDENCE = 0.82;
export const MIN_MARGIN = 0.15;

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
// Street abbreviations, so "59 W 44th St" and "59, West 44th Street" agree.
const EXPAND: Record<string, string> = {
  st: "street",
  ave: "avenue",
  av: "avenue",
  blvd: "boulevard",
  rd: "road",
  w: "west",
  e: "east",
  n: "north",
  s: "south",
  dr: "drive",
  ln: "lane",
  pl: "place",
  sq: "square",
};
const tokens = (s: string) =>
  norm(s)
    .split(" ")
    .map((t) => EXPAND[t] ?? t)
    .filter((t) => t && !STOP.has(t));

function nameScore(a: string, b: string) {
  const x = tokens(a),
    y = tokens(b);
  if (!x.length || !y.length) return 0;
  if (x.join(" ") === y.join(" ")) return 1;
  const sy = new Set(y);
  const common = x.filter((t) => sy.has(t)).length;
  // Both directions must be covered: "Blue Note" must not match "Blue Note
  // Hotel & Spa" at full score, and "Hotel" must not match everything.
  const recall = common / x.length,
    precision = common / y.length;
  return recall + precision === 0
    ? 0
    : (2 * recall * precision) / (recall + precision);
}
function addressScore(qloo: string | undefined, place: string) {
  if (!qloo) return null;
  const x = tokens(qloo).filter((t) => t.length > 1),
    y = new Set(tokens(place));
  if (!x.length) return null;
  return x.filter((t) => y.has(t)).length / x.length;
}

export function scorePlace(entity: QlooEntity, place: ProviderPlace) {
  const name = nameScore(entity.name, place.name);
  const addr = addressScore(entity.address, place.address);
  // Without a Qloo address the name alone carries the match, at a discount:
  // it cannot reach MIN_CONFIDENCE for a short, common name.
  const confidence =
    addr === null
      ? name * (tokens(entity.name).length >= 3 ? 0.9 : 0.8)
      : name * 0.7 + addr * 0.3;
  return { name, addr, confidence: Math.round(confidence * 1000) / 1000 };
}

export function bridgePlace(
  entity: QlooEntity,
  places: ProviderPlace[],
): IdentityVerdict {
  if (entity.type !== "place")
    return {
      status: "no_match",
      confidence: 0,
      margin: 0,
      reasons: ["NOT_A_PLACE"],
    };
  const ranked = places
    .map((p) => ({ p, s: scorePlace(entity, p) }))
    .sort((a, b) => b.s.confidence - a.s.confidence);
  const top = ranked[0];
  if (!top || top.s.name < 0.6)
    return {
      status: "no_match",
      confidence: 0,
      margin: 0,
      reasons: [top ? "NAME_MISMATCH" : "NO_PROVIDER_RESULTS"],
    };
  const second = ranked[1]?.s.confidence ?? 0;
  const margin = Math.round((top.s.confidence - second) * 1000) / 1000;
  const reasons = [
    `name:${top.s.name.toFixed(2)}`,
    top.s.addr === null
      ? "address:not_provided"
      : `address:${top.s.addr.toFixed(2)}`,
  ];
  if (top.s.confidence < MIN_CONFIDENCE)
    return {
      status: "ambiguous",
      confidence: top.s.confidence,
      margin,
      reasons: [...reasons, "BELOW_CONFIDENCE"],
    };
  if (margin < MIN_MARGIN)
    return {
      status: "ambiguous",
      confidence: top.s.confidence,
      margin,
      reasons: [...reasons, "AMBIGUOUS_RUNNER_UP"],
    };
  return {
    status: "matched",
    confidence: top.s.confidence,
    margin,
    reasons,
    place: top.p,
  };
}
