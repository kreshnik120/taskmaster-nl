-- Add soft delete columns to ai_knowledge_base
ALTER TABLE ai_knowledge_base
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text,
  ADD COLUMN IF NOT EXISTS deletion_reason jsonb;

-- Add index for performance (querying non-deleted items)
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_base_deleted_at 
  ON ai_knowledge_base(deleted_at) 
  WHERE deleted_at IS NULL;

-- Add index for admin restore UI (recent AI-deleted items)
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_base_ai_deleted 
  ON ai_knowledge_base(deleted_by, deleted_at) 
  WHERE deleted_by = 'AI_AUTO_RESOLVE';