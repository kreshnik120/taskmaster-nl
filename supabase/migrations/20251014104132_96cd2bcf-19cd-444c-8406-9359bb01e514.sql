
-- ACE Phase 1: Add Helpful/Harmful Tracking Columns
ALTER TABLE ai_knowledge_base 
  ADD COLUMN IF NOT EXISTS helpful_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS harmful_count INTEGER DEFAULT 0;

-- Create index for efficient pruning queries
CREATE INDEX IF NOT EXISTS idx_harmful_ratio 
  ON ai_knowledge_base ((harmful_count::float / NULLIF(helpful_count + harmful_count, 0))) 
  WHERE deleted_at IS NULL;

-- Add documentation comments
COMMENT ON COLUMN ai_knowledge_base.helpful_count IS 'Aantal keer dat deze kennis leidde tot positieve feedback (👍)';
COMMENT ON COLUMN ai_knowledge_base.harmful_count IS 'Aantal keer dat deze kennis leidde tot negatieve feedback (👎)';
