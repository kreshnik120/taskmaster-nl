-- Voeg metadata kolom toe voor JSONB opslag
ALTER TABLE function_call_logs 
ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Maak user_id nullable voor system-level logging
ALTER TABLE function_call_logs 
ALTER COLUMN user_id DROP NOT NULL;

-- Voeg index toe voor efficiënte queries op metadata
CREATE INDEX IF NOT EXISTS idx_function_call_logs_metadata_call_type 
ON function_call_logs ((metadata->>'call_type'));

CREATE INDEX IF NOT EXISTS idx_function_call_logs_metadata_include_shared 
ON function_call_logs ((metadata->>'include_shared'));

-- Comment voor documentatie
COMMENT ON COLUMN function_call_logs.metadata IS 'JSONB metadata voor extended logging (call_type, include_shared, threshold, etc.)';