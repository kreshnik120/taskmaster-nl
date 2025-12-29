-- Add escalation tracking columns to application_documents
ALTER TABLE public.application_documents 
ADD COLUMN IF NOT EXISTS escalation_level INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS recruiter_notified_at TIMESTAMPTZ;

-- Add comments for documentation
COMMENT ON COLUMN public.application_documents.escalation_level IS 
  '0=geen actie, 1=eerste email verstuurd, 2=tweede urgente email verstuurd, 3=recruiter genotificeerd';
COMMENT ON COLUMN public.application_documents.escalated_at IS 
  'Timestamp wanneer escalatie naar niveau 2 plaatsvond';
COMMENT ON COLUMN public.application_documents.recruiter_notified_at IS 
  'Timestamp wanneer recruiter is genotificeerd (niveau 3)';

-- Create index for efficient escalation queries
CREATE INDEX IF NOT EXISTS idx_application_documents_escalation 
ON public.application_documents (escalation_level, reminder_sent_at, escalated_at) 
WHERE expiry_date IS NOT NULL AND escalation_level < 3;