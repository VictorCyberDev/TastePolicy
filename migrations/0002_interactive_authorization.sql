BEGIN;
ALTER TABLE tastepolicy.cultural_receipts ADD CONSTRAINT evaluation_owned_version UNIQUE(profile_id,evaluation_id,version);
CREATE TABLE tastepolicy.clarification_records (
 clarification_id uuid PRIMARY KEY,
 profile_id uuid NOT NULL, evaluation_id uuid NOT NULL, state_version integer NOT NULL CHECK(state_version>=0), parent_id uuid,
 factor_kind text NOT NULL CHECK(factor_kind IN ('PRICE_REQUIRED','PRICE_CURRENCY_REQUIRED','CULTURAL_BORDERLINE')),
 plan jsonb NOT NULL CHECK(jsonb_typeof(plan)='object'), answer jsonb NOT NULL CHECK(jsonb_typeof(answer)='object'), result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 80), payload_hash text NOT NULL CHECK(length(payload_hash)=64), created_at timestamptz NOT NULL,
 UNIQUE(profile_id,idempotency_key), UNIQUE(profile_id,evaluation_id,state_version,clarification_id),
 CHECK(parent_id IS DISTINCT FROM clarification_id),
 FOREIGN KEY(profile_id,evaluation_id,state_version) REFERENCES tastepolicy.cultural_receipts(profile_id,evaluation_id,version) ON DELETE CASCADE,
 FOREIGN KEY(profile_id,evaluation_id,state_version,parent_id) REFERENCES tastepolicy.clarification_records(profile_id,evaluation_id,state_version,clarification_id) ON DELETE CASCADE
);
CREATE TABLE tastepolicy.repair_records (
 repair_id uuid PRIMARY KEY, profile_id uuid NOT NULL, evaluation_id uuid NOT NULL, state_version integer NOT NULL CHECK(state_version>=0), verification_id uuid,
 status text NOT NULL CHECK(status IN ('REPAIR_AVAILABLE','NO_VERIFIED_REPAIR_WITHIN_BOUND','NO_VERIFIABLE_REPAIR','UNAVAILABLE','STALE')),
 preserved_rules jsonb NOT NULL CHECK(jsonb_typeof(preserved_rules)='array'), change_set jsonb NOT NULL CHECK(jsonb_typeof(change_set)='array'), result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 80), payload_hash text NOT NULL CHECK(length(payload_hash)=64), created_at timestamptz NOT NULL,
 UNIQUE(profile_id,idempotency_key), CHECK(verification_id IS DISTINCT FROM evaluation_id), CHECK(status<>'REPAIR_AVAILABLE' OR verification_id IS NOT NULL),
 FOREIGN KEY(profile_id,evaluation_id,state_version) REFERENCES tastepolicy.cultural_receipts(profile_id,evaluation_id,version) ON DELETE CASCADE,
 FOREIGN KEY(profile_id,verification_id,state_version) REFERENCES tastepolicy.cultural_receipts(profile_id,evaluation_id,version) ON DELETE CASCADE
);
CREATE INDEX clarification_root ON tastepolicy.clarification_records(profile_id,evaluation_id,state_version);
CREATE INDEX repair_root ON tastepolicy.repair_records(profile_id,evaluation_id,state_version);
ALTER TABLE tastepolicy.clarification_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE tastepolicy.repair_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tastepolicy.clarification_records,tastepolicy.repair_records FROM PUBLIC;
CREATE TRIGGER immutable_clarification BEFORE UPDATE ON tastepolicy.clarification_records FOR EACH ROW EXECUTE FUNCTION tastepolicy.immutable_snapshot();
CREATE TRIGGER immutable_repair BEFORE UPDATE ON tastepolicy.repair_records FOR EACH ROW EXECUTE FUNCTION tastepolicy.immutable_snapshot();
COMMIT;
