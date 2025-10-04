-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Table: ai_response_cache (24h cache voor Q&A)
CREATE TABLE IF NOT EXISTS public.ai_response_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  question_hash text NOT NULL,
  question text NOT NULL,
  response text NOT NULL,
  knowledge_ids uuid[] NOT NULL DEFAULT '{}',
  hit_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '24 hours'),
  UNIQUE(org_id, question_hash)
);

CREATE INDEX idx_cache_org_hash ON public.ai_response_cache(org_id, question_hash);
CREATE INDEX idx_cache_expires ON public.ai_response_cache(expires_at);

-- Table: knowledge_embeddings (voor semantic search)
CREATE TABLE IF NOT EXISTS public.knowledge_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_id uuid NOT NULL REFERENCES public.ai_knowledge_base(id) ON DELETE CASCADE,
  embedding vector(768) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(knowledge_id)
);

CREATE INDEX idx_embeddings_knowledge ON public.knowledge_embeddings(knowledge_id);
CREATE INDEX idx_embeddings_vector ON public.knowledge_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Table: cache_analytics (monitoring)
CREATE TABLE IF NOT EXISTS public.cache_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  cache_hits integer NOT NULL DEFAULT 0,
  cache_misses integer NOT NULL DEFAULT 0,
  avg_query_time_ms integer NOT NULL DEFAULT 0,
  total_tokens_saved integer NOT NULL DEFAULT 0,
  total_cost_saved_eur numeric(10,4) NOT NULL DEFAULT 0,
  UNIQUE(org_id, date)
);

CREATE INDEX idx_analytics_org_date ON public.cache_analytics(org_id, date);

-- RPC Function: match_knowledge (semantic search)
CREATE OR REPLACE FUNCTION public.match_knowledge(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 50,
  filter_org_id uuid DEFAULT NULL
)
RETURNS TABLE (
  knowledge_id uuid,
  category text,
  key text,
  value jsonb,
  confidence_score numeric,
  similarity float
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
    1 - (ke.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_embeddings ke
  JOIN public.ai_knowledge_base kb ON kb.id = ke.knowledge_id
  WHERE 
    (filter_org_id IS NULL OR kb.org_id = filter_org_id)
    AND kb.deleted_at IS NULL
    AND (1 - (ke.embedding <=> query_embedding)) > match_threshold
  ORDER BY ke.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- RLS Policies voor ai_response_cache
ALTER TABLE public.ai_response_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read cache in their org"
ON public.ai_response_cache FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = ai_response_cache.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "System can manage cache"
ON public.ai_response_cache FOR ALL
USING (true)
WITH CHECK (true);

-- RLS Policies voor knowledge_embeddings
ALTER TABLE public.knowledge_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read embeddings in their org"
ON public.knowledge_embeddings FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ai_knowledge_base kb
    JOIN public.user_organizations uo ON uo.org_id = kb.org_id
    WHERE kb.id = knowledge_embeddings.knowledge_id
    AND uo.user_id = auth.uid()
  )
);

CREATE POLICY "System can manage embeddings"
ON public.knowledge_embeddings FOR ALL
USING (true)
WITH CHECK (true);

-- RLS Policies voor cache_analytics
ALTER TABLE public.cache_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view analytics"
ON public.cache_analytics FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin') 
  AND EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = cache_analytics.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "System can manage analytics"
ON public.cache_analytics FOR ALL
USING (true)
WITH CHECK (true);