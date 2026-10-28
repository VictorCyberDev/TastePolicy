BEGIN;
-- Final repair: the owner controls what a portable proof can carry. One row per
-- Passport; no row means the privacy-preserving default (MINIMAL).
CREATE TABLE tastepolicy.proof_disclosure (
 passport_ref text PRIMARY KEY REFERENCES tastepolicy.taste_passports(passport_ref) ON DELETE CASCADE,
 user_id text NOT NULL,
 mode text NOT NULL CHECK(mode IN ('MINIMAL','STANDARD')),
 claims jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(claims)='object'),
 updated_at timestamptz NOT NULL
);
ALTER TABLE tastepolicy.proof_disclosure ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tastepolicy.proof_disclosure FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tastepolicy FROM PUBLIC;
COMMIT;
