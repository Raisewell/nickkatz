-- Enforce the DiscoveryRun status machine at the database level, not just
-- in application code. Valid transitions:
--   QUEUED -> RUNNING | FAILED
--   RUNNING -> AWAITING_APPROVAL | FAILED
--   AWAITING_APPROVAL -> APPROVED | FAILED
--   APPROVED -> COMPLETE | FAILED
--   COMPLETE, FAILED -> (terminal, no further transitions)
-- INSERTs are always allowed regardless of initial status.

CREATE OR REPLACE FUNCTION enforce_discovery_run_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."status" IS DISTINCT FROM NEW."status" THEN
    IF NOT (
      (OLD."status" = 'QUEUED' AND NEW."status" IN ('RUNNING', 'FAILED')) OR
      (OLD."status" = 'RUNNING' AND NEW."status" IN ('AWAITING_APPROVAL', 'FAILED')) OR
      (OLD."status" = 'AWAITING_APPROVAL' AND NEW."status" IN ('APPROVED', 'FAILED')) OR
      (OLD."status" = 'APPROVED' AND NEW."status" IN ('COMPLETE', 'FAILED'))
    ) THEN
      RAISE EXCEPTION 'Invalid discovery_runs status transition: % -> %', OLD."status", NEW."status";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER discovery_run_status_transition
  BEFORE UPDATE ON "discovery_runs"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_discovery_run_status_transition();
