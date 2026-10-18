BEGIN;
-- Better Auth 1.7.10 core schema, generated from its installed schema contract.
CREATE TABLE tastepolicy."platform_auth_user"(id text PRIMARY KEY DEFAULT gen_random_uuid()::text,"name" text NOT NULL,"email" text NOT NULL UNIQUE,"emailVerified" boolean NOT NULL,"image" text,"createdAt" timestamptz NOT NULL,"updatedAt" timestamptz NOT NULL);
CREATE TABLE tastepolicy."platform_auth_session"(id text PRIMARY KEY DEFAULT gen_random_uuid()::text,"expiresAt" timestamptz NOT NULL,"token" text NOT NULL UNIQUE,"createdAt" timestamptz NOT NULL,"updatedAt" timestamptz NOT NULL,"ipAddress" text,"userAgent" text,"userId" text NOT NULL REFERENCES tastepolicy."platform_auth_user"(id) ON DELETE CASCADE);
CREATE TABLE tastepolicy."platform_auth_account"(id text PRIMARY KEY DEFAULT gen_random_uuid()::text,"accountId" text NOT NULL,"providerId" text NOT NULL,"userId" text NOT NULL REFERENCES tastepolicy."platform_auth_user"(id) ON DELETE CASCADE,"accessToken" text,"refreshToken" text,"idToken" text,"accessTokenExpiresAt" timestamptz,"refreshTokenExpiresAt" timestamptz,"scope" text,"password" text,"createdAt" timestamptz NOT NULL,"updatedAt" timestamptz NOT NULL);
CREATE TABLE tastepolicy."platform_auth_verification"(id text PRIMARY KEY DEFAULT gen_random_uuid()::text,"identifier" text NOT NULL,"value" text NOT NULL,"expiresAt" timestamptz NOT NULL,"createdAt" timestamptz NOT NULL,"updatedAt" timestamptz NOT NULL);
CREATE TABLE tastepolicy."rateLimit"(id text PRIMARY KEY DEFAULT gen_random_uuid()::text,"key" text NOT NULL UNIQUE,"count" integer NOT NULL,"lastRequest" bigint NOT NULL);
CREATE TABLE tastepolicy.platform_ownership (
 user_id text PRIMARY KEY REFERENCES tastepolicy.platform_auth_user(id) ON DELETE CASCADE,
 profile_id uuid NOT NULL UNIQUE REFERENCES tastepolicy.taste_profiles ON DELETE CASCADE,
 UNIQUE(user_id,profile_id)
);
CREATE TABLE tastepolicy.taste_passports (
 passport_ref text PRIMARY KEY, user_id text NOT NULL REFERENCES tastepolicy.platform_auth_user(id) ON DELETE CASCADE,
 profile_id uuid NOT NULL UNIQUE, current_version integer NOT NULL CHECK(current_version>0), expires_at timestamptz NOT NULL, data jsonb NOT NULL,
 subject_ref text NOT NULL UNIQUE CHECK(subject_ref ~ '^tps_[a-f0-9]{48}$' AND subject_ref<>profile_id::text),
 UNIQUE(user_id,passport_ref,profile_id,subject_ref),
 UNIQUE(user_id,passport_ref,profile_id), FOREIGN KEY(user_id,profile_id) REFERENCES tastepolicy.platform_ownership(user_id,profile_id) ON DELETE CASCADE
);
CREATE TABLE tastepolicy.passport_versions (
 passport_ref text NOT NULL REFERENCES tastepolicy.taste_passports ON DELETE CASCADE, version integer NOT NULL CHECK(version>0), user_id text NOT NULL, profile_id uuid NOT NULL,state_version integer NOT NULL,state_hash text NOT NULL, data jsonb NOT NULL, subject_ref text NOT NULL, PRIMARY KEY(passport_ref,version), FOREIGN KEY(user_id,passport_ref,profile_id,subject_ref) REFERENCES tastepolicy.taste_passports(user_id,passport_ref,profile_id,subject_ref) ON DELETE CASCADE, FOREIGN KEY(user_id,passport_ref,profile_id) REFERENCES tastepolicy.taste_passports(user_id,passport_ref,profile_id) ON DELETE CASCADE,FOREIGN KEY(profile_id,state_version,state_hash) REFERENCES tastepolicy.taste_state_versions(profile_id,version,state_hash) ON DELETE CASCADE
);
ALTER TABLE tastepolicy.taste_passports ADD FOREIGN KEY(passport_ref,current_version) REFERENCES tastepolicy.passport_versions DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE tastepolicy.passport_access_grants (
 grant_id uuid PRIMARY KEY, user_id text NOT NULL, passport_ref text NOT NULL, profile_id uuid NOT NULL,
 grantee_id text NOT NULL REFERENCES tastepolicy.platform_auth_user(id) ON DELETE CASCADE, scopes text[] NOT NULL,
 expires_at timestamptz NOT NULL, data jsonb NOT NULL, CHECK(user_id<>grantee_id),
 CHECK(cardinality(scopes)>0 AND scopes <@ ARRAY['READ_PASSPORT_SUMMARY','READ_STATE_SUMMARY','EVALUATE_TASTE_ACTION','READ_RECEIPT']),
 UNIQUE(grant_id,passport_ref,grantee_id), UNIQUE(user_id,grant_id), FOREIGN KEY(user_id,passport_ref,profile_id) REFERENCES tastepolicy.taste_passports(user_id,passport_ref,profile_id) ON DELETE CASCADE
);
CREATE TABLE tastepolicy.passport_access_events (
 grant_id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES tastepolicy.platform_auth_user(id) ON DELETE CASCADE, data jsonb NOT NULL, FOREIGN KEY(user_id,grant_id) REFERENCES tastepolicy.passport_access_grants(user_id,grant_id) ON DELETE CASCADE
);
CREATE TABLE tastepolicy.developer_credentials (
 credential_id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES tastepolicy.platform_auth_user(id) ON DELETE CASCADE,
 secret_hash text NOT NULL UNIQUE CHECK(length(secret_hash)=64), scopes text[] NOT NULL CHECK(cardinality(scopes)>0 AND scopes <@ ARRAY['PASSPORT_READ','TASTE_EVALUATE','RECEIPT_READ']),
 expires_at timestamptz NOT NULL, data jsonb NOT NULL, UNIQUE(user_id,credential_id)
);
CREATE TABLE tastepolicy.developer_credential_events (
 user_id text NOT NULL, credential_id uuid NOT NULL, data jsonb NOT NULL, PRIMARY KEY(user_id,credential_id),
 FOREIGN KEY(user_id,credential_id) REFERENCES tastepolicy.developer_credentials(user_id,credential_id) ON DELETE CASCADE
);
CREATE TABLE tastepolicy.platform_evaluations (
 evaluation_ref text PRIMARY KEY, user_id text NOT NULL, passport_ref text NOT NULL, profile_id uuid NOT NULL,
 version integer NOT NULL, state_hash text NOT NULL, evaluation_id uuid NOT NULL, actor_id text NOT NULL REFERENCES tastepolicy.platform_auth_user(id) ON DELETE CASCADE,
 grant_id uuid, data jsonb NOT NULL,
 FOREIGN KEY(user_id,passport_ref,profile_id) REFERENCES tastepolicy.taste_passports(user_id,passport_ref,profile_id) ON DELETE CASCADE,
 FOREIGN KEY(profile_id,version,state_hash) REFERENCES tastepolicy.taste_state_versions(profile_id,version,state_hash) ON DELETE CASCADE,
 FOREIGN KEY(profile_id,evaluation_id,version) REFERENCES tastepolicy.cultural_receipts(profile_id,evaluation_id,version) ON DELETE CASCADE,
 FOREIGN KEY(grant_id,passport_ref,actor_id) REFERENCES tastepolicy.passport_access_grants(grant_id,passport_ref,grantee_id) ON DELETE CASCADE,
 CHECK((actor_id=user_id AND grant_id IS NULL) OR (actor_id<>user_id AND grant_id IS NOT NULL))
);
CREATE TABLE tastepolicy.platform_operations (
 user_id text NOT NULL REFERENCES tastepolicy.platform_auth_user(id) ON DELETE CASCADE, operation text NOT NULL, key text NOT NULL CHECK(length(key) BETWEEN 1 AND 80), payload_hash text NOT NULL, result jsonb NOT NULL,
 PRIMARY KEY(user_id,operation,key)
);
CREATE TABLE tastepolicy.passport_exports (
 export_id uuid PRIMARY KEY, user_id text NOT NULL, passport_ref text NOT NULL, profile_id uuid NOT NULL, semantic_hash text NOT NULL, data jsonb NOT NULL,
 FOREIGN KEY(user_id,passport_ref,profile_id) REFERENCES tastepolicy.taste_passports(user_id,passport_ref,profile_id) ON DELETE CASCADE
);
CREATE TABLE tastepolicy.platform_rate (
 user_id text NOT NULL REFERENCES tastepolicy.platform_auth_user(id) ON DELETE CASCADE, bucket text NOT NULL, used integer NOT NULL CHECK(used>=0), PRIMARY KEY(user_id,bucket)
);
CREATE TABLE tastepolicy.account_deletion_records (
 digest text PRIMARY KEY CHECK(length(digest)=64), completed_at timestamptz NOT NULL, expires_at timestamptz NOT NULL
);
-- JSON envelopes must agree with authoritative relational ownership fields.
ALTER TABLE tastepolicy.taste_passports ADD CHECK(data @> jsonb_build_object('passportRef',passport_ref,'userId',user_id,'profileId',profile_id::text,'version',current_version,'subjectRef',subject_ref) AND data->>'expiresAt' IS NOT NULL AND (data->>'expiresAt')::timestamptz=expires_at);
ALTER TABLE tastepolicy.passport_versions ADD CHECK(data @> jsonb_build_object('passportRef',passport_ref,'userId',user_id,'profileId',profile_id::text,'version',version,'stateVersion',state_version,'stateHash',state_hash,'subjectRef',subject_ref));
ALTER TABLE tastepolicy.passport_access_grants ADD CHECK(data @> jsonb_build_object('grantId',grant_id::text,'grantorUserId',user_id,'granteeUserId',grantee_id,'passportRef',passport_ref,'profileId',profile_id::text,'scopes',to_jsonb(scopes),'assurance','AUTHENTICATED_GRANTOR_CONSENT') AND data->'scopes'=to_jsonb(scopes) AND data->>'expiresAt' IS NOT NULL AND (data->>'expiresAt')::timestamptz=expires_at);
ALTER TABLE tastepolicy.developer_credentials ADD CHECK(data @> jsonb_build_object('credentialId',credential_id::text,'userId',user_id,'scopes',to_jsonb(scopes)) AND data->'scopes'=to_jsonb(scopes) AND data->>'expiresAt' IS NOT NULL AND (data->>'expiresAt')::timestamptz=expires_at AND NOT(data ?| ARRAY['secret','apiKey','token']));
ALTER TABLE tastepolicy.platform_evaluations ADD CHECK(data @> jsonb_build_object('evaluationRef',evaluation_ref,'userId',user_id,'actorId',actor_id,'passportRef',passport_ref,'stateProfileId',profile_id::text,'stateVersion',version,'stateHash',state_hash,'grantId',to_jsonb(grant_id),'evaluation',jsonb_build_object('evaluationId',evaluation_id::text,'profileId',profile_id::text,'stateVersion',version,'stateHash',state_hash)));
-- Public identity cannot be rebound by updating the current pointer/envelope.
CREATE FUNCTION tastepolicy.guard_passport_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.passport_ref,NEW.user_id,NEW.profile_id,NEW.subject_ref) IS DISTINCT FROM ROW(OLD.passport_ref,OLD.user_id,OLD.profile_id,OLD.subject_ref) THEN RAISE EXCEPTION 'Immutable Passport subject mapping'; END IF; RETURN NEW; END $$;
CREATE TRIGGER immutable_passport_identity BEFORE UPDATE ON tastepolicy.taste_passports FOR EACH ROW EXECUTE FUNCTION tastepolicy.guard_passport_identity();
CREATE FUNCTION tastepolicy.purge_account_state() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 DELETE FROM tastepolicy.taste_profiles WHERE profile_id IN (SELECT profile_id FROM tastepolicy.platform_ownership WHERE user_id=OLD.id); RETURN OLD;
END $$;
CREATE TRIGGER purge_account BEFORE DELETE ON tastepolicy.platform_auth_user FOR EACH ROW EXECUTE FUNCTION tastepolicy.purge_account_state();
CREATE FUNCTION tastepolicy.purge_passport_state() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN DELETE FROM tastepolicy.taste_profiles WHERE profile_id=OLD.profile_id; RETURN NULL; END $$;
CREATE TRIGGER purge_passport AFTER DELETE ON tastepolicy.taste_passports FOR EACH ROW EXECUTE FUNCTION tastepolicy.purge_passport_state();
CREATE FUNCTION tastepolicy.guard_account_demo_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM tastepolicy.platform_ownership WHERE profile_id=NEW.profile_id) THEN RAISE EXCEPTION 'Account profile has no demo session'; END IF; RETURN NEW; END $$;
CREATE TRIGGER no_account_demo_session BEFORE INSERT OR UPDATE ON tastepolicy.demo_mutation_sessions FOR EACH ROW EXECUTE FUNCTION tastepolicy.guard_account_demo_session();
CREATE INDEX platform_session_user ON tastepolicy.platform_auth_session("userId");
CREATE INDEX platform_account_user ON tastepolicy.platform_auth_account("userId");
CREATE INDEX platform_grant_grantee ON tastepolicy.passport_access_grants(grantee_id);
CREATE FUNCTION tastepolicy.guard_platform_grant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.expires_at>(SELECT expires_at FROM tastepolicy.taste_passports WHERE passport_ref=NEW.passport_ref) THEN RAISE EXCEPTION 'Grant exceeds Passport retention'; END IF;RETURN NEW;END $$;
CREATE TRIGGER grant_retention BEFORE INSERT ON tastepolicy.passport_access_grants FOR EACH ROW EXECUTE FUNCTION tastepolicy.guard_platform_grant();
CREATE FUNCTION tastepolicy.guard_platform_ownership() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM tastepolicy.demo_mutation_sessions WHERE profile_id=NEW.profile_id) THEN RAISE EXCEPTION 'Explicit account state only; no demo claim';END IF;RETURN NEW;END $$;
CREATE TRIGGER no_demo_claim BEFORE INSERT ON tastepolicy.platform_ownership FOR EACH ROW EXECUTE FUNCTION tastepolicy.guard_platform_ownership();
CREATE TRIGGER immutable_account_ownership BEFORE UPDATE ON tastepolicy.platform_ownership FOR EACH ROW EXECUTE FUNCTION tastepolicy.immutable_snapshot();
CREATE FUNCTION tastepolicy.prevent_grant_resurrection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='passport_access_events' THEN
 IF EXISTS(SELECT 1 FROM tastepolicy.passport_access_grants WHERE grant_id=OLD.grant_id) THEN RAISE EXCEPTION 'Immutable grant revocation';END IF;
 ELSIF TG_TABLE_NAME='passport_access_grants' THEN
 IF EXISTS(SELECT 1 FROM tastepolicy.taste_passports WHERE passport_ref=OLD.passport_ref) AND EXISTS(SELECT 1 FROM tastepolicy.platform_auth_user WHERE id=OLD.grantee_id) THEN RAISE EXCEPTION 'Immutable consent grant'; END IF;
 ELSIF TG_TABLE_NAME='developer_credential_events' THEN
 IF EXISTS(SELECT 1 FROM tastepolicy.developer_credentials WHERE credential_id=OLD.credential_id) THEN RAISE EXCEPTION 'Immutable credential revocation';END IF;
 ELSE
 IF EXISTS(SELECT 1 FROM tastepolicy.platform_auth_user WHERE id=OLD.user_id) THEN RAISE EXCEPTION 'Immutable credential issue';END IF;
 END IF;RETURN NULL;END $$;
