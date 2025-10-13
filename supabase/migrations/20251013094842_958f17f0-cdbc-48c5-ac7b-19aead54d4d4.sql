-- FASE 1: Database Opschoning - Verwijder duplicate indexes
-- Drop ivfflat index (behoud betere HNSW index)
DROP INDEX IF EXISTS public.idx_embeddings_vector;

-- Drop dubbele knowledge_id index (behoud unieke constraint)
DROP INDEX IF EXISTS public.idx_embeddings_knowledge;