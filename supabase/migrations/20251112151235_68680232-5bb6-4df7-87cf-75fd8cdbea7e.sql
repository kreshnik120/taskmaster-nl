-- Create data_conflicts table for conflict tracking
CREATE TABLE IF NOT EXISTS public.data_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  existing_knowledge_id UUID REFERENCES public.ai_knowledge_base(id) ON DELETE SET NULL,
  conflicting_suggestion JSONB NOT NULL,
  conflict_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  resolution_status TEXT NOT NULL DEFAULT 'pending' CHECK (resolution_status IN ('pending', 'resolved', 'ignored', 'merged')),
  resolution_action TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.data_conflicts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for data_conflicts
CREATE POLICY "Org members can view conflicts in their org"
  ON public.data_conflicts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.org_id = data_conflicts.org_id
        AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "System can manage all conflicts"
  ON public.data_conflicts
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can manage conflicts"
  ON public.data_conflicts
  FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.org_id = data_conflicts.org_id
        AND user_organizations.user_id = auth.uid()
    )
  );

-- Performance indices for data_conflicts
CREATE INDEX idx_conflicts_org ON public.data_conflicts(org_id);
CREATE INDEX idx_conflicts_status ON public.data_conflicts(resolution_status) WHERE resolution_status = 'pending';
CREATE INDEX idx_conflicts_severity ON public.data_conflicts(severity);
CREATE INDEX idx_conflicts_created_at ON public.data_conflicts(created_at DESC);
CREATE INDEX idx_conflicts_knowledge ON public.data_conflicts(existing_knowledge_id) WHERE existing_knowledge_id IS NOT NULL;

-- Performance indices for business_intelligence (fix timeouts)
CREATE INDEX IF NOT EXISTS idx_bi_status_type ON public.business_intelligence(status, intelligence_type);
CREATE INDEX IF NOT EXISTS idx_bi_detected_at ON public.business_intelligence(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_bi_severity_status ON public.business_intelligence(severity, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_bi_org_status ON public.business_intelligence(org_id, status);

-- Performance indices for ai_learning_events
CREATE INDEX IF NOT EXISTS idx_learning_org_type ON public.ai_learning_events(org_id, event_type);
CREATE INDEX IF NOT EXISTS idx_learning_created_at ON public.ai_learning_events(created_at DESC);

-- Add updated_at trigger for data_conflicts
CREATE TRIGGER set_data_conflicts_updated_at
  BEFORE UPDATE ON public.data_conflicts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();