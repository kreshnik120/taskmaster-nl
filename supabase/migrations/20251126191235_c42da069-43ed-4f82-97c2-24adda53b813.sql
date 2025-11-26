-- Fix notify_pipeline_stage_change trigger: remove invalid updated_at::uuid fallback
CREATE OR REPLACE FUNCTION public.notify_pipeline_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    auth.uid(),
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
$function$;