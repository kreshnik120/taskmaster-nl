-- =====================================================
-- FASE 1: HUMAN REVIEW QUEUE (COMPLETE)
-- Voorkomt automatische afwijzingen bij twijfelgevallen
-- =====================================================

-- 1. Human Review Queue tabel
CREATE TABLE public.human_review_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.professional_applications(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  
  -- Review type en context
  review_type TEXT NOT NULL CHECK (review_type IN ('low_confidence_rejection', 'data_conflict', 'must_have_fail', 'manual_escalation', 'document_verification')),
  escalation_reason TEXT NOT NULL,
  
  -- AI recommendation
  ai_recommendation TEXT CHECK (ai_recommendation IN ('proceed', 'reject', 'needs_info', 'interview')),
  ai_confidence NUMERIC(3,2) CHECK (ai_confidence >= 0 AND ai_confidence <= 1),
  ai_reasoning JSONB,
  
  -- Review assignment
  assigned_to UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ,
  
  -- Review outcome
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_review', 'completed', 'expired')),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  decision TEXT CHECK (decision IN ('approve', 'reject', 'needs_more_info', 'defer')),
  review_notes TEXT,
  override_reason TEXT,
  
  -- Metadata
  priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique index om duplicate active reviews te voorkomen
CREATE UNIQUE INDEX idx_human_review_unique_active 
ON public.human_review_queue(application_id, review_type) 
WHERE status IN ('pending', 'assigned', 'in_review');

-- Indexes voor performance
CREATE INDEX idx_human_review_queue_status ON public.human_review_queue(status) WHERE status IN ('pending', 'assigned', 'in_review');
CREATE INDEX idx_human_review_queue_org ON public.human_review_queue(org_id);
CREATE INDEX idx_human_review_queue_assigned ON public.human_review_queue(assigned_to) WHERE status = 'assigned';
CREATE INDEX idx_human_review_queue_priority ON public.human_review_queue(priority DESC, created_at ASC) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.human_review_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view reviews for their org"
ON public.human_review_queue FOR SELECT
USING (
  org_id IN (
    SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can create reviews for their org"
ON public.human_review_queue FOR INSERT
WITH CHECK (
  org_id IN (
    SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update reviews in their org"
ON public.human_review_queue FOR UPDATE
USING (
  org_id IN (
    SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid()
  )
);

-- Service role policy
CREATE POLICY "Service role can manage all reviews"
ON public.human_review_queue FOR ALL
USING (true)
WITH CHECK (true);

-- Trigger voor updated_at
CREATE TRIGGER update_human_review_queue_updated_at
BEFORE UPDATE ON public.human_review_queue
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Kolommen toevoegen aan professional_applications voor review blocking
ALTER TABLE public.professional_applications 
ADD COLUMN IF NOT EXISTS pending_human_review BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_review_id UUID;

-- 3. Functie om review te creëren bij low-confidence afwijzing
CREATE OR REPLACE FUNCTION public.create_human_review_on_low_confidence()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_confidence NUMERIC;
  v_review_id UUID;
BEGIN
  -- Alleen triggeren bij stage change naar 'afgewezen'
  IF NEW.pipeline_stage = 'afgewezen' AND (OLD.pipeline_stage IS NULL OR OLD.pipeline_stage != 'afgewezen') THEN
    
    -- Haal org_id op
    v_org_id := NEW.org_id;
    
    -- Check confidence score (uit extracted_data)
    v_confidence := COALESCE(
      (NEW.extracted_data->>'overall_confidence')::NUMERIC,
      (NEW.extracted_data->>'confidence_score')::NUMERIC,
      0.5
    );
    
    -- Als confidence < 0.7, blokkeer afwijzing en maak review aan
    IF v_confidence < 0.7 THEN
      -- Creëer review item
      INSERT INTO public.human_review_queue (
        application_id,
        org_id,
        review_type,
        escalation_reason,
        ai_recommendation,
        ai_confidence,
        ai_reasoning,
        priority,
        due_date
      ) VALUES (
        NEW.id,
        v_org_id,
        'low_confidence_rejection',
        'AI afwijzing met confidence ' || ROUND(v_confidence * 100) || '% - vereist menselijke beoordeling',
        'reject',
        v_confidence,
        jsonb_build_object(
          'original_stage', OLD.pipeline_stage,
          'extracted_data_summary', NEW.extracted_data,
          'completeness_score', NEW.completeness_score
        ),
        CASE 
          WHEN v_confidence < 0.4 THEN 3
          WHEN v_confidence < 0.6 THEN 5
          ELSE 7
        END,
        NOW() + INTERVAL '3 days'
      ) RETURNING id INTO v_review_id;
      
      -- Blokkeer de afwijzing
      NEW.pipeline_stage := COALESCE(OLD.pipeline_stage, 'screening');
      NEW.pending_human_review := true;
      NEW.last_review_id := v_review_id;
      
      -- Log event
      INSERT INTO public.system_events (event_type, event_data, org_id)
      VALUES (
        'human_review_created',
        jsonb_build_object(
          'application_id', NEW.id,
          'review_id', v_review_id,
          'reason', 'low_confidence_rejection',
          'blocked_stage', 'afgewezen',
          'confidence', v_confidence
        ),
        v_org_id
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Trigger voor low-confidence review
DROP TRIGGER IF EXISTS trigger_human_review_on_rejection ON public.professional_applications;
CREATE TRIGGER trigger_human_review_on_rejection
BEFORE UPDATE ON public.professional_applications
FOR EACH ROW
WHEN (NEW.pipeline_stage = 'afgewezen')
EXECUTE FUNCTION public.create_human_review_on_low_confidence();

-- 5. Functie om review te verwerken
CREATE OR REPLACE FUNCTION public.complete_human_review(
  p_review_id UUID,
  p_decision TEXT,
  p_notes TEXT DEFAULT NULL,
  p_override_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_review RECORD;
  v_new_stage TEXT;
BEGIN
  SELECT * INTO v_review FROM public.human_review_queue WHERE id = p_review_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Review not found');
  END IF;
  
  IF v_review.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Review already completed');
  END IF;
  
  v_new_stage := CASE p_decision
    WHEN 'approve' THEN 'screening'
    WHEN 'reject' THEN 'afgewezen'
    WHEN 'needs_more_info' THEN 'intake_verstuurd'
    WHEN 'defer' THEN COALESCE(v_review.ai_reasoning->>'original_stage', 'screening')
    ELSE 'screening'
  END;
  
  UPDATE public.human_review_queue
  SET 
    status = 'completed',
    reviewed_at = NOW(),
    reviewed_by = auth.uid(),
    decision = p_decision,
    review_notes = p_notes,
    override_reason = p_override_reason,
    updated_at = NOW()
  WHERE id = p_review_id;
  
  UPDATE public.professional_applications
  SET 
    pending_human_review = false,
    pipeline_stage = v_new_stage,
    updated_at = NOW()
  WHERE id = v_review.application_id;
  
  INSERT INTO public.application_stage_audit (
    application_id,
    from_stage,
    to_stage,
    performed_by,
    reason,
    metadata
  ) VALUES (
    v_review.application_id,
    COALESCE(v_review.ai_reasoning->>'original_stage', 'unknown'),
    v_new_stage,
    auth.uid(),
    'Human review: ' || p_decision,
    jsonb_build_object(
      'review_id', p_review_id,
      'ai_recommendation', v_review.ai_recommendation,
      'ai_confidence', v_review.ai_confidence,
      'override_reason', p_override_reason
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'review_id', p_review_id,
    'decision', p_decision,
    'new_stage', v_new_stage
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. View voor pending reviews met application details
CREATE OR REPLACE VIEW public.pending_reviews_with_details AS
SELECT 
  hrq.*,
  COALESCE(pa.extracted_data->>'naam', split_part(pa.email_from, '@', 1)) as candidate_name,
  pa.email_from as candidate_email,
  pa.extracted_data->>'functie_niveau' as functie_niveau,
  pa.completeness_score,
  pa.pipeline_stage as current_stage,
  pa.created_at as application_created_at
FROM public.human_review_queue hrq
JOIN public.professional_applications pa ON hrq.application_id = pa.id
WHERE hrq.status IN ('pending', 'assigned', 'in_review')
ORDER BY hrq.priority ASC, hrq.created_at ASC;