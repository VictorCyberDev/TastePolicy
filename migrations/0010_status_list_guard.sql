BEGIN;
-- Final reconciliation: defence in depth for "INVALID is permanent". Only
-- set_status may change a status list's data. set_status marks its own
-- transaction; any other UPDATE of the packed data (a future bug or migration)
-- is refused, so an ended epoch cannot be resurrected by a direct write.
CREATE OR REPLACE FUNCTION tastepolicy.set_status(p_list integer, p_idx integer, p_value integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE b integer := p_idx/4; s integer := (p_idx%4)*2; cur integer;
BEGIN
 IF p_value NOT BETWEEN 0 AND 1 THEN RAISE EXCEPTION 'status out of range'; END IF;
 SELECT (get_byte(data,b)>>s)&3 INTO cur FROM tastepolicy.attestation_status_lists WHERE list_id=p_list AND b<length(data);
 IF NOT FOUND THEN RAISE EXCEPTION 'status index out of range'; END IF;
 IF cur=1 AND p_value<>1 THEN RAISE EXCEPTION 'invalid status is permanent'; END IF;
 PERFORM set_config('tastepolicy.in_set_status','1',true);
 UPDATE tastepolicy.attestation_status_lists SET
  data=set_byte(data,b,(get_byte(data,b) & ~(3<<s)) | (p_value<<s)), updated_at=now()
 WHERE list_id=p_list;
 PERFORM set_config('tastepolicy.in_set_status','',true);
END $$;
CREATE FUNCTION tastepolicy.guard_status_list_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.data IS DISTINCT FROM OLD.data AND coalesce(current_setting('tastepolicy.in_set_status',true),'')<>'1' THEN
  RAISE EXCEPTION 'Status lists change only through set_status';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER status_list_guard BEFORE UPDATE ON tastepolicy.attestation_status_lists FOR EACH ROW EXECUTE FUNCTION tastepolicy.guard_status_list_write();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tastepolicy FROM PUBLIC;
COMMIT;
