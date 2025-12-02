-- Add completed_at column to assignments table
ALTER TABLE public.assignments 
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

-- Create function to sync professional availability after assignment completion
CREATE OR REPLACE FUNCTION public.sync_professional_availability_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  active_assignments_count INTEGER;
BEGIN
  -- Only trigger when status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Set completed_at timestamp if not already set
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := NOW();
    END IF;
    
    -- Count remaining active assignments for this professional
    SELECT COUNT(*) INTO active_assignments_count
    FROM public.assignments
    WHERE professional_id = NEW.professional_id
      AND status = 'active'
      AND id != NEW.id;
    
    -- If no other active assignments, update professional status to 'beschikbaar'
    IF active_assignments_count = 0 THEN
      UPDATE public.professionals
      SET status = 'beschikbaar',
          updated_at = NOW()
      WHERE id = NEW.professional_id
        AND status != 'beschikbaar';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for automatic availability sync
DROP TRIGGER IF EXISTS trigger_sync_professional_availability ON public.assignments;
CREATE TRIGGER trigger_sync_professional_availability
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_professional_availability_on_completion();