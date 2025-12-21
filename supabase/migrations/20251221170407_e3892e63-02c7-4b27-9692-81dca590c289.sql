-- Fase 1: Voeg ontbrekende kolommen toe voor interview tracking en diploma validatie
ALTER TABLE public.professional_applications 
  ADD COLUMN IF NOT EXISTS interview_confirmed_slot jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS interview_scheduled_at timestamp with time zone DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS interview_status text DEFAULT NULL;

-- Voeg index toe voor snelle interview queries
CREATE INDEX IF NOT EXISTS idx_applications_interview_status 
  ON public.professional_applications(interview_status) 
  WHERE interview_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_applications_interview_scheduled 
  ON public.professional_applications(interview_scheduled_at) 
  WHERE interview_scheduled_at IS NOT NULL;

-- Comment voor documentatie
COMMENT ON COLUMN public.professional_applications.interview_confirmed_slot IS 'Selected interview slot {date, time} - filled when candidate confirms';
COMMENT ON COLUMN public.professional_applications.interview_scheduled_at IS 'Actual scheduled interview datetime - filled after confirmation';
COMMENT ON COLUMN public.professional_applications.interview_status IS 'Status: slots_offered, scheduled, completed, cancelled';