-- =====================================================
-- FASE 2: Database Migration - Recruitment Flow Gate Logic
-- Fixes EMREX trigger, adds welcome_email_sent_at, updates auto interview trigger
-- =====================================================

-- 1. Add welcome_email_sent_at column for tracking
ALTER TABLE public.professional_applications 
ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ;

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_applications_welcome_sent 
ON public.professional_applications(welcome_email_sent_at) 
WHERE welcome_email_sent_at IS NOT NULL;

-- 2. Update EMREX trigger to only fire when candidate has interacted
CREATE OR REPLACE FUNCTION public.trigger_emrex_invitation_on_screening()
RETURNS TRIGGER AS $$
BEGIN
  -- GATE 1: Alleen triggeren bij echte 'screening' transitie (NIET bij intake_verstuurd)
  IF NEW.pipeline_stage = 'screening' 
     AND (OLD.pipeline_stage IS NULL OR OLD.pipeline_stage NOT IN ('screening', 'interview', 'goedgekeurd', 'geplaatst'))
     AND NEW.diploma_validation_status = 'missing' THEN
    
    -- GATE 2: Kandidaat moet gereageerd hebben OF completeness >= 70%
    IF (COALESCE(NEW.ai_response_count, 0) > 0 OR COALESCE(NEW.completeness_score, 0) >= 70) THEN
    
      -- GATE 3: Rate limit - geen EMREX binnen 24 uur na applicatie creatie zonder interactie
      IF (NEW.created_at < NOW() - INTERVAL '24 hours' OR COALESCE(NEW.ai_response_count, 0) > 0) THEN
        
        -- Check of er al een EMREX goal bestaat
        IF NOT EXISTS (
          SELECT 1 FROM public.agent_goals 
          WHERE input_data->>'application_id' = NEW.id::text
            AND goal_type = 'send_emrex_invitation'
            AND status IN ('pending', 'executing', 'completed')
            AND created_at > NOW() - INTERVAL '48 hours'
        ) THEN
          INSERT INTO public.agent_goals (
            org_id, goal_type, goal_description, status, priority, input_data
          ) VALUES (
            NEW.org_id,
            'send_emrex_invitation',
            'Stuur EMREX diploma verificatie uitnodiging',
            'pending', 7,
            jsonb_build_object(
              'application_id', NEW.id,
              'candidate_email', NEW.email_from,
              'candidate_name', COALESCE(NEW.extracted_data->>'naam', split_part(NEW.email_from, '@', 1)),
              'functie_niveau', NEW.extracted_data->>'functie_niveau'
            )
          );
          
          RAISE LOG 'EMREX invitation created for % (completeness: %, responses: %)', 
            NEW.id, NEW.completeness_score, NEW.ai_response_count;
        END IF;
      ELSE
        RAISE LOG 'EMREX skipped for % - application too recent and no responses yet', NEW.id;
      END IF;
    ELSE
      RAISE LOG 'EMREX skipped for % - completeness % < 70 AND ai_response_count = %', 
        NEW.id, NEW.completeness_score, NEW.ai_response_count;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trigger_emrex_on_screening ON public.professional_applications;
CREATE TRIGGER trigger_emrex_on_screening
  AFTER UPDATE OF pipeline_stage ON public.professional_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_emrex_invitation_on_screening();

-- 3. Update auto interview trigger to require candidate interaction
CREATE OR REPLACE FUNCTION public.trigger_auto_schedule_interview()
RETURNS TRIGGER AS $$
DECLARE
  existing_goal_count INTEGER;
BEGIN
  -- Check of we naar screening gaan met voldoende completeness
  -- BELANGRIJK: Alleen triggeren als kandidaat ook daadwerkelijk heeft gereageerd
  IF NEW.pipeline_stage = 'screening' 
     AND COALESCE(NEW.completeness_score, 0) >= 80 
     AND (OLD.pipeline_stage IS DISTINCT FROM 'screening' OR COALESCE(OLD.completeness_score, 0) < 80)
     AND COALESCE(NEW.ai_response_count, 0) > 0 THEN  -- KRITIEK: Kandidaat moet gereageerd hebben
    
    -- Check of er al een schedule_interview goal bestaat
    SELECT COUNT(*) INTO existing_goal_count
    FROM public.agent_goals
    WHERE input_data->>'application_id' = NEW.id::text
      AND goal_type = 'schedule_interview'
      AND status IN ('pending', 'in_progress', 'completed');
    
    IF existing_goal_count = 0 THEN
      INSERT INTO public.agent_goals (org_id, goal_type, goal_description, status, priority, input_data)
      VALUES (
        NEW.org_id, 'schedule_interview',
        'Plan interview voor kandidaat met 80%+ completeness en intake reactie',
        'pending', 2,
        jsonb_build_object(
          'application_id', NEW.id,
          'candidate_name', COALESCE(NEW.extracted_data->>'naam', 'Onbekend'),
          'candidate_email', NEW.email_from,
          'trigger_reason', 'auto_completeness_with_interaction'
        )
      );
      
      RAISE LOG 'Auto schedule interview goal created for % (completeness: %, responses: %)', 
        NEW.id, NEW.completeness_score, NEW.ai_response_count;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trigger_auto_interview ON public.professional_applications;
CREATE TRIGGER trigger_auto_interview
  AFTER UPDATE OF pipeline_stage, completeness_score ON public.professional_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_auto_schedule_interview();