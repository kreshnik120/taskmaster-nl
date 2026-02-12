
-- A. Notities kolom
ALTER TABLE professional_availability ADD COLUMN IF NOT EXISTS opmerking TEXT;

-- B. Updated_at kolom + trigger
ALTER TABLE professional_availability ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TRIGGER update_professional_availability_updated_at
  BEFORE UPDATE ON professional_availability
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- C. Composite index voor week-queries
CREATE INDEX IF NOT EXISTS idx_pa_professional_date ON professional_availability(professional_id, date);

-- D. Realtime inschakelen
ALTER PUBLICATION supabase_realtime ADD TABLE professional_availability;
