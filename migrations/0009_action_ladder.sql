BEGIN;
-- Final reconciliation: additive. The subjective-action ladder is stored in the
-- lease's data (permittedActions); the legacy `permitted` column stays as a
-- compatibility view and may now be empty when the owner's ceiling sits below
-- SHORTLIST (no legacy continuation word maps to SUGGEST or RANK). Only the
-- non-empty requirement is relaxed; the vocabulary check stays.
DO $$ DECLARE c text; BEGIN
 FOR c IN SELECT conname FROM pg_constraint
  WHERE conrelid='tastepolicy.platform_leases'::regclass AND contype='c'
  AND pg_get_constraintdef(oid) LIKE '%cardinality(permitted)%'
 LOOP EXECUTE format('ALTER TABLE tastepolicy.platform_leases DROP CONSTRAINT %I',c); END LOOP;
END $$;
ALTER TABLE tastepolicy.platform_leases ADD CONSTRAINT platform_leases_permitted_vocab CHECK(permitted <@ ARRAY['recommend','add_to_draft']);
COMMIT;
