-- LAAG 3.1: Verwijder broken database triggers en function voor embeddings
-- Gebruik CASCADE om ook afhankelijke triggers te verwijderen

DROP TRIGGER IF EXISTS generate_embedding_on_insert ON ai_knowledge_base;
DROP TRIGGER IF EXISTS generate_embedding_on_update ON ai_knowledge_base;
DROP TRIGGER IF EXISTS auto_generate_embeddings ON ai_knowledge_base;
DROP FUNCTION IF EXISTS queue_embedding_generation() CASCADE;