-- ============================================
-- FASE 1.2: Deduplicator State Tracking
-- Doel: Incremental processing voor 10x snellere runs
-- ============================================

-- State tabel voor incremental processing
CREATE TABLE IF NOT EXISTS public.deduplicator_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  last_run_at TIMESTAMPTZ DEFAULT NOW(),
  last_processed_id UUID,
  items_checked INTEGER DEFAULT 0,
  duplicates_found INTEGER DEFAULT 0,
  total_merged_lifetime INTEGER DEFAULT 0,
  avg_run_duration_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id)
);

-- Enable RLS
ALTER TABLE public.deduplicator_state ENABLE ROW LEVEL SECURITY;

-- RLS Policies (alleen service role)
CREATE POLICY "Service role only" ON public.deduplicator_state
  FOR ALL USING (auth.role() = 'service_role');

-- Index voor snelle lookups
CREATE INDEX IF NOT EXISTS idx_deduplicator_state_org_id 
ON public.deduplicator_state(org_id);

-- Voeg index toe op ai_knowledge_base voor incremental queries
CREATE INDEX IF NOT EXISTS idx_knowledge_base_updated_at 
ON public.ai_knowledge_base(org_id, updated_at DESC) 
WHERE deleted_at IS NULL;