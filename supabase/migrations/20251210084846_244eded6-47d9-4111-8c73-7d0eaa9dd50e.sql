-- Create RPC function to get knowledge items without embeddings
-- This replaces the broken NOT IN query that exceeded URL length limits

CREATE OR REPLACE FUNCTION public.get_knowledge_without_embeddings(batch_limit int DEFAULT 25)
RETURNS TABLE(
  id uuid, 
  category text, 
  usage_count int, 
  source_type text,
  original_text text,
  value jsonb,
  confidence_score numeric
) 
LANGUAGE sql 
STABLE 
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    kb.id, 
    kb.category, 
    kb.usage_count, 
    kb.source_type,
    kb.original_text,
    kb.value,
    kb.confidence_score
  FROM ai_knowledge_base kb
  LEFT JOIN knowledge_embeddings ke ON kb.id = ke.knowledge_id
  WHERE ke.id IS NULL 
    AND kb.deleted_at IS NULL
  ORDER BY 
    -- Critical categories first
    CASE 
      WHEN kb.category IN ('zzp', 'klanten', 'tarieven', 'wetgeving', 'procedures') THEN 0 
      ELSE 1 
    END,
    -- Then by usage count (highest first)
    kb.usage_count DESC NULLS LAST,
    -- Then by confidence score
    kb.confidence_score DESC NULLS LAST,
    -- Finally by creation date
    kb.created_at ASC
  LIMIT batch_limit;
$$;