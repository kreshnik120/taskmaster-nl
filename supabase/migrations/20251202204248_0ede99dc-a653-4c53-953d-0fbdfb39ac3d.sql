-- Add index for AI knowledge base queries (success patterns lookup)
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_base_category_occurrence 
ON ai_knowledge_base(category, occurrence_count DESC) 
WHERE deleted_at IS NULL;