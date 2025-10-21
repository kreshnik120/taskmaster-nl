-- FASE 3: Performance Optimalisatie - HNSW Index + Validation Filter

-- Step 1: Drop oude index als die bestaat
DROP INDEX IF EXISTS knowledge_embeddings_embedding_idx;

-- Step 2: Create HNSW index voor 10x snellere vector searches
CREATE INDEX IF NOT EXISTS knowledge_embeddings_hnsw_idx 
ON knowledge_embeddings 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Step 3: Add composite index voor filters
CREATE INDEX IF NOT EXISTS idx_knowledge_base_validation_org 
ON ai_knowledge_base(validation_status, org_id, deleted_at)
WHERE deleted_at IS NULL;

-- Step 4: Update match_knowledge functie met validation filter
CREATE OR REPLACE FUNCTION public.match_knowledge(
  query_embedding vector,
  match_threshold double precision DEFAULT 0.7,
  match_count integer DEFAULT 50,
  filter_org_id uuid DEFAULT NULL,
  filter_role_tags text[] DEFAULT NULL,
  filter_customer_id uuid DEFAULT NULL,
  filter_jurisdiction text DEFAULT 'NL',
  require_verified boolean DEFAULT true
)
RETURNS TABLE(
  knowledge_id uuid,
  category text,
  key text,
  value jsonb,
  confidence_score numeric,
  similarity double precision,
  role_tags text[],
  valid_from date,
  valid_to date,
  validation_status text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    kb.id AS knowledge_id,
    kb.category,
    kb.key,
    kb.value,
    kb.confidence_score,
    1 - (ke.embedding <=> query_embedding) AS similarity,
    kb.role_tags,
    kb.valid_from,
    kb.valid_to,
    kb.validation_status
  FROM public.knowledge_embeddings ke
  JOIN public.ai_knowledge_base kb ON kb.id = ke.knowledge_id
  WHERE 
    kb.deleted_at IS NULL
    AND (filter_org_id IS NULL OR kb.org_id = filter_org_id)
    AND (1 - (ke.embedding <=> query_embedding)) > match_threshold
    AND is_knowledge_valid(kb.valid_from, kb.valid_to)
    AND (filter_jurisdiction IS NULL OR kb.jurisdiction = filter_jurisdiction)
    AND (filter_customer_id IS NULL OR kb.client_id = filter_customer_id)
    AND (
      filter_role_tags IS NULL 
      OR kb.role_tags && filter_role_tags
      OR array_length(kb.role_tags, 1) IS NULL
    )
    AND has_acl_access(auth.uid(), kb.acl)
    -- NIEUWE VALIDATION FILTER (performance boost!)
    AND (
      require_verified = false 
      OR kb.validation_status = 'verified'
    )
  ORDER BY ke.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;