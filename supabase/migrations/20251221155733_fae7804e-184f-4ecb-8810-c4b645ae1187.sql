-- =====================================================
-- FIX: Consolideer goal creatie naar één trigger
-- Oplossing: Eerst triggers droppen, dan functies
-- =====================================================

-- 1. Drop ALLE triggers die naar de functies wijzen
DROP TRIGGER IF EXISTS trigger_welcome_on_new_application ON public.professional_applications;
DROP TRIGGER IF EXISTS auto_intake_followup ON public.professional_applications;
DROP TRIGGER IF EXISTS trigger_intake_followup_goal ON public.professional_applications;
DROP TRIGGER IF EXISTS auto_welcome_intake ON public.professional_applications;

-- 2. Nu kunnen we de functies droppen
DROP FUNCTION IF EXISTS public.trigger_welcome_on_new_application() CASCADE;
DROP FUNCTION IF EXISTS public.trigger_intake_followup_goal() CASCADE;

-- 3. Maak één geconsolideerde trigger functie
CREATE OR REPLACE FUNCTION public.trigger_single_welcome_intake_goal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  existing_goal_count INTEGER;
  v_candidate_name TEXT;
  v_missing_info JSONB;
BEGIN
  -- Skip if no email available or deleted
  IF NEW.email_from IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  -- Extract candidate name
  v_candidate_name := COALESCE(
    NEW.extracted_data->>'naam',
    NEW.extracted_data->>'full_name',
    split_part(NEW.email_from, '@', 1),
    'Kandidaat'
  );
  
  -- Get missing info
  v_missing_info := COALESCE(NEW.missing_info, '[]'::jsonb);
  
  -- Check if there's already ANY active goal for this application
  -- This prevents duplicate emails completely
  SELECT COUNT(*) INTO existing_goal_count
  FROM public.agent_goals 
  WHERE input_data->>'application_id' = NEW.id::text
    AND goal_type IN ('application_intake_completion', 'send_welcome_email', 'send_welcome_and_intake')
    AND status IN ('pending', 'planning', 'executing', 'in_progress', 'completed')
    AND created_at > NOW() - INTERVAL '1 hour'; -- Rate limit: max 1 goal per hour
  
  -- Only create if no existing goal in the last hour
  IF existing_goal_count = 0 THEN
    INSERT INTO public.agent_goals (
      org_id,
      goal_type,
      goal_description,
      status,
      priority,
      input_data
    ) VALUES (
      COALESCE(NEW.org_id, '650e8400-e29b-41d4-a716-446655440001'::uuid),
      'send_welcome_and_intake', -- Single goal type that combines welcome + intake
      'Verstuur welkomst- en intake email naar ' || v_candidate_name,
      'pending',
      1, -- High priority for new applications
      jsonb_build_object(
        'application_id', NEW.id,
        'email', NEW.email_from,
        'candidate_email', NEW.email_from, -- For backwards compat
        'candidate_name', v_candidate_name,
        'missing_info', v_missing_info,
        'current_completeness', COALESCE(NEW.completeness_score, 0),
        'org_id', NEW.org_id,
        'triggered_by', 'consolidated_welcome_intake_trigger',
        'triggered_at', NOW()
      )
    );
    
    RAISE LOG 'Created send_welcome_and_intake goal for application % (completeness: %)', NEW.id, COALESCE(NEW.completeness_score, 0);
  ELSE
    RAISE LOG 'Skipped welcome_intake goal - existing goal found for application % in last hour', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- 4. Maak de nieuwe trigger (alleen op INSERT, niet op UPDATE)
CREATE TRIGGER trigger_consolidated_welcome_intake
  AFTER INSERT ON public.professional_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_single_welcome_intake_goal();

-- 5. Cancel alle oude pending EMREX goals
UPDATE public.agent_goals 
SET status = 'cancelled', 
    completed_at = NOW(),
    output_data = jsonb_build_object('cancelled_reason', 'Migration consolidation - EMREX not configured')
WHERE goal_type IN ('send_emrex_invitation', 'send_emrex_reminder')
  AND status = 'pending'
  AND created_at < '2025-12-21';

-- 6. Cancel dubbele application_intake_completion goals
UPDATE public.agent_goals 
SET status = 'cancelled', 
    completed_at = NOW(),
    output_data = jsonb_build_object('cancelled_reason', 'Duplicate goal - consolidated to send_welcome_and_intake')
WHERE goal_type = 'application_intake_completion'
  AND status IN ('pending', 'planning')
  AND input_data->>'application_id' IN (
    SELECT input_data->>'application_id' 
    FROM public.agent_goals 
    WHERE goal_type = 'send_welcome_and_intake' 
    AND status IN ('pending', 'planning', 'executing', 'completed')
  );