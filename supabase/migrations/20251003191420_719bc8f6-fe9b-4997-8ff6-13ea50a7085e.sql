-- Sprint 3: Version Tracking & Rollback System

-- Create versions table for tracking all changes to knowledge base
CREATE TABLE IF NOT EXISTS public.ai_knowledge_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_id UUID NOT NULL REFERENCES public.ai_knowledge_base(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  
  -- Snapshot of the knowledge item at this version
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  confidence_score NUMERIC DEFAULT 0.5,
  
  -- Change metadata
  change_type TEXT NOT NULL CHECK (change_type IN ('created', 'updated', 'deleted', 'restored', 'auto_resolved', 'ai_suggested')),
  changed_by UUID REFERENCES auth.users(id),
  change_reason TEXT,
  
  -- Context about the change
  ai_action_context JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure version numbers are sequential per knowledge item
  UNIQUE(knowledge_id, version_number)
);

-- Index for efficient version lookups
CREATE INDEX idx_knowledge_versions_knowledge_id ON public.ai_knowledge_versions(knowledge_id, version_number DESC);
CREATE INDEX idx_knowledge_versions_created_at ON public.ai_knowledge_versions(created_at DESC);

-- Enable RLS
ALTER TABLE public.ai_knowledge_versions ENABLE ROW LEVEL SECURITY;

-- RLS policies for versions
CREATE POLICY "Users can view versions in their org"
  ON public.ai_knowledge_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_knowledge_base kb
      JOIN public.user_organizations uo ON uo.org_id = kb.org_id
      WHERE kb.id = ai_knowledge_versions.knowledge_id
        AND uo.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert versions"
  ON public.ai_knowledge_versions
  FOR INSERT
  WITH CHECK (true);

-- Function to create version snapshot
CREATE OR REPLACE FUNCTION public.create_knowledge_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_version INTEGER;
BEGIN
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 
  INTO next_version
  FROM public.ai_knowledge_versions
  WHERE knowledge_id = NEW.id;
  
  -- Create version snapshot
  INSERT INTO public.ai_knowledge_versions (
    knowledge_id,
    version_number,
    category,
    key,
    value,
    confidence_score,
    change_type,
    changed_by,
    change_reason,
    ai_action_context
  ) VALUES (
    NEW.id,
    next_version,
    NEW.category,
    NEW.key,
    NEW.value,
    NEW.confidence_score,
    CASE 
      WHEN TG_OP = 'INSERT' THEN 'created'
      WHEN TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'deleted'
      WHEN TG_OP = 'UPDATE' AND OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN 'restored'
      ELSE 'updated'
    END,
    auth.uid(),
    current_setting('app.change_reason', true),
    '{}'::jsonb
  );
  
  RETURN NEW;
END;
$$;

-- Trigger to auto-create versions
CREATE TRIGGER trigger_create_knowledge_version
  AFTER INSERT OR UPDATE ON public.ai_knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION public.create_knowledge_version();

-- Add review metadata to ai_knowledge_base
ALTER TABLE public.ai_knowledge_base 
ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS auto_reviewed_at TIMESTAMPTZ;

-- Performance tracking table
CREATE TABLE IF NOT EXISTS public.ai_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  
  -- Metric type
  metric_type TEXT NOT NULL CHECK (metric_type IN (
    'conflict_detection_accuracy',
    'auto_resolve_success_rate', 
    'suggestion_acceptance_rate',
    'false_positive_rate',
    'processing_time_ms'
  )),
  
  -- Metric value
  value NUMERIC NOT NULL,
  sample_size INTEGER DEFAULT 1,
  
  -- Time period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- Additional context
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Ensure one metric per type per org per period
  UNIQUE(org_id, metric_type, period_start)
);

-- Index for metrics queries
CREATE INDEX idx_performance_metrics_org_type ON public.ai_performance_metrics(org_id, metric_type, period_start DESC);

-- Enable RLS
ALTER TABLE public.ai_performance_metrics ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Org members can view their metrics"
  ON public.ai_performance_metrics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE org_id = ai_performance_metrics.org_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "System can manage metrics"
  ON public.ai_performance_metrics
  FOR ALL
  USING (true)
  WITH CHECK (true);