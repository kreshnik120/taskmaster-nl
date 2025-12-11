-- ============================================
-- AUTO-RECALCULATE MATCHES TRIGGER
-- Automatically triggers match calculation when extracted_data is updated
-- ============================================

-- Enable pg_net extension for HTTP calls (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function to trigger match recalculation via edge function
CREATE OR REPLACE FUNCTION public.trigger_match_recalculation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Only trigger if extracted_data has actually changed
  IF TG_OP = 'UPDATE' AND 
     (OLD.extracted_data IS DISTINCT FROM NEW.extracted_data) THEN
    
    -- Get Supabase URL from environment
    supabase_url := current_setting('app.settings.supabase_url', true);
    
    -- If no URL configured, use default project URL
    IF supabase_url IS NULL OR supabase_url = '' THEN
      supabase_url := 'https://oelmsmcgryeoryhonexw.supabase.co';
    END IF;
    
    -- Log the trigger
    RAISE LOG 'trigger_match_recalculation: Triggering for application %', NEW.id;
    
    -- Call edge function via pg_net (async, non-blocking)
    PERFORM extensions.http_post(
      supabase_url || '/functions/v1/calculate-application-matches',
      jsonb_build_object('application_id', NEW.id)::text,
      'application/json'
    );
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger on professional_applications
DROP TRIGGER IF EXISTS auto_recalculate_matches ON public.professional_applications;

CREATE TRIGGER auto_recalculate_matches
  AFTER UPDATE OF extracted_data ON public.professional_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_match_recalculation();

-- Also trigger on INSERT for new applications
DROP TRIGGER IF EXISTS auto_calculate_matches_on_insert ON public.professional_applications;

CREATE TRIGGER auto_calculate_matches_on_insert
  AFTER INSERT ON public.professional_applications
  FOR EACH ROW
  WHEN (NEW.extracted_data IS NOT NULL)
  EXECUTE FUNCTION public.trigger_match_recalculation();

-- Add comment for documentation
COMMENT ON FUNCTION public.trigger_match_recalculation() IS 
'Triggers automatic match recalculation when application extracted_data is updated. 
Calls calculate-application-matches edge function via pg_net for async processing.';