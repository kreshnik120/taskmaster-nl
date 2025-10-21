-- Layer 1: Auto-sync training_documents status when processing_jobs finish
-- Create helper index for performance
CREATE INDEX IF NOT EXISTS idx_processing_jobs_file_path ON public.processing_jobs (file_path);

-- Function to sync document status based on jobs
CREATE OR REPLACE FUNCTION public.sync_document_status()
RETURNS TRIGGER AS $$
DECLARE
  v_file_path text;
  v_all_done boolean;
  v_any_done boolean;
  v_total_items integer;
BEGIN
  v_file_path := NEW.file_path;

  -- Determine if there are any jobs still pending/processing for this file
  SELECT NOT EXISTS (
    SELECT 1 FROM public.processing_jobs pj
    WHERE pj.file_path = v_file_path
      AND pj.status IN ('pending','processing')
  ) INTO v_all_done;

  IF v_all_done THEN
    -- Did at least one chunk finish successfully?
    SELECT EXISTS (
      SELECT 1 FROM public.processing_jobs pj
      WHERE pj.file_path = v_file_path AND pj.status = 'done'
    ) INTO v_any_done;

    -- Sum items processed on successful chunks
    SELECT COALESCE(SUM(pj.items_processed), 0)
    INTO v_total_items
    FROM public.processing_jobs pj
    WHERE pj.file_path = v_file_path AND pj.status = 'done';

    UPDATE public.training_documents td
    SET 
      status = CASE WHEN v_any_done THEN 'completed' ELSE 'failed' END,
      processed_at = NOW(),
      extracted_knowledge_count = v_total_items,
      processing_progress = 100,
      updated_at = NOW(),
      error_message = CASE WHEN v_any_done THEN td.error_message ELSE COALESCE(td.error_message, 'Een of meer chunks zijn mislukt of niet voltooid') END
    WHERE td.file_path = v_file_path;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger on processing_jobs updates
DROP TRIGGER IF EXISTS auto_sync_document_status ON public.processing_jobs;
CREATE TRIGGER auto_sync_document_status
AFTER UPDATE ON public.processing_jobs
FOR EACH ROW
WHEN (NEW.status IN ('done','failed'))
EXECUTE FUNCTION public.sync_document_status();
