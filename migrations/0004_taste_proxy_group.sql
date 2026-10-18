BEGIN;
ALTER TABLE tastepolicy.taste_state_versions ADD UNIQUE(profile_id,version,state_hash);
ALTER TABLE tastepolicy.cultural_receipts ADD UNIQUE(profile_id,evaluation_id,version);
CREATE TABLE tastepolicy.taste_subjects (
 owner_profile_id uuid NOT NULL REFERENCES tastepolicy.taste_profiles ON DELETE CASCADE,
 subject_id uuid NOT NULL, subject_kind text NOT NULL CHECK(subject_kind IN ('SELF','PROXY')),
 state_profile_id uuid NOT NULL UNIQUE REFERENCES tastepolicy.taste_profiles ON DELETE CASCADE,
 data jsonb NOT NULL,
 PRIMARY KEY(owner_profile_id,subject_id), UNIQUE(owner_profile_id,subject_id,state_profile_id),
 CHECK((subject_kind='SELF' AND subject_id=owner_profile_id AND state_profile_id=owner_profile_id) OR (subject_kind='PROXY' AND subject_id<>owner_profile_id AND state_profile_id<>owner_profile_id))
);
CREATE UNIQUE INDEX one_self_subject ON tastepolicy.taste_subjects(owner_profile_id) WHERE subject_kind='SELF';
CREATE FUNCTION tastepolicy.validate_subject_profile() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.subject_kind='PROXY' AND (EXISTS(SELECT 1 FROM tastepolicy.demo_mutation_sessions WHERE profile_id=NEW.state_profile_id) OR (SELECT expires_at FROM tastepolicy.taste_profiles WHERE profile_id=NEW.state_profile_id)>(SELECT expires_at FROM tastepolicy.taste_profiles WHERE profile_id=NEW.owner_profile_id)) THEN RAISE EXCEPTION 'Invalid proxy profile'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER subject_profile BEFORE INSERT ON tastepolicy.taste_subjects FOR EACH ROW EXECUTE FUNCTION tastepolicy.validate_subject_profile();
CREATE FUNCTION tastepolicy.deny_proxy_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM tastepolicy.taste_subjects WHERE state_profile_id=NEW.profile_id AND subject_kind='PROXY') THEN RAISE EXCEPTION 'Proxy has no public session'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER no_proxy_session BEFORE INSERT OR UPDATE ON tastepolicy.demo_mutation_sessions FOR EACH ROW EXECUTE FUNCTION tastepolicy.deny_proxy_session();
CREATE TABLE tastepolicy.subject_permission_attestations (
 owner_profile_id uuid NOT NULL, subject_id uuid NOT NULL, attestation_id uuid NOT NULL,
 scopes text[] NOT NULL CHECK(scopes @> ARRAY['MODEL_MANAGEMENT','TASTE_EVALUATION'] AND scopes <@ ARRAY['MODEL_MANAGEMENT','TASTE_EVALUATION','GROUP_EVALUATION']),
 assurance text NOT NULL CHECK(assurance='USER_ATTESTED_PERMISSION'), expires_at timestamptz NOT NULL, data jsonb NOT NULL,
 PRIMARY KEY(owner_profile_id,subject_id), UNIQUE(owner_profile_id,subject_id,attestation_id),
 FOREIGN KEY(owner_profile_id,subject_id) REFERENCES tastepolicy.taste_subjects ON DELETE CASCADE
);
CREATE FUNCTION tastepolicy.permission_retention() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (SELECT subject_kind FROM tastepolicy.taste_subjects WHERE owner_profile_id=NEW.owner_profile_id AND subject_id=NEW.subject_id)<>'PROXY' THEN RAISE EXCEPTION 'Only proxy permission'; END IF;
 IF NEW.expires_at>(SELECT p.expires_at FROM tastepolicy.taste_subjects s JOIN tastepolicy.taste_profiles p ON p.profile_id=s.state_profile_id WHERE s.owner_profile_id=NEW.owner_profile_id AND s.subject_id=NEW.subject_id) THEN RAISE EXCEPTION 'Permission exceeds retention'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER permission_retention BEFORE INSERT ON tastepolicy.subject_permission_attestations FOR EACH ROW EXECUTE FUNCTION tastepolicy.permission_retention();