CREATE CONSTRAINT TRIGGER grant_not_resurrected AFTER DELETE ON tastepolicy.passport_access_grants DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tastepolicy.prevent_grant_resurrection();
CREATE CONSTRAINT TRIGGER grant_revocation_not_removed AFTER DELETE ON tastepolicy.passport_access_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tastepolicy.prevent_grant_resurrection();
CREATE CONSTRAINT TRIGGER credential_not_resurrected AFTER DELETE ON tastepolicy.developer_credentials DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tastepolicy.prevent_grant_resurrection();
CREATE CONSTRAINT TRIGGER credential_revocation_not_removed AFTER DELETE ON tastepolicy.developer_credential_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tastepolicy.prevent_grant_resurrection();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['platform_auth_user','platform_auth_session','platform_auth_account','platform_auth_verification','rateLimit','platform_ownership','taste_passports','passport_versions','passport_access_grants','passport_access_events','developer_credentials','developer_credential_events','platform_evaluations','platform_operations','passport_exports','platform_rate','account_deletion_records'] LOOP
 EXECUTE format('ALTER TABLE tastepolicy.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('REVOKE ALL ON tastepolicy.%I FROM PUBLIC',t);
 IF t IN ('passport_versions','passport_access_grants','passport_access_events','developer_credentials','developer_credential_events','platform_evaluations','platform_operations','passport_exports') THEN EXECUTE format('CREATE TRIGGER immutable_platform BEFORE UPDATE ON tastepolicy.%I FOR EACH ROW EXECUTE FUNCTION tastepolicy.immutable_snapshot()',t); END IF;
 END LOOP;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tastepolicy FROM PUBLIC;
COMMIT;
