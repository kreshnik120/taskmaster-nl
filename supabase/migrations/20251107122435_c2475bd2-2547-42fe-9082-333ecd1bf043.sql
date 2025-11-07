-- ============================================
-- FASE 1 & 2: AI QUALITY IMPROVEMENTS
-- Database Migrations voor Pre-Response Checks,
-- Semantic Retrieval, Response Validation & Entity Resolution
-- ============================================

-- 1. Entity Relationships Table
-- Voor entity disambiguation en relationship traversal
CREATE TABLE IF NOT EXISTS public.entity_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Entity details
  entity_id UUID REFERENCES public.ai_knowledge_base(id) ON DELETE CASCADE,
  entity_name TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- 'client', 'organization', 'professional', 'location', etc.
  
  -- Relationship details
  related_entity_id UUID REFERENCES public.ai_knowledge_base(id) ON DELETE CASCADE,
  related_entity_name TEXT NOT NULL,
  relationship_type TEXT NOT NULL, -- 'client_of', 'subsidiary_of', 'works_at', 'located_in', etc.
  
  -- Metadata
  confidence_score NUMERIC(3, 2) DEFAULT 0.8,
  source TEXT, -- 'kvk_api', 'manual', 'ai_inferred'
  valid_from DATE DEFAULT CURRENT_DATE,
  valid_to DATE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_entity_relationship UNIQUE(org_id, entity_name, related_entity_name, relationship_type)
);

-- Index voor snelle lookups
CREATE INDEX IF NOT EXISTS idx_entity_relationships_entity ON public.entity_relationships(entity_name, org_id);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_related ON public.entity_relationships(related_entity_name, org_id);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_type ON public.entity_relationships(relationship_type, org_id);

-- RLS policies
ALTER TABLE public.entity_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view entity relationships in their org"
  ON public.entity_relationships FOR SELECT
  USING (user_is_org_member(auth.uid(), org_id));

CREATE POLICY "Users can insert entity relationships in their org"
  ON public.entity_relationships FOR INSERT
  WITH CHECK (user_is_org_member(auth.uid(), org_id));

CREATE POLICY "Users can update entity relationships in their org"
  ON public.entity_relationships FOR UPDATE
  USING (user_is_org_member(auth.uid(), org_id));

-- 2. Response Validations Table
-- Log validation results voor monitoring
CREATE TABLE IF NOT EXISTS public.response_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Request context
  question TEXT NOT NULL,
  ai_response TEXT NOT NULL,
  knowledge_ids UUID[] DEFAULT '{}',
  
  -- Validation results
  validation_passed BOOLEAN NOT NULL,
  completeness_score NUMERIC(3, 2), -- 0.0-1.0
  accuracy_score NUMERIC(3, 2), -- 0.0-1.0
  coverage_score NUMERIC(3, 2), -- 0.0-1.0
  
  -- Issues detected
  missing_aspects TEXT[],
  contradictions_found TEXT[],
  unsourced_facts TEXT[],
  
  -- Performance
  validation_time_ms INTEGER,
  retry_attempted BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index voor analytics
CREATE INDEX IF NOT EXISTS idx_response_validations_org_created ON public.response_validations(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_response_validations_passed ON public.response_validations(validation_passed, org_id);

-- RLS policies
ALTER TABLE public.response_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view validations in their org"
  ON public.response_validations FOR SELECT
  USING (user_is_org_member(auth.uid(), org_id));

CREATE POLICY "Service role can insert validations"
  ON public.response_validations FOR INSERT
  WITH CHECK (true); -- Edge functions gebruiken service role

-- 3. Add temporal_context column to ai_knowledge_base
-- Voor time-aware knowledge filtering
ALTER TABLE public.ai_knowledge_base 
ADD COLUMN IF NOT EXISTS temporal_context JSONB DEFAULT '{}'::jsonb;

-- Index voor temporal queries
CREATE INDEX IF NOT EXISTS idx_knowledge_temporal ON public.ai_knowledge_base 
USING GIN (temporal_context) WHERE deleted_at IS NULL;

-- 4. Preflight Check Results Table (optioneel, voor debugging)
CREATE TABLE IF NOT EXISTS public.preflight_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  question TEXT NOT NULL,
  required_info_types TEXT[],
  available_info_types TEXT[],
  missing_info_types TEXT[],
  
  actions_triggered JSONB DEFAULT '[]'::jsonb,
  knowledge_fetched INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_preflight_checks_org_created ON public.preflight_checks(org_id, created_at DESC);

-- RLS
ALTER TABLE public.preflight_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view preflight checks in their org"
  ON public.preflight_checks FOR SELECT
  USING (user_is_org_member(auth.uid(), org_id));

CREATE POLICY "Service role can insert preflight checks"
  ON public.preflight_checks FOR INSERT
  WITH CHECK (true);

-- 5. Update function_call_logs to track new metrics
ALTER TABLE public.function_call_logs
ADD COLUMN IF NOT EXISTS preflight_incomplete_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS validation_failed_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS semantic_match_score NUMERIC(3, 2);

COMMENT ON COLUMN public.function_call_logs.preflight_incomplete_count IS 'Number of times preflight detected incomplete data';
COMMENT ON COLUMN public.function_call_logs.validation_failed_count IS 'Number of times response validation failed';
COMMENT ON COLUMN public.function_call_logs.semantic_match_score IS 'Average semantic similarity score for knowledge retrieval';

-- ============================================
-- Utility Functions
-- ============================================

-- Function: Get entity relationships for disambiguation
CREATE OR REPLACE FUNCTION public.get_entity_relationships(
  entity_name_param TEXT,
  org_id_param UUID,
  max_depth INTEGER DEFAULT 2
)
RETURNS TABLE (
  entity TEXT,
  related_entity TEXT,
  relationship TEXT,
  confidence NUMERIC,
  depth INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE relationship_tree AS (
    -- Base case: direct relationships
    SELECT 
      er.entity_name::TEXT,
      er.related_entity_name::TEXT,
      er.relationship_type::TEXT,
      er.confidence_score,
      1 as depth
    FROM public.entity_relationships er
    WHERE er.entity_name ILIKE entity_name_param
      AND er.org_id = org_id_param
      AND (er.valid_to IS NULL OR er.valid_to >= CURRENT_DATE)
    
    UNION
    
    -- Recursive case: indirect relationships
    SELECT 
      rt.entity::TEXT,
      er.related_entity_name::TEXT,
      er.relationship_type::TEXT,
      er.confidence_score,
      rt.depth + 1
    FROM relationship_tree rt
    JOIN public.entity_relationships er 
      ON er.entity_name = rt.related_entity
      AND er.org_id = org_id_param
      AND (er.valid_to IS NULL OR er.valid_to >= CURRENT_DATE)
    WHERE rt.depth < max_depth
  )
  SELECT * FROM relationship_tree
  ORDER BY depth, confidence_score DESC;
END;
$$;

-- ============================================
-- Success Message
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '✅ AI Quality Improvements migrations completed successfully';
  RAISE NOTICE '📊 New tables: entity_relationships, response_validations, preflight_checks';
  RAISE NOTICE '🔧 Updated: ai_knowledge_base (temporal_context), function_call_logs (metrics)';
  RAISE NOTICE '⚡ New function: get_entity_relationships()';
END $$;