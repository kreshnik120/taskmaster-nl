-- ===========================================
-- UPDATE ALL match_knowledge() FUNCTIONS FOR SHARED KNOWLEDGE
-- ===========================================

-- Drop all existing versions first
DROP FUNCTION IF EXISTS public.match_knowledge(vector, double precision, integer, uuid);
DROP FUNCTION IF EXISTS public.match_knowledge(vector, double precision, integer, uuid, text[], uuid, text);
DROP FUNCTION IF EXISTS public.match_knowledge(vector, double precision, integer, uuid, text[], uuid, text, boolean);

-- Version 1: Simple match_knowledge with is_shared support
CREATE OR REPLACE FUNCTION public.match_knowledge(
  query_embedding vector,
  match_threshold double precision DEFAULT 0.7,
  match_count integer DEFAULT 50,
  filter_org_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  knowledge_id uuid,
  category text,
  key text,
  value jsonb,
  confidence_score numeric,
  similarity double precision
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    kb.id AS knowledge_id,
    kb.category,
    kb.key,
    kb.value,
    kb.confidence_score,
    1 - (ke.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_embeddings ke
  JOIN public.ai_knowledge_base kb ON kb.id = ke.knowledge_id
  WHERE 
    ke.embedding IS NOT NULL
    AND kb.deleted_at IS NULL
    AND (1 - (ke.embedding <=> query_embedding)) > match_threshold
    AND (
      -- Org filter OR shared knowledge
      (filter_org_id IS NULL OR kb.org_id = filter_org_id)
      OR kb.is_shared = true
    )
  ORDER BY ke.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$;

-- Version 2: Extended match_knowledge with role tags and jurisdiction
CREATE OR REPLACE FUNCTION public.match_knowledge(
  query_embedding vector,
  match_threshold double precision DEFAULT 0.7,
  match_count integer DEFAULT 50,
  filter_org_id uuid DEFAULT NULL::uuid,
  filter_role_tags text[] DEFAULT NULL::text[],
  filter_customer_id uuid DEFAULT NULL::uuid,
  filter_jurisdiction text DEFAULT 'NL'::text
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
  valid_to date
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    kb.valid_to
  FROM public.knowledge_embeddings ke
  JOIN public.ai_knowledge_base kb ON kb.id = ke.knowledge_id
  WHERE 
    ke.embedding IS NOT NULL
    AND kb.deleted_at IS NULL
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
      -- Org filter OR shared knowledge
      (filter_org_id IS NULL OR kb.org_id = filter_org_id)
      OR kb.is_shared = true
    )
  ORDER BY ke.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$;

-- Version 3: Full match_knowledge with verification and explicit include_shared
CREATE OR REPLACE FUNCTION public.match_knowledge(
  query_embedding vector,
  match_threshold double precision DEFAULT 0.75,
  match_count integer DEFAULT 20,
  filter_org_id uuid DEFAULT NULL::uuid,
  filter_role_tags text[] DEFAULT NULL::text[],
  filter_customer_id uuid DEFAULT NULL::uuid,
  filter_jurisdiction text DEFAULT 'NL'::text,
  require_verified boolean DEFAULT true,
  include_shared boolean DEFAULT true
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
  validation_status text,
  is_shared boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    kb.validation_status,
    kb.is_shared
  FROM public.knowledge_embeddings ke
  JOIN public.ai_knowledge_base kb ON kb.id = ke.knowledge_id
  WHERE 
    ke.embedding IS NOT NULL
    AND kb.deleted_at IS NULL
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
    AND (
      -- Org filter OR (include_shared AND is_shared)
      (filter_org_id IS NULL OR kb.org_id = filter_org_id)
      OR (include_shared AND kb.is_shared = true)
    )
  ORDER BY ke.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$;