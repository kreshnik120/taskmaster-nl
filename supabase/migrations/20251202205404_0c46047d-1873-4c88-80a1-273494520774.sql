
-- Create AI recommendation audit trail table
CREATE TABLE public.ai_recommendation_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID,
  recommendation_type TEXT NOT NULL, -- 'match_suggestion', 'ai_badge_display', 'proactive_notification'
  entity_type TEXT NOT NULL, -- 'professional', 'application', 'client', 'sublocation'
  entity_id UUID,
  recommendation_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  match_score NUMERIC(5,2),
  ai_confidence NUMERIC(3,2),
  user_action TEXT, -- 'viewed', 'accepted', 'rejected', 'ignored'
  action_taken_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_recommendation_audit ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own org recommendations"
  ON public.ai_recommendation_audit
  FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert recommendations"
  ON public.ai_recommendation_audit
  FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Index for performance
CREATE INDEX idx_ai_recommendation_audit_org_created 
  ON public.ai_recommendation_audit(org_id, created_at DESC);

CREATE INDEX idx_ai_recommendation_audit_type 
  ON public.ai_recommendation_audit(recommendation_type, created_at DESC);

-- Add seed evaluations with diverse data
-- First, let's check if we need to create some test assignments for evaluation seeding
INSERT INTO assignment_evaluations (assignment_id, rating, would_rehire, feedback, evaluator_id)
SELECT 
  a.id,
  CASE 
    WHEN random() < 0.3 THEN 3
    WHEN random() < 0.6 THEN 4
    ELSE 5
  END as rating,
  random() > 0.2 as would_rehire,
  CASE 
    WHEN random() < 0.3 THEN 'Goede communicatie en professionele houding'
    WHEN random() < 0.6 THEN 'Betrouwbaar en flexibel, past goed in team'
    ELSE 'Uitstekende match, zeer tevreden over samenwerking'
  END as feedback,
  NULL as evaluator_id
FROM assignments a
WHERE NOT EXISTS (
  SELECT 1 FROM assignment_evaluations ae WHERE ae.assignment_id = a.id
)
LIMIT 8;
