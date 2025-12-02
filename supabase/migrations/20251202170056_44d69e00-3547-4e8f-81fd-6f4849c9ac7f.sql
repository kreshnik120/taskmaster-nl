-- Fix log_assignment_events trigger to include required fields
CREATE OR REPLACE FUNCTION public.log_assignment_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  event_type_name TEXT;
  event_user_id UUID;
  resolved_org_id UUID;
BEGIN
  event_user_id := COALESCE(auth.uid(), NEW.created_by);
  
  -- Resolve org_id from sublocation -> location -> client_org -> organization
  SELECT co.org_id INTO resolved_org_id
  FROM client_sublocations cs
  JOIN client_locations cl ON cs.location_id = cl.id
  JOIN client_organizations co ON cl.client_org_id = co.id
  WHERE cs.id = NEW.sublocation_id
  LIMIT 1;
  
  -- Determine event type
  IF TG_OP = 'INSERT' THEN
    event_type_name := 'assignment_created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      event_type_name := 'assignment_status_changed';
    ELSE
      event_type_name := 'assignment_updated';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    event_type_name := 'assignment_deleted';
  END IF;

  -- Insert system event with all required fields
  INSERT INTO public.system_events (
    org_id,
    user_id,
    event_type,
    entity_type,
    entity_id,
    event_data,
    metadata
  ) VALUES (
    resolved_org_id,
    event_user_id,
    event_type_name,
    'assignment',
    NEW.id,
    jsonb_build_object(
      'assignment_id', NEW.id,
      'professional_id', NEW.professional_id,
      'sublocation_id', NEW.sublocation_id,
      'werkvorm', NEW.werkvorm,
      'plaatsing_type', NEW.plaatsing_type,
      'start_date', NEW.start_date,
      'end_date', NEW.end_date,
      'weekly_hours', NEW.weekly_hours,
      'status', NEW.status,
      'ai_match_score', NEW.ai_match_score
    ),
    jsonb_build_object(
      'operation', TG_OP,
      'table', TG_TABLE_NAME
    )
  );

  RETURN NEW;
END;
$function$;

-- Ensure trigger exists on assignments table
DROP TRIGGER IF EXISTS log_assignment_events_trigger ON public.assignments;
CREATE TRIGGER log_assignment_events_trigger
AFTER INSERT OR UPDATE ON public.assignments
FOR EACH ROW
EXECUTE FUNCTION public.log_assignment_events();