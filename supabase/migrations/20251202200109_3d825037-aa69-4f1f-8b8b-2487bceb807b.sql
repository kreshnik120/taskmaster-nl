-- Create assignment_evaluations table for placement feedback
CREATE TABLE public.assignment_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,
  would_rehire BOOLEAN DEFAULT true,
  evaluator_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure only one evaluation per assignment
  UNIQUE(assignment_id)
);

-- Enable RLS
ALTER TABLE public.assignment_evaluations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Org members can view evaluations"
ON public.assignment_evaluations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM assignments a
    JOIN professionals p ON p.id = a.professional_id
    JOIN user_organizations uo ON uo.org_id = p.org_id
    WHERE a.id = assignment_evaluations.assignment_id
    AND uo.user_id = auth.uid()
  )
);

CREATE POLICY "Admins and managers can create evaluations"
ON public.assignment_evaluations
FOR INSERT
WITH CHECK (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  AND evaluator_id = auth.uid()
);

CREATE POLICY "Admins and managers can update evaluations"
ON public.assignment_evaluations
FOR UPDATE
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

-- Trigger to log evaluation creation to system_events for AI learning
CREATE OR REPLACE FUNCTION public.log_assignment_evaluation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_match_score NUMERIC;
BEGIN
  -- Get org_id and match_score from assignment
  SELECT p.org_id, a.ai_match_score
  INTO v_org_id, v_match_score
  FROM assignments a
  JOIN professionals p ON p.id = a.professional_id
  WHERE a.id = NEW.assignment_id;

  INSERT INTO public.system_events (
    org_id,
    user_id,
    event_type,
    entity_type,
    entity_id,
    event_data,
    metadata
  ) VALUES (
    v_org_id,
    NEW.evaluator_id,
    'assignment_evaluation_created',
    'assignment_evaluation',
    NEW.id,
    jsonb_build_object(
      'assignment_id', NEW.assignment_id,
      'rating', NEW.rating,
      'would_rehire', NEW.would_rehire,
      'has_feedback', NEW.feedback IS NOT NULL AND NEW.feedback != ''
    ),
    jsonb_build_object(
      'match_score', v_match_score,
      'rating_vs_match_correlation', CASE 
        WHEN v_match_score IS NOT NULL THEN NEW.rating - (v_match_score / 20)::INTEGER
        ELSE NULL
      END
    )
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_log_assignment_evaluation
AFTER INSERT ON public.assignment_evaluations
FOR EACH ROW
EXECUTE FUNCTION public.log_assignment_evaluation();