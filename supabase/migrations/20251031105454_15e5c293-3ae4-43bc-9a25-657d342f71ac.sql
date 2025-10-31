-- FASE 1: AI Response Time Optimalisatie
-- Fix 1.4: Optimaliseer match_knowledge() functie

CREATE OR REPLACE FUNCTION public.match_knowledge(
  query_embedding vector,
  match_threshold double precision DEFAULT 0.75,  -- Verhoogd van 0.7 voor betere kwaliteit
  match_count integer DEFAULT 20,  -- Verlaagd van 50 voor snelheid
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
SET search_path TO 'public'
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
    ke.embedding IS NOT NULL  -- ✨ NIEUW: Skip NULL embeddings expliciet (performance boost)
    AND kb.deleted_at IS NULL
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
    AND (
      require_verified = false 
      OR kb.validation_status = 'verified'
    )
  ORDER BY ke.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;