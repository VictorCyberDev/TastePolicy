BEGIN;
-- M26: what the person told us matters (requirements and a starting area).
-- One row per Passport; no row means the person has not set any yet. The value
-- is validated by the application before it is written.
CREATE TABLE tastepolicy.passport_needs (
 passport_ref text PRIMARY KEY REFERENCES tastepolicy.taste_passports(passport_ref) ON DELETE CASCADE,
 user_id text NOT NULL,
 needs jsonb NOT NULL CHECK(jsonb_typeof(needs)='object'),
 updated_at timestamptz NOT NULL
);
ALTER TABLE tastepolicy.passport_needs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tastepolicy.passport_needs FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tastepolicy FROM PUBLIC;
COMMIT;
