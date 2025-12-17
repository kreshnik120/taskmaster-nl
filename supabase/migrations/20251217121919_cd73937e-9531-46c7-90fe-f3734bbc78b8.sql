-- Fix: Update trigger function to use correct goal type
CREATE OR REPLACE FUNCTION public.trigger_welcome_on_new_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Create agent goal for welcome + intake email
  INSERT INTO public.agent_goals (
    org_id,
    goal_type,
    goal_description,
    status,
    priority,
    input_data
  ) VALUES (
    NEW.org_id,
    'send_welcome_and_intake',  -- Fixed: was 'send_welcome_email'
    'Verstuur welkomst- en intake email naar nieuwe sollicitant ' || COALESCE(NEW.extracted_data->>'naam', NEW.email_from),
    'pending',
    1,
    jsonb_build_object(
      'application_id', NEW.id,
      'email', NEW.email_from,
      'naam', COALESCE(NEW.extracted_data->>'naam', 'Sollicitant'),
      'org_id', NEW.org_id
    )
  );
  
  RETURN NEW;
END;
$$;

-- Clean up old failed goals with wrong type
UPDATE public.agent_goals 
SET status = 'cancelled'
WHERE goal_type = 'send_welcome_email' 
  AND status IN ('pending', 'failed');