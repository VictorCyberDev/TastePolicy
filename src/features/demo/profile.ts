import type { EntityQuery } from "@/types/domain";
// Material & modern: public identities reviewed on the event host, 2026-10-13.
// Runtime resolution remains mandatory; no provider IDs or affinities are hardcoded.
export const CANONICAL_SIGNALS: readonly EntityQuery[] = [
  { query: "Nils Frahm", expectedType: "artist" },
  { query: "Perfect Days", expectedType: "movie" },
  { query: "Muji", expectedType: "brand" },
  { query: "Piranesi", expectedType: "book" },
  { query: "Severance", expectedType: "tv_show" },
];