CREATE TABLE tastepolicy.subject_permission_events (
 owner_profile_id uuid NOT NULL, subject_id uuid NOT NULL, event_id uuid NOT NULL,
 attestation_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('PERMISSION_REVOKED','PROXY_DELETED')), data jsonb NOT NULL,
 PRIMARY KEY(owner_profile_id,event_id), UNIQUE(owner_profile_id,subject_id,kind),
 FOREIGN KEY(owner_profile_id,subject_id,attestation_id) REFERENCES tastepolicy.subject_permission_attestations(owner_profile_id,subject_id,attestation_id) ON DELETE CASCADE
);
CREATE TABLE tastepolicy.proxy_signal_provenance (
 owner_profile_id uuid NOT NULL, subject_id uuid NOT NULL, state_profile_id uuid NOT NULL,
 version integer NOT NULL, attestation_id uuid NOT NULL, data jsonb NOT NULL,
 PRIMARY KEY(owner_profile_id,subject_id,version),
 FOREIGN KEY(owner_profile_id,subject_id,state_profile_id) REFERENCES tastepolicy.taste_subjects(owner_profile_id,subject_id,state_profile_id) ON DELETE CASCADE,
 FOREIGN KEY(owner_profile_id,subject_id,attestation_id) REFERENCES tastepolicy.subject_permission_attestations(owner_profile_id,subject_id,attestation_id) ON DELETE CASCADE,
 FOREIGN KEY(state_profile_id,version) REFERENCES tastepolicy.taste_state_versions ON DELETE CASCADE
);
CREATE TABLE tastepolicy.subject_authorizations (
 owner_profile_id uuid NOT NULL, authorization_id uuid NOT NULL, subject_id uuid NOT NULL,
 state_profile_id uuid NOT NULL, version integer NOT NULL, state_hash text NOT NULL,
 candidate_id uuid NOT NULL, candidate_type text NOT NULL, context_hash text NOT NULL,
 decision text NOT NULL CHECK(decision IN ('ALLOW','ASK','REJECT','UNAVAILABLE')), data jsonb NOT NULL,
 PRIMARY KEY(owner_profile_id,authorization_id),
 UNIQUE(owner_profile_id,authorization_id,subject_id),
 UNIQUE(owner_profile_id,authorization_id,subject_id,state_profile_id,version,candidate_id,candidate_type,context_hash,decision),
 FOREIGN KEY(owner_profile_id,subject_id,state_profile_id) REFERENCES tastepolicy.taste_subjects(owner_profile_id,subject_id,state_profile_id) ON DELETE CASCADE,
 FOREIGN KEY(state_profile_id,version,state_hash) REFERENCES tastepolicy.taste_state_versions(profile_id,version,state_hash) ON DELETE CASCADE,
 FOREIGN KEY(state_profile_id,authorization_id,version) REFERENCES tastepolicy.cultural_receipts(profile_id,evaluation_id,version) ON DELETE CASCADE
);
CREATE TABLE tastepolicy.proxy_authorizations (
 owner_profile_id uuid NOT NULL, authorization_id uuid NOT NULL, subject_id uuid NOT NULL, attestation_id uuid NOT NULL, data jsonb NOT NULL,
 PRIMARY KEY(owner_profile_id,authorization_id),
 FOREIGN KEY(owner_profile_id,authorization_id,subject_id) REFERENCES tastepolicy.subject_authorizations(owner_profile_id,authorization_id,subject_id) ON DELETE CASCADE,
 FOREIGN KEY(owner_profile_id,subject_id,attestation_id) REFERENCES tastepolicy.subject_permission_attestations(owner_profile_id,subject_id,attestation_id) ON DELETE CASCADE
);
CREATE TABLE tastepolicy.taste_groups (
 owner_profile_id uuid NOT NULL REFERENCES tastepolicy.taste_profiles ON DELETE CASCADE,
 group_id uuid NOT NULL, current_version integer NOT NULL, data jsonb NOT NULL,
 PRIMARY KEY(owner_profile_id,group_id)
);
CREATE TABLE tastepolicy.taste_group_versions (
 owner_profile_id uuid NOT NULL, group_id uuid NOT NULL, version integer NOT NULL,
 parent_version integer, policy_id text NOT NULL CHECK(policy_id='UNANIMOUS_NO_VETO_V1'), data jsonb NOT NULL,
 PRIMARY KEY(owner_profile_id,group_id,version),
 CHECK((version=1 AND parent_version IS NULL) OR (version>1 AND parent_version IS NOT NULL AND parent_version=version-1)),
 FOREIGN KEY(owner_profile_id,group_id) REFERENCES tastepolicy.taste_groups ON DELETE CASCADE,
 FOREIGN KEY(owner_profile_id,group_id,parent_version) REFERENCES tastepolicy.taste_group_versions DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE tastepolicy.taste_groups ADD FOREIGN KEY(owner_profile_id,group_id,current_version) REFERENCES tastepolicy.taste_group_versions DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE tastepolicy.taste_group_members (
 owner_profile_id uuid NOT NULL, group_id uuid NOT NULL, version integer NOT NULL, subject_id uuid NOT NULL,
 PRIMARY KEY(owner_profile_id,group_id,version,subject_id),
 FOREIGN KEY(owner_profile_id,group_id,version) REFERENCES tastepolicy.taste_group_versions ON DELETE CASCADE,
 FOREIGN KEY(owner_profile_id,subject_id) REFERENCES tastepolicy.taste_subjects ON DELETE CASCADE
);
CREATE TABLE tastepolicy.taste_group_events (
 owner_profile_id uuid NOT NULL, group_id uuid NOT NULL, event_id uuid NOT NULL, kind text NOT NULL CHECK(kind='GROUP_DELETED'),
 PRIMARY KEY(owner_profile_id,group_id), FOREIGN KEY(owner_profile_id,group_id) REFERENCES tastepolicy.taste_groups ON DELETE CASCADE
);
CREATE TABLE tastepolicy.group_authorizations (
 owner_profile_id uuid NOT NULL, authorization_id uuid NOT NULL, group_id uuid NOT NULL, version integer NOT NULL,
 candidate_id uuid NOT NULL, candidate_type text NOT NULL, context_hash text NOT NULL, decision text NOT NULL CHECK(decision IN ('ALLOW','ASK','REJECT','UNAVAILABLE')), semantic_hash text NOT NULL, data jsonb NOT NULL,
 PRIMARY KEY(owner_profile_id,authorization_id),
 UNIQUE(owner_profile_id,authorization_id,group_id,version,candidate_id,candidate_type,context_hash),
 FOREIGN KEY(owner_profile_id,group_id,version) REFERENCES tastepolicy.taste_group_versions ON DELETE CASCADE
);
CREATE TABLE tastepolicy.group_member_authorizations (
 owner_profile_id uuid NOT NULL, group_authorization_id uuid NOT NULL, group_id uuid NOT NULL, version integer NOT NULL,
 subject_id uuid NOT NULL, state_profile_id uuid NOT NULL, state_version integer NOT NULL, authorization_id uuid NOT NULL,
 candidate_id uuid NOT NULL, candidate_type text NOT NULL, context_hash text NOT NULL, decision text NOT NULL, data jsonb NOT NULL,
 PRIMARY KEY(owner_profile_id,group_authorization_id,subject_id),
 FOREIGN KEY(owner_profile_id,group_authorization_id,group_id,version,candidate_id,candidate_type,context_hash) REFERENCES tastepolicy.group_authorizations(owner_profile_id,authorization_id,group_id,version,candidate_id,candidate_type,context_hash) ON DELETE CASCADE,
 FOREIGN KEY(owner_profile_id,group_id,version,subject_id) REFERENCES tastepolicy.taste_group_members ON DELETE CASCADE,
 FOREIGN KEY(owner_profile_id,authorization_id,subject_id,state_profile_id,state_version,candidate_id,candidate_type,context_hash,decision) REFERENCES tastepolicy.subject_authorizations(owner_profile_id,authorization_id,subject_id,state_profile_id,version,candidate_id,candidate_type,context_hash,decision) ON DELETE CASCADE
);
CREATE TABLE tastepolicy.subject_operations (
 owner_profile_id uuid NOT NULL REFERENCES tastepolicy.taste_profiles ON DELETE CASCADE,
 operation text NOT NULL, key text NOT NULL CHECK(length(key) BETWEEN 1 AND 80), payload_hash text NOT NULL, result jsonb NOT NULL,
 PRIMARY KEY(owner_profile_id,operation,key)
);
CREATE FUNCTION tastepolicy.validate_group_coverage() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE n integer; BEGIN
 IF TG_TABLE_NAME='taste_group_versions' OR TG_TABLE_NAME='taste_group_members' THEN
 IF NOT EXISTS(SELECT 1 FROM tastepolicy.taste_group_versions WHERE owner_profile_id=NEW.owner_profile_id AND group_id=NEW.group_id AND version=NEW.version) THEN RETURN NULL; END IF;
 SELECT count(*) INTO n FROM tastepolicy.taste_group_members WHERE owner_profile_id=NEW.owner_profile_id AND group_id=NEW.group_id AND version=NEW.version;
 IF n<2 OR n>5 THEN RAISE EXCEPTION 'Group requires 2 to 5 members'; END IF;
 ELSE
 IF NOT EXISTS(SELECT 1 FROM tastepolicy.group_authorizations WHERE owner_profile_id=NEW.owner_profile_id AND authorization_id=NEW.authorization_id) THEN RETURN NULL; END IF;
 SELECT count(*) INTO n FROM tastepolicy.group_member_authorizations WHERE owner_profile_id=NEW.owner_profile_id AND group_authorization_id=NEW.authorization_id;
 IF n<>(SELECT count(*) FROM tastepolicy.taste_group_members WHERE owner_profile_id=NEW.owner_profile_id AND group_id=NEW.group_id AND version=NEW.version) THEN RAISE EXCEPTION 'Incomplete group authorization'; END IF;
 END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER group_coverage AFTER INSERT ON tastepolicy.taste_group_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tastepolicy.validate_group_coverage();
CREATE CONSTRAINT TRIGGER member_coverage AFTER INSERT ON tastepolicy.taste_group_members DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tastepolicy.validate_group_coverage();
CREATE CONSTRAINT TRIGGER group_authorization_coverage AFTER INSERT ON tastepolicy.group_authorizations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tastepolicy.validate_group_coverage();
CREATE FUNCTION tastepolicy.member_delete_coverage() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE n integer; BEGIN
 IF TG_TABLE_NAME='taste_group_members' THEN
 IF EXISTS(SELECT 1 FROM tastepolicy.taste_group_versions WHERE owner_profile_id=OLD.owner_profile_id AND group_id=OLD.group_id AND version=OLD.version) THEN
 SELECT count(*) INTO n FROM tastepolicy.taste_group_members WHERE owner_profile_id=OLD.owner_profile_id AND group_id=OLD.group_id AND version=OLD.version;
 RAISE EXCEPTION 'Immutable group membership'; END IF;
 ELSE
 IF EXISTS(SELECT 1 FROM tastepolicy.group_authorizations WHERE owner_profile_id=OLD.owner_profile_id AND authorization_id=OLD.group_authorization_id) THEN RAISE EXCEPTION 'Immutable member authorization'; END IF;
 END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER deleted_group_member AFTER DELETE ON tastepolicy.taste_group_members DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tastepolicy.member_delete_coverage();
CREATE CONSTRAINT TRIGGER deleted_authorization_member AFTER DELETE ON tastepolicy.group_member_authorizations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tastepolicy.member_delete_coverage();
CREATE FUNCTION tastepolicy.subject_evidence_link() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE e jsonb; BEGIN
 SELECT data INTO e FROM tastepolicy.cultural_receipts WHERE profile_id=NEW.state_profile_id AND evaluation_id=NEW.authorization_id AND version=NEW.version;
 IF e IS NULL OR e->>'stateHash'<>NEW.state_hash OR e->'action'->'candidate'->>'id'<>NEW.candidate_id::text OR e->'action'->'candidate'->>'type'<>NEW.candidate_type OR e->'decision'->>'outcome'<>NEW.decision THEN RAISE EXCEPTION 'Subject evidence mismatch'; END IF;
 IF NEW.data->'context' IS DISTINCT FROM e->'context' THEN RAISE EXCEPTION 'Subject context mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER subject_evidence BEFORE INSERT ON tastepolicy.subject_authorizations FOR EACH ROW EXECUTE FUNCTION tastepolicy.subject_evidence_link();
CREATE FUNCTION tastepolicy.purge_owned_proxy_profiles() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 DELETE FROM tastepolicy.taste_profiles WHERE profile_id IN (SELECT state_profile_id FROM tastepolicy.taste_subjects WHERE owner_profile_id=OLD.profile_id AND subject_kind='PROXY'); RETURN OLD;
END $$;
CREATE TRIGGER purge_proxy_profiles BEFORE DELETE ON tastepolicy.taste_profiles FOR EACH ROW EXECUTE FUNCTION tastepolicy.purge_owned_proxy_profiles();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['taste_subjects','subject_permission_attestations','subject_permission_events','proxy_signal_provenance','subject_authorizations','proxy_authorizations','taste_groups','taste_group_versions','taste_group_members','taste_group_events','group_authorizations','group_member_authorizations','subject_operations'] LOOP
 EXECUTE format('ALTER TABLE tastepolicy.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON tastepolicy.%I FROM PUBLIC',t);
 IF t<>'taste_groups' THEN EXECUTE format('CREATE TRIGGER immutable_m5 BEFORE UPDATE ON tastepolicy.%I FOR EACH ROW EXECUTE FUNCTION tastepolicy.immutable_snapshot()',t); END IF;
 END LOOP;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tastepolicy FROM PUBLIC;
COMMIT;
