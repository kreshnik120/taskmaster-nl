-- Disable database triggers (keeping them for backward compatibility)
ALTER TABLE ai_knowledge_base DISABLE TRIGGER generate_embedding_on_insert;
ALTER TABLE ai_knowledge_base DISABLE TRIGGER generate_embedding_on_update;

-- Add comment explaining why triggers are disabled
COMMENT ON TRIGGER generate_embedding_on_insert ON ai_knowledge_base IS 'Disabled: Using application-level embedding generation for better reliability and error handling';
COMMENT ON TRIGGER generate_embedding_on_update ON ai_knowledge_base IS 'Disabled: Using application-level embedding generation for better reliability and error handling';