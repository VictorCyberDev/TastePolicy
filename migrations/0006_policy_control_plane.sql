BEGIN;
-- M7: additive policy control plane. Nothing in 0001-0005 is altered.
CREATE TABLE tastepolicy.policy_versions (
 passport_ref text NOT NULL REFERENCES tastepolicy.taste_passports(passport_ref) ON DELETE CASCADE,
 version integer NOT NULL CHECK(version>0),
 user_id text NOT NULL,
 doc_hash text NOT NULL CHECK(doc_hash ~ '^[a-f0-9]{64}$'),
 document jsonb NOT NULL CHECK(document->>'schemaVersion'='taste-policy-v1'),
 parent_version integer,
 created_at timestamptz NOT NULL,
 note text CHECK(note IS NULL OR length(note)<=200),
 PRIMARY KEY(passport_ref,version),
 CHECK((version=1 AND parent_version IS NULL) OR parent_version=version-1)
);
CREATE TABLE tastepolicy.policy_active (
 passport_ref text PRIMARY KEY REFERENCES tastepolicy.taste_passports(passport_ref) ON DELETE CASCADE,
 version integer NOT NULL,
 FOREIGN KEY(passport_ref,version) REFERENCES tastepolicy.policy_versions(passport_ref,version) ON DELETE CASCADE
);
CREATE TABLE tastepolicy.policy_overrides (
 override_id uuid PRIMARY KEY,
 passport_ref text NOT NULL REFERENCES tastepolicy.taste_passports(passport_ref) ON DELETE CASCADE,
 user_id text NOT NULL,
 effect text NOT NULL CHECK(effect IN ('ALLOW_THROUGH_ASK','ALLOW_THROUGH_CULTURAL_REJECT')),
 created_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 data jsonb NOT NULL,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 days'),
 CHECK(data @> jsonb_build_object('overrideId',override_id::text,'effect',effect))
);
CREATE INDEX policy_overrides_passport ON tastepolicy.policy_overrides(passport_ref);
CREATE TABLE tastepolicy.platform_policy_decisions (
 evaluation_ref text PRIMARY KEY REFERENCES tastepolicy.platform_evaluations(evaluation_ref) ON DELETE CASCADE,
 passport_ref text NOT NULL REFERENCES tastepolicy.taste_passports(passport_ref) ON DELETE CASCADE,
 policy_version integer,
 base_outcome text NOT NULL CHECK(base_outcome IN ('ALLOW','ASK','REJECT','UNAVAILABLE')),
 final_outcome text NOT NULL CHECK(final_outcome IN ('ALLOW','ASK','REJECT','UNAVAILABLE')),
 data jsonb NOT NULL
);
CREATE FUNCTION tastepolicy.guard_policy_override() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.override_id,NEW.passport_ref,NEW.user_id,NEW.effect,NEW.created_at,NEW.expires_at,NEW.data) IS DISTINCT FROM ROW(OLD.override_id,OLD.passport_ref,OLD.user_id,OLD.effect,OLD.created_at,OLD.expires_at,OLD.data) OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN RAISE EXCEPTION 'Only first revocation may change an override'; END IF; RETURN NEW; END $$;
CREATE TRIGGER policy_override_guard BEFORE UPDATE ON tastepolicy.policy_overrides FOR EACH ROW EXECUTE FUNCTION tastepolicy.guard_policy_override();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['policy_versions','policy_active','policy_overrides','platform_policy_decisions'] LOOP
  EXECUTE format('ALTER TABLE tastepolicy.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('REVOKE ALL ON tastepolicy.%I FROM PUBLIC',t);
 END LOOP;
END $$;
CREATE TRIGGER immutable_policy_versions BEFORE UPDATE ON tastepolicy.policy_versions FOR EACH ROW EXECUTE FUNCTION tastepolicy.immutable_snapshot();
CREATE TRIGGER immutable_policy_decisions BEFORE UPDATE ON tastepolicy.platform_policy_decisions FOR EACH ROW EXECUTE FUNCTION tastepolicy.immutable_snapshot();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tastepolicy FROM PUBLIC;
COMMIT;
