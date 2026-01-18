-- =====================================================
-- FASE 5: Trigger Cleanup - Disable conflicting auto-interview triggers
-- Check if triggers exist before disabling
-- =====================================================

DO $$ 
BEGIN
  -- Disable trigger_auto_interview if it exists
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_auto_interview' 
    AND tgrelid = 'professional_applications'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE professional_applications DISABLE TRIGGER trigger_auto_interview';
    RAISE NOTICE 'Disabled trigger_auto_interview';
  END IF;
  
  -- Disable trigger_auto_interview_on_screening if it exists
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_auto_interview_on_screening' 
    AND tgrelid = 'professional_applications'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE professional_applications DISABLE TRIGGER trigger_auto_interview_on_screening';
    RAISE NOTICE 'Disabled trigger_auto_interview_on_screening';
  END IF;
END $$;