-- Fase 3A: Sollicitatie-Taak Koppeling Database Schema

-- Add application_id column to tasks table for linking tasks to applications
ALTER TABLE public.tasks 
ADD COLUMN application_id uuid REFERENCES public.professional_applications(id) ON DELETE SET NULL;

-- Add recruitment_action_type for categorizing recruitment tasks
ALTER TABLE public.tasks 
ADD COLUMN recruitment_action_type text CHECK (recruitment_action_type IN ('call', 'interview', 'contract', 'reference_check', 'custom'));

-- Create index for fast queries on application_id
CREATE INDEX idx_tasks_application_id ON public.tasks(application_id);

-- Fase 3B: AI-Driven Action Suggestions Trigger

-- Function to notify on pipeline stage change
CREATE OR REPLACE FUNCTION public.notify_pipeline_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert system event for AI processing
  INSERT INTO public.system_events (
    org_id,
    user_id,
    event_type,
    entity_type,
    entity_id,
    event_data,
    metadata
  ) VALUES (
    NEW.org_id,
    COALESCE(auth.uid(), NEW.updated_at::text::uuid),
    'application_stage_changed',
    'professional_applications',
    NEW.id,
    jsonb_build_object(
      'application_id', NEW.id,
      'professional_id', NEW.professional_id,
      'email_from', NEW.email_from,
      'old_stage', OLD.pipeline_stage,
      'new_stage', NEW.pipeline_stage,
      'completeness_score', NEW.completeness_score,
      'missing_info', NEW.missing_info,
      'extracted_data', NEW.extracted_data
    ),
    jsonb_build_object(
      'trigger', 'pipeline_stage_change',
      'requires_action_suggestion', true
    )
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger on professional_applications pipeline_stage changes
DROP TRIGGER IF EXISTS on_pipeline_stage_change ON public.professional_applications;
CREATE TRIGGER on_pipeline_stage_change
  AFTER UPDATE OF pipeline_stage ON public.professional_applications
  FOR EACH ROW
  WHEN (OLD.pipeline_stage IS DISTINCT FROM NEW.pipeline_stage)
  EXECUTE FUNCTION public.notify_pipeline_stage_change();

-- Test Data Cleanup: Remove test applications
DELETE FROM public.professional_applications 
WHERE email_from IN ('applicant@example.com', 'pronto.zorg@hotmail.com');