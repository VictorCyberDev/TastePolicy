// Synthetic test-only wire fixtures. Not recorded Qloo data; never imported by production modules.
export const ids = Array.from(
  { length: 6 },
  (_, i) => `00000000-0000-4000-8000-00000000000${i}`,
);
export const signalIds = ids.slice(0, 5);
export const wireEntities = [
  "artist",
  "movie",
  "brand",
  "tv_show",
  "brand",
  "destination",
].map((type, i) => ({
  entity_id: ids[i],
  name: `Test ${type} ${i}`,
  types: [`urn:entity:${type}`],
  properties: { release_year: 2021 },
  private_field: "MUST_NOT_LEAK",
}));
export const entities = wireEntities.map((e) => ({
  id: e.entity_id,
  name: e.name,
  type: e.types[0].replace(
    "urn:entity:",
    "",
  ) as import("@/types/domain").EntityType,
  releaseYear: 2021,
}));
export const wireInsights = (score: unknown = 0.9) => ({
  success: true,
  results: {
    entities: [
      {
        ...wireEntities[5],
        type: "urn:entity",
        subtype: wireEntities[5].types[0],
        query: {
          affinity: score,
          explainability: {
            "signal.interests.entities": [
              { entity_id: ids[0], score: 0.6 },
              { entity_id: ids[1], score: 0.3 },
            ],
          },
        },
        private_field: "MUST_NOT_LEAK",
      },
    ],
  },
});
export const jsonResponse = (value: unknown, status = 200) =>
  Response.json(value, { status });
