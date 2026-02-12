ALTER TABLE diensten ADD COLUMN lock_version INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION increment_lock_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.lock_version := OLD.lock_version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_diensten_lock_version
  BEFORE UPDATE ON diensten
  FOR EACH ROW
  EXECUTE FUNCTION increment_lock_version();