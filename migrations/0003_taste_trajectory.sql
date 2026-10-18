BEGIN;
CREATE TABLE tastepolicy.trajectory_intents (
 profile_id uuid NOT NULL, trajectory_id uuid NOT NULL, state_version integer NOT NULL,
 signal_id uuid NOT NULL, target_id uuid NOT NULL, domain text NOT NULL CHECK(domain IN ('brand','destination','place')),
 tolerance text NOT NULL CHECK(tolerance IN ('CONSERVATIVE','BALANCED','OPEN')),
 key text NOT NULL CHECK(length(key) BETWEEN 1 AND 80), payload_hash text NOT NULL CHECK(length(payload_hash)=64), data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
 PRIMARY KEY(profile_id,trajectory_id), UNIQUE(profile_id,key),
 FOREIGN KEY(profile_id,state_version,signal_id) REFERENCES tastepolicy.taste_signals(profile_id,version,signal_id) ON DELETE CASCADE
);
CREATE TABLE tastepolicy.trajectory_generations (
 profile_id uuid NOT NULL, trajectory_id uuid NOT NULL, generation_id uuid NOT NULL, state_version integer NOT NULL,
 breadth text NOT NULL CHECK(breadth IN ('STRICT','MODERATE','BROAD')),
 key text NOT NULL CHECK(length(key) BETWEEN 1 AND 80), payload_hash text NOT NULL CHECK(length(payload_hash)=64), semantic_hash text NOT NULL CHECK(length(semantic_hash)=64), data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
 PRIMARY KEY(profile_id,generation_id), UNIQUE(profile_id,key), UNIQUE(profile_id,trajectory_id,generation_id,state_version),
 FOREIGN KEY(profile_id,trajectory_id) REFERENCES tastepolicy.trajectory_intents ON DELETE CASCADE,
 FOREIGN KEY(profile_id,state_version) REFERENCES tastepolicy.taste_state_versions ON DELETE CASCADE
);
CREATE TABLE tastepolicy.trajectory_candidates (
 profile_id uuid NOT NULL, trajectory_id uuid NOT NULL, generation_id uuid NOT NULL, state_version integer NOT NULL, candidate_id uuid NOT NULL,
 support integer NOT NULL CHECK(support BETWEEN 1 AND 5), position integer NOT NULL CHECK(position BETWEEN 1 AND 40), data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
 PRIMARY KEY(profile_id,generation_id,candidate_id), UNIQUE(profile_id,generation_id,position),
 FOREIGN KEY(profile_id,trajectory_id,generation_id,state_version) REFERENCES tastepolicy.trajectory_generations(profile_id,trajectory_id,generation_id,state_version) ON DELETE CASCADE
);
CREATE TABLE tastepolicy.trajectory_events (
 profile_id uuid NOT NULL, trajectory_id uuid NOT NULL, event_id uuid NOT NULL, state_version integer NOT NULL,
 generation_id uuid, candidate_id uuid, evaluation_id uuid, clarification_id uuid,
 kind text NOT NULL CHECK(kind IN ('TRAJECTORY_FEEDBACK','TRAJECTORY_STOPPED','STEP_AUTHORIZED','TARGET_SELECTED')),
 key text NOT NULL CHECK(length(key) BETWEEN 1 AND 80), payload_hash text NOT NULL CHECK(length(payload_hash)=64), data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
 PRIMARY KEY(profile_id,event_id), UNIQUE(profile_id,key),
 CHECK((kind IN ('STEP_AUTHORIZED','TARGET_SELECTED') AND evaluation_id IS NOT NULL AND candidate_id IS NOT NULL) OR (kind IN ('TRAJECTORY_FEEDBACK','TRAJECTORY_STOPPED') AND evaluation_id IS NULL AND candidate_id IS NULL AND clarification_id IS NULL)),
 CHECK(kind<>'STEP_AUTHORIZED' OR generation_id IS NOT NULL),
 CHECK(candidate_id IS NULL OR evaluation_id IS NOT NULL),
 CHECK(clarification_id IS NULL OR evaluation_id IS NOT NULL),
 FOREIGN KEY(profile_id,trajectory_id) REFERENCES tastepolicy.trajectory_intents ON DELETE CASCADE,
 FOREIGN KEY(profile_id,state_version) REFERENCES tastepolicy.taste_state_versions ON DELETE CASCADE,
 FOREIGN KEY(profile_id,trajectory_id,generation_id,state_version) REFERENCES tastepolicy.trajectory_generations(profile_id,trajectory_id,generation_id,state_version) ON DELETE CASCADE,
 FOREIGN KEY(profile_id,generation_id,candidate_id) REFERENCES tastepolicy.trajectory_candidates ON DELETE CASCADE,
 FOREIGN KEY(profile_id,evaluation_id,state_version) REFERENCES tastepolicy.cultural_receipts(profile_id,evaluation_id,version) ON DELETE CASCADE,
 FOREIGN KEY(profile_id,evaluation_id,state_version,clarification_id) REFERENCES tastepolicy.clarification_records(profile_id,evaluation_id,state_version,clarification_id) ON DELETE CASCADE
);
CREATE INDEX trajectory_generation_owner ON tastepolicy.trajectory_generations(profile_id,trajectory_id);
CREATE INDEX trajectory_event_owner ON tastepolicy.trajectory_events(profile_id,trajectory_id);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['trajectory_intents','trajectory_generations','trajectory_candidates','trajectory_events'] LOOP
 EXECUTE format('ALTER TABLE tastepolicy.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON tastepolicy.%I FROM PUBLIC',t);
 EXECUTE format('CREATE TRIGGER immutable_trajectory BEFORE UPDATE ON tastepolicy.%I FOR EACH ROW EXECUTE FUNCTION tastepolicy.immutable_snapshot()',t);
 END LOOP;
END $$;
COMMIT;
