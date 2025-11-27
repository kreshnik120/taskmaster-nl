-- ================================================================
-- PLACEMENT EVENTS TRIGGER
-- Logs placement/match creation and updates to system_events
-- ================================================================

-- Update log_recruitment_events trigger to handle professional_client_matches
CREATE OR REPLACE FUNCTION public.log_recruitment_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_type TEXT;
  v_metadata JSONB;
  v_user_id UUID;
BEGIN
  -- Determine user_id based on auth context or fallback to NULL for system events
  v_user_id := auth.uid();

  -- Handle professional_client_matches table events (PLACEMENT)
  IF TG_TABLE_NAME = 'professional_client_matches' THEN
    IF TG_OP = 'INSERT' THEN
      v_event_type := 'placement_created';
      v_metadata := jsonb_build_object(
        'match_id', NEW.id,
        'professional_id', NEW.professional_id,
        'client_id', NEW.client_id,
        'match_score', NEW.match_score,
        'status', NEW.status,
        'created_by', NEW.created_by
      );
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_event_type := 'placement_status_changed';
      v_metadata := jsonb_build_object(
        'match_id', NEW.id,
        'professional_id', NEW.professional_id,
        'client_id', NEW.client_id,
        'old_status', OLD.status,
        'new_status', NEW.status,
        'updated_by', v_user_id
      );
    ELSE
      RETURN NEW;
    END IF;

    -- Insert event log
    INSERT INTO public.system_events (
      user_id,
      org_id,
      event_type,
      metadata,
      created_at
    ) VALUES (
      v_user_id,
      NEW.org_id,
      v_event_type,
      v_metadata,
      now()
    );

  -- Handle professional_applications table events  
  ELSIF TG_TABLE_NAME = 'professional_applications' THEN
    IF TG_OP = 'INSERT' THEN
      v_event_type := 'application_created';
      v_metadata := jsonb_build_object(
        'application_id', NEW.id,
        'email_from', NEW.email_from,
        'completeness_score', NEW.completeness_score,
        'pipeline_stage', NEW.pipeline_stage
      );
    ELSIF TG_OP = 'UPDATE' AND OLD.pipeline_stage IS DISTINCT FROM NEW.pipeline_stage THEN
      v_event_type := 'application_stage_changed';
      v_metadata := jsonb_build_object(
        'application_id', NEW.id,
        'old_stage', OLD.pipeline_stage,
        'new_stage', NEW.pipeline_stage,
        'completeness_score', NEW.completeness_score
      );
    ELSE
      RETURN NEW;
    END IF;

    INSERT INTO public.system_events (
      user_id,
      org_id,
      event_type,
      metadata,
      created_at
    ) VALUES (
      v_user_id,
      NEW.org_id,
      v_event_type,
      v_metadata,
      now()
    );

  -- Handle professionals table events
  ELSIF TG_TABLE_NAME = 'professionals' THEN
    IF TG_OP = 'INSERT' THEN
      v_event_type := 'professional_created';
      v_metadata := jsonb_build_object(
        'professional_id', NEW.id,
        'full_name', NEW.full_name,
        'functie_niveau', NEW.functie_nivel,
        'werkvorm', NEW.werkvorm
      );

      INSERT INTO public.system_events (
        user_id,
        org_id,
        event_type,
        metadata,
        created_at
      ) VALUES (
        v_user_id,
        NEW.org_id,
        v_event_type,
        v_metadata,
        now()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists and recreate
DROP TRIGGER IF EXISTS log_placement_events ON public.professional_client_matches;

-- Create trigger for placement events
CREATE TRIGGER log_placement_events
AFTER INSERT OR UPDATE ON public.professional_client_matches
FOR EACH ROW
EXECUTE FUNCTION public.log_recruitment_events();