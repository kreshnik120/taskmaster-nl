-- Add columns to ai_meta_patterns for tracking application
ALTER TABLE ai_meta_patterns 
ADD COLUMN IF NOT EXISTS items_affected INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_applied_at TIMESTAMPTZ;

-- Index for faster queries on unapplied patterns
CREATE INDEX IF NOT EXISTS idx_meta_patterns_unapplied 
ON ai_meta_patterns(applied_at, confidence) 
WHERE applied_at IS NULL;

-- Index for high-confidence patterns
CREATE INDEX IF NOT EXISTS idx_meta_patterns_high_confidence 
ON ai_meta_patterns(confidence, occurrences) 
WHERE confidence >= 0.85 AND applied_at IS NULL;