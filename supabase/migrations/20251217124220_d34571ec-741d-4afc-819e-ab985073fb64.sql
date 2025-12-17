-- Fix: Replace failing extensions.http_post() with system_events INSERT
-- This allows profile updates to succeed while still triggering async match recalculation

CREATE OR REPLACE FUNCTION public.trigger_match_recalculation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only trigger on meaningful extracted_data changes
  IF TG_OP = 'UPDATE' AND 
     (OLD.extracted_data IS DISTINCT FROM NEW.extracted_data) THEN
    
    -- Log event for async processing by orchestrator (replaces failing http_post)
    INSERT INTO public.system_events (
      org_id,
      event_type,
      entity_type,
      entity_id,
      event_data,
      metadata
    ) VALUES (
      NEW.org_id,
      'application_data_changed',
      'professional_application',
      NEW.id,
      jsonb_build_object(
        'application_id', NEW.id,
        'trigger_reason', 'extracted_data_updated',
        'requires_match_recalculation', true,
        'old_completeness', OLD.completeness_score,
        'new_completeness', NEW.completeness_score
      ),
      jsonb_build_object(
        'source', 'trigger_match_recalculation',
        'triggered_at', now()
      )
    );
    
  ELSIF TG_OP = 'INSERT' AND NEW.extracted_data IS NOT NULL THEN
    -- Also handle new applications with data
    INSERT INTO public.system_events (
      org_id,
      event_type,
      entity_type,
      entity_id,
      event_data,
      metadata
    ) VALUES (
      NEW.org_id,
      'application_created_with_data',
      'professional_application',
      NEW.id,
      jsonb_build_object(
        'application_id', NEW.id,
        'trigger_reason', 'new_application_with_data',
        'requires_match_recalculation', true
      ),
      jsonb_build_object(
        'source', 'trigger_match_recalculation',
        'triggered_at', now()
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;