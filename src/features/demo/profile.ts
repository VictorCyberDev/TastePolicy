import type { EntityQuery } from "@/types/domain";
// Unresolved seed concepts, never invented Qloo IDs or affinities.
export const CANONICAL_SIGNALS: readonly EntityQuery[] = [
  { query: "Radiohead", expectedType: "artist" },
  { query: "Dune", expectedType: "movie" },
  { query: "Aesop", expectedType: "brand" },
  { query: "The Bear", expectedType: "tv_show" },
  { query: "Blue Bottle Coffee", expectedType: "brand" },
];
