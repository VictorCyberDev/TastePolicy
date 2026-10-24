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
-- One entry per attestation, so two relying parties cannot link proofs of one lease by index.
CREATE TABLE tastepolicy.lease_status_entries (
 list_id integer NOT NULL,
 idx integer NOT NULL,
 lease_ref text NOT NULL REFERENCES tastepolicy.platform_leases(lease_ref) ON DELETE CASCADE,
 PRIMARY KEY(list_id,idx),
 FOREIGN KEY(list_id,idx) REFERENCES tastepolicy.attestation_status_used(list_id,idx)
);
CREATE INDEX lease_status_entries_lease ON tastepolicy.lease_status_entries(lease_ref);
CREATE TABLE tastepolicy.attestations (
 jti text PRIMARY KEY CHECK(length(jti) BETWEEN 8 AND 64),
 lease_ref text NOT NULL REFERENCES tastepolicy.platform_leases(lease_ref) ON DELETE CASCADE,
 audience text NOT NULL CHECK(length(audience) BETWEEN 1 AND 200),
 issued_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 holder_bound boolean NOT NULL,
 delegated_to text CHECK(delegated_to IS NULL OR delegated_to ~ '^[a-zA-Z0-9_-]{1,64}$'),
 -- The authority epoch this proof belongs to (ADR 0020).
 epoch integer NOT NULL CHECK(epoch>=1),
 epoch_commitment text NOT NULL CHECK(epoch_commitment ~ '^[a-f0-9]{64}$')
);
CREATE INDEX attestations_lease ON tastepolicy.attestations(lease_ref);
CREATE TABLE tastepolicy.attestation_replays (
 jti text NOT NULL,
 audience text NOT NULL,
 first_seen timestamptz NOT NULL,
 PRIMARY KEY(jti,audience)
);
-- value: 0 VALID, 1 INVALID. (2 SUSPENDED exists in the encoding for other issuers; this one never writes it.)
-- INVALID is permanent: an entry can never leave 1, so an ended epoch cannot come back.
CREATE FUNCTION tastepolicy.set_status(p_list integer, p_idx integer, p_value integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE b integer := p_idx/4; s integer := (p_idx%4)*2; cur integer;
BEGIN
 IF p_value NOT BETWEEN 0 AND 1 THEN RAISE EXCEPTION 'status out of range'; END IF;
 SELECT (get_byte(data,b)>>s)&3 INTO cur FROM tastepolicy.attestation_status_lists WHERE list_id=p_list AND b<length(data);
 IF NOT FOUND THEN RAISE EXCEPTION 'status index out of range'; END IF;
 IF cur=1 AND p_value<>1 THEN RAISE EXCEPTION 'invalid status is permanent'; END IF;
 UPDATE tastepolicy.attestation_status_lists SET
  data=set_byte(data,b,(get_byte(data,b) & ~(3<<s)) | (p_value<<s)), updated_at=now()
 WHERE list_id=p_list;
END $$;
-- Leaving ACTIVE ends the authority epoch: every proof issued so far becomes
-- permanently INVALID. Returning to ACTIVE (a resume after a fresh ALLOW) starts
-- a new epoch and touches no existing entry; new proofs get new entries.
CREATE FUNCTION tastepolicy.sync_lease_status() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e record;
BEGIN
 IF TG_OP='DELETE' OR NEW.status<>'ACTIVE' THEN
  FOR e IN SELECT list_id,idx FROM tastepolicy.lease_status_entries WHERE lease_ref=OLD.lease_ref ORDER BY list_id,idx LOOP
   PERFORM tastepolicy.set_status(e.list_id,e.idx,1);
  END LOOP;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
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
