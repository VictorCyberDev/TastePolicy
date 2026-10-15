BEGIN;
CREATE SCHEMA tastepolicy;
REVOKE ALL ON SCHEMA tastepolicy FROM PUBLIC;
CREATE TABLE tastepolicy.taste_profiles (
 profile_id uuid PRIMARY KEY, current_version integer NOT NULL CHECK(current_version>=0), expires_at timestamptz NOT NULL, data jsonb NOT NULL
);
CREATE TABLE tastepolicy.taste_state_versions (
 profile_id uuid NOT NULL REFERENCES tastepolicy.taste_profiles ON DELETE CASCADE,
 version integer NOT NULL CHECK(version>=0), parent_version integer, mutation_id uuid, state_hash text NOT NULL CHECK(length(state_hash)=64), data jsonb NOT NULL,
 PRIMARY KEY(profile_id,version), CHECK ((version=0 AND parent_version IS NULL) OR parent_version=version-1),
 FOREIGN KEY(profile_id,parent_version) REFERENCES tastepolicy.taste_state_versions DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE tastepolicy.taste_profiles ADD FOREIGN KEY(profile_id,current_version) REFERENCES tastepolicy.taste_state_versions DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE tastepolicy.taste_signals (
 profile_id uuid NOT NULL, version integer NOT NULL, signal_id uuid NOT NULL, data jsonb NOT NULL,
 PRIMARY KEY(profile_id,version,signal_id), FOREIGN KEY(profile_id,version) REFERENCES tastepolicy.taste_state_versions ON DELETE CASCADE
);
CREATE TABLE tastepolicy.feedback_events (
 event_id uuid PRIMARY KEY, profile_id uuid NOT NULL, version integer NOT NULL, data jsonb NOT NULL,
 UNIQUE(profile_id,event_id), FOREIGN KEY(profile_id,version) REFERENCES tastepolicy.taste_state_versions ON DELETE CASCADE
);
CREATE TABLE tastepolicy.mutation_records (
 profile_id uuid NOT NULL, key text NOT NULL CHECK(length(key) BETWEEN 1 AND 80), mutation_id uuid NOT NULL, version integer NOT NULL, payload_hash text NOT NULL CHECK(length(payload_hash)=64), result jsonb NOT NULL,
 PRIMARY KEY(profile_id,key), UNIQUE(profile_id,mutation_id), UNIQUE(profile_id,mutation_id,version), FOREIGN KEY(profile_id,version) REFERENCES tastepolicy.taste_state_versions ON DELETE CASCADE
);
ALTER TABLE tastepolicy.taste_state_versions ADD FOREIGN KEY(profile_id,mutation_id,version) REFERENCES tastepolicy.mutation_records(profile_id,mutation_id,version) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE tastepolicy.decision_contexts (
 context_id uuid PRIMARY KEY, profile_id uuid NOT NULL, version integer NOT NULL, data jsonb NOT NULL,
 UNIQUE(profile_id,context_id), FOREIGN KEY(profile_id,version) REFERENCES tastepolicy.taste_state_versions ON DELETE CASCADE
);
CREATE TABLE tastepolicy.agent_proposals (
 proposal_id uuid PRIMARY KEY, profile_id uuid NOT NULL, version integer NOT NULL, context_id uuid NOT NULL, agent_id text NOT NULL CHECK(length(agent_id) BETWEEN 1 AND 64), data jsonb NOT NULL,
 UNIQUE(profile_id,proposal_id), FOREIGN KEY(profile_id,version) REFERENCES tastepolicy.taste_state_versions ON DELETE CASCADE,
 FOREIGN KEY(profile_id,context_id) REFERENCES tastepolicy.decision_contexts(profile_id,context_id) ON DELETE CASCADE
);
CREATE TABLE tastepolicy.provider_evidence_bundles (
 bundle_id uuid PRIMARY KEY, profile_id uuid NOT NULL, version integer NOT NULL, data jsonb NOT NULL,
 UNIQUE(profile_id,bundle_id), FOREIGN KEY(profile_id,version) REFERENCES tastepolicy.taste_state_versions ON DELETE CASCADE
);
CREATE TABLE tastepolicy.provider_evidence_items (
 bundle_id uuid NOT NULL REFERENCES tastepolicy.provider_evidence_bundles ON DELETE CASCADE, item_id text NOT NULL, data jsonb NOT NULL,
 PRIMARY KEY(bundle_id,item_id)
);
CREATE TABLE tastepolicy.cultural_receipts (
 evaluation_id uuid PRIMARY KEY, profile_id uuid NOT NULL, version integer NOT NULL, proposal_id uuid NOT NULL, bundle_id uuid, data jsonb NOT NULL,
 FOREIGN KEY(profile_id,version) REFERENCES tastepolicy.taste_state_versions ON DELETE CASCADE,
 FOREIGN KEY(profile_id,proposal_id) REFERENCES tastepolicy.agent_proposals(profile_id,proposal_id) ON DELETE CASCADE,
 FOREIGN KEY(profile_id,bundle_id) REFERENCES tastepolicy.provider_evidence_bundles(profile_id,bundle_id) ON DELETE CASCADE
);
CREATE TABLE tastepolicy.demo_mutation_sessions (
 token_hash text PRIMARY KEY CHECK(length(token_hash)=64), profile_id uuid NOT NULL REFERENCES tastepolicy.taste_profiles ON DELETE CASCADE, expires_at timestamptz NOT NULL, mutations integer NOT NULL DEFAULT 0 CHECK(mutations BETWEEN 0 AND 100)
);
CREATE INDEX profile_expiry ON tastepolicy.taste_profiles(expires_at);
CREATE INDEX receipt_profile_version ON tastepolicy.cultural_receipts(profile_id,version);
CREATE INDEX feedback_profile ON tastepolicy.feedback_events(profile_id);
CREATE FUNCTION tastepolicy.immutable_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable snapshot'; END $$;
CREATE TRIGGER immutable_version BEFORE UPDATE ON tastepolicy.taste_state_versions FOR EACH ROW EXECUTE FUNCTION tastepolicy.immutable_snapshot();
CREATE TRIGGER immutable_signal BEFORE UPDATE ON tastepolicy.taste_signals FOR EACH ROW EXECUTE FUNCTION tastepolicy.immutable_snapshot();
CREATE TRIGGER immutable_receipt BEFORE UPDATE ON tastepolicy.cultural_receipts FOR EACH ROW EXECUTE FUNCTION tastepolicy.immutable_snapshot();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['taste_profiles','taste_state_versions','taste_signals','feedback_events','mutation_records','decision_contexts','agent_proposals','provider_evidence_bundles','provider_evidence_items','cultural_receipts','demo_mutation_sessions'] LOOP
 EXECUTE format('ALTER TABLE tastepolicy.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON tastepolicy.%I FROM PUBLIC',t);
 END LOOP;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tastepolicy FROM PUBLIC;
COMMIT;
