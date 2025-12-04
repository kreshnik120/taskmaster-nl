-- Fix trigger 1: Use correct status value 'geaccepteerd'
CREATE OR REPLACE FUNCTION public.sync_pipeline_stage_on_professional_link()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.professional_id IS NULL AND NEW.professional_id IS NOT NULL THEN
    IF NEW.pipeline_stage NOT IN ('goedgekeurd', 'geplaatst') THEN
      NEW.pipeline_stage := 'goedgekeurd';
      NEW.status := 'geaccepteerd';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix trigger 2: Use correct status value 'geaccepteerd'
CREATE OR REPLACE FUNCTION public.sync_pipeline_stage_on_assignment_created()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE professional_applications
  SET pipeline_stage = 'geplaatst',
      status = 'geaccepteerd',
      updated_at = NOW()
  WHERE professional_id = NEW.professional_id
    AND pipeline_stage != 'geplaatst'
    AND deleted_at IS NULL;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;