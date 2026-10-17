# Engineering fixtures

The small versioned engineering corpus is scenarios/engineering.json (24 explicitly SYNTHETIC cases). scripts/tastebench-fixtures.ts records their mechanical definitions and independent contract expectations; regeneration is an intentional dataset-versioning action, never automatic result-dependent selection. Fake entity identities and values here are engineering fixtures only, not resolved Qloo identities or human annotations. The two empty external baselines are ENVIRONMENT_BLOCKED, not synthetic model implementations.

Repair scenarios use an isolated in-memory development-only PGlite instance and actual migrations/repository/services. No DATABASE_URL is read and no public demo state is mutated. All provider responses are explicitly synthetic; no HTTP occurs. Interaction metrics are contract verification, not recommendation/human accuracy.
