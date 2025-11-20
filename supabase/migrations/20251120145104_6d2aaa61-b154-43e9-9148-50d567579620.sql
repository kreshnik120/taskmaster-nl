-- Voeg unique constraint toe om toekomstige duplicaten te voorkomen
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_unique_key_active 
ON ai_knowledge_base (key, org_id) 
WHERE deleted_at IS NULL;