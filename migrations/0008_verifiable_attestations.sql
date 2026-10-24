BEGIN;
-- M9: additive. Status lists live in the database and every lease change moves
-- its status bit in the same transaction through one SQL function.
CREATE TABLE tastepolicy.attestation_status_lists (
 list_id integer PRIMARY KEY CHECK(list_id>0),
 bits integer NOT NULL CHECK(bits=2),
 size integer NOT NULL CHECK(size=131072),
 data bytea NOT NULL CHECK(length(data)=size*bits/8),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO tastepolicy.attestation_status_lists(list_id,bits,size,data) VALUES(1,2,131072,decode(repeat('00',32768),'hex'));
-- Indices are never reused, so a stale attestation can never point at another lease.
CREATE TABLE tastepolicy.attestation_status_used (
 list_id integer NOT NULL REFERENCES tastepolicy.attestation_status_lists(list_id),
 idx integer NOT NULL CHECK(idx>=0),
 PRIMARY KEY(list_id,idx)
);
CREATE TABLE tastepolicy.lease_status_entries (
 lease_ref text PRIMARY KEY REFERENCES tastepolicy.platform_leases(lease_ref) ON DELETE CASCADE,
 list_id integer NOT NULL,
 idx integer NOT NULL,
 FOREIGN KEY(list_id,idx) REFERENCES tastepolicy.attestation_status_used(list_id,idx)
);
CREATE TABLE tastepolicy.attestations (
 jti text PRIMARY KEY CHECK(length(jti) BETWEEN 8 AND 64),
 lease_ref text NOT NULL REFERENCES tastepolicy.platform_leases(lease_ref) ON DELETE CASCADE,
 audience text NOT NULL CHECK(length(audience) BETWEEN 1 AND 200),
 issued_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 holder_bound boolean NOT NULL,
 delegated_to text CHECK(delegated_to IS NULL OR delegated_to ~ '^[a-zA-Z0-9_-]{1,64}$')
);
CREATE INDEX attestations_lease ON tastepolicy.attestations(lease_ref);
CREATE TABLE tastepolicy.attestation_replays (
 jti text NOT NULL,
 audience text NOT NULL,
 first_seen timestamptz NOT NULL,
 PRIMARY KEY(jti,audience)
);
-- value: 0 VALID, 1 INVALID, 2 SUSPENDED. Entry 0 sits in the least significant bits of byte 0.
CREATE FUNCTION tastepolicy.set_status(p_list integer, p_idx integer, p_value integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE b integer := p_idx/4; s integer := (p_idx%4)*2; cur integer;
BEGIN
 IF p_value NOT BETWEEN 0 AND 2 THEN RAISE EXCEPTION 'status out of range'; END IF;
 UPDATE tastepolicy.attestation_status_lists SET
  data=set_byte(data,b,(get_byte(data,b) & ~(3<<s)) | (p_value<<s)), updated_at=now()
 WHERE list_id=p_list AND b<length(data);
 IF NOT FOUND THEN RAISE EXCEPTION 'status index out of range'; END IF;
END $$;
CREATE FUNCTION tastepolicy.lease_status_value(p_status text) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE p_status WHEN 'ACTIVE' THEN 0 WHEN 'SUSPENDED' THEN 2 ELSE 1 END $$;
CREATE FUNCTION tastepolicy.sync_lease_status() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e record;
BEGIN
 IF TG_OP='DELETE' THEN
  SELECT * INTO e FROM tastepolicy.lease_status_entries WHERE lease_ref=OLD.lease_ref;
  IF FOUND THEN PERFORM tastepolicy.set_status(e.list_id,e.idx,1); END IF;
  RETURN OLD;
 END IF;
 SELECT * INTO e FROM tastepolicy.lease_status_entries WHERE lease_ref=NEW.lease_ref;
 IF FOUND THEN PERFORM tastepolicy.set_status(e.list_id,e.idx,tastepolicy.lease_status_value(NEW.status)); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lease_status_sync AFTER UPDATE OF status ON tastepolicy.platform_leases FOR EACH ROW EXECUTE FUNCTION tastepolicy.sync_lease_status();
CREATE TRIGGER lease_status_sync_delete BEFORE DELETE ON tastepolicy.platform_leases FOR EACH ROW EXECUTE FUNCTION tastepolicy.sync_lease_status();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['attestation_status_lists','attestation_status_used','lease_status_entries','attestations','attestation_replays'] LOOP
  EXECUTE format('ALTER TABLE tastepolicy.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('REVOKE ALL ON tastepolicy.%I FROM PUBLIC',t);
 END LOOP;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tastepolicy FROM PUBLIC;
COMMIT;
