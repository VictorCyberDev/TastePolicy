BEGIN;
-- M8: additive lease tables. Nothing in 0001-0006 is altered.
CREATE TABLE tastepolicy.platform_leases (
 lease_ref text PRIMARY KEY CHECK(lease_ref ~ '^tl_[a-f0-9]{48}$'),
 passport_ref text NOT NULL REFERENCES tastepolicy.taste_passports(passport_ref) ON DELETE CASCADE,
 owner_id text NOT NULL,
 actor_id text NOT NULL REFERENCES tastepolicy.platform_auth_user(id) ON DELETE CASCADE,
 grant_id uuid,
 evaluation_ref text NOT NULL REFERENCES tastepolicy.platform_evaluations(evaluation_ref) ON DELETE CASCADE,
 agent_id text NOT NULL CHECK(agent_id ~ '^[a-zA-Z0-9_-]{1,64}$'),
 candidate_id text NOT NULL CHECK(length(candidate_id) BETWEEN 1 AND 80),
 context_key text NOT NULL CHECK(context_key ~ '^[a-zA-Z0-9_-]{1,64}$'),
 permitted text[] NOT NULL CHECK(cardinality(permitted)>0 AND permitted <@ ARRAY['recommend','add_to_draft']),
 status text NOT NULL CHECK(status IN ('ASK_PENDING','ACTIVE','SUSPENDED','DECLINED','REVOKED','EXPIRED','RELEASED')),
 rev integer NOT NULL CHECK(rev>0),
 issued_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 checkpoint_due_at timestamptz NOT NULL,
 data jsonb NOT NULL,
 CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '24 hours'),
 CHECK(owner_id<>'')
);
CREATE UNIQUE INDEX one_live_lease ON tastepolicy.platform_leases(passport_ref,actor_id,agent_id,candidate_id,context_key) WHERE status IN ('ASK_PENDING','ACTIVE','SUSPENDED');
CREATE INDEX lease_owner_status ON tastepolicy.platform_leases(passport_ref,status);
CREATE TABLE tastepolicy.lease_events (
 lease_ref text NOT NULL REFERENCES tastepolicy.platform_leases(lease_ref) ON DELETE CASCADE,
 seq integer NOT NULL CHECK(seq>0),
 kind text NOT NULL,
 at timestamptz NOT NULL,
 actor text NOT NULL CHECK(actor IN ('AGENT','OWNER','SYSTEM')),
 data jsonb NOT NULL,
 PRIMARY KEY(lease_ref,seq)
);
CREATE TRIGGER immutable_lease_events BEFORE UPDATE ON tastepolicy.lease_events FOR EACH ROW EXECUTE FUNCTION tastepolicy.immutable_snapshot();
CREATE FUNCTION tastepolicy.guard_platform_lease() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.lease_ref,NEW.passport_ref,NEW.owner_id,NEW.actor_id,NEW.grant_id,NEW.evaluation_ref,NEW.agent_id,NEW.candidate_id,NEW.context_key,NEW.permitted,NEW.issued_at) IS DISTINCT FROM ROW(OLD.lease_ref,OLD.passport_ref,OLD.owner_id,OLD.actor_id,OLD.grant_id,OLD.evaluation_ref,OLD.agent_id,OLD.candidate_id,OLD.context_key,OLD.permitted,OLD.issued_at) THEN RAISE EXCEPTION 'Immutable lease identity'; END IF;
 IF OLD.status IN ('DECLINED','REVOKED','EXPIRED','RELEASED') THEN RAISE EXCEPTION 'Terminal lease'; END IF;
 IF NEW.rev<>OLD.rev+1 THEN RAISE EXCEPTION 'Lease revision must advance by one'; END IF;
 IF NEW.expires_at>OLD.expires_at THEN RAISE EXCEPTION 'A lease cannot be extended'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER lease_guard BEFORE UPDATE ON tastepolicy.platform_leases FOR EACH ROW EXECUTE FUNCTION tastepolicy.guard_platform_lease();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['platform_leases','lease_events'] LOOP
  EXECUTE format('ALTER TABLE tastepolicy.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('REVOKE ALL ON tastepolicy.%I FROM PUBLIC',t);
 END LOOP;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tastepolicy FROM PUBLIC;
COMMIT;
