-- Trigger 1: Sync pipeline_stage to 'goedgekeurd' when professional_id is linked
CREATE OR REPLACE FUNCTION public.sync_pipeline_stage_on_professional_link()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if professional_id was just set (was NULL, now has value)
  IF OLD.professional_id IS NULL AND NEW.professional_id IS NOT NULL THEN
    -- Only update if not already at 'geplaatst' stage
    IF NEW.pipeline_stage NOT IN ('goedgekeurd', 'geplaatst') THEN
      NEW.pipeline_stage := 'goedgekeurd';
      NEW.status := 'goedgekeurd';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for professional link
DROP TRIGGER IF EXISTS sync_pipeline_on_professional_link ON professional_applications;
CREATE TRIGGER sync_pipeline_on_professional_link
  BEFORE UPDATE ON professional_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_pipeline_stage_on_professional_link();

-- Trigger 2: Sync application to 'geplaatst' when assignment is created
CREATE OR REPLACE FUNCTION public.sync_pipeline_stage_on_assignment_created()
RETURNS TRIGGER AS $$
BEGIN
  -- Find the application linked to this professional and update it
  UPDATE professional_applications
  SET pipeline_stage = 'geplaatst',
      status = 'geplaatst',
      updated_at = NOW()
  WHERE professional_id = NEW.professional_id
    AND pipeline_stage != 'geplaatst'
    AND deleted_at IS NULL;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for assignment creation
DROP TRIGGER IF EXISTS sync_pipeline_on_assignment_created ON assignments;
CREATE TRIGGER sync_pipeline_on_assignment_created
  AFTER INSERT ON assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_pipeline_stage_on_assignment_created();