-- Create document audit logs table for tracking document operations
CREATE TABLE public.document_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- References
  application_id UUID NOT NULL REFERENCES public.professional_applications(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL, -- 'cv', 'vog', 'diploma', or ZZP types
  file_path TEXT, -- The file path
  
  -- Audit info
  action TEXT NOT NULL, -- 'upload', 'download', 'preview', 'inline_preview', 'delete'
  performed_by UUID REFERENCES auth.users(id),
  performed_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  -- Extra context
  metadata JSONB DEFAULT '{}'::jsonb,
  user_agent TEXT
);

-- Create indexes for fast queries
CREATE INDEX idx_document_audit_application ON public.document_audit_logs(application_id);
CREATE INDEX idx_document_audit_performed_at ON public.document_audit_logs(performed_at DESC);
CREATE INDEX idx_document_audit_performed_by ON public.document_audit_logs(performed_by);
CREATE INDEX idx_document_audit_action ON public.document_audit_logs(action);

-- Enable Row Level Security
ALTER TABLE public.document_audit_logs ENABLE ROW LEVEL SECURITY;

-- Org members can view document audit logs for their applications
CREATE POLICY "Org members can view document audit logs"
  ON public.document_audit_logs 
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.professional_applications pa
      JOIN public.user_organizations uo ON uo.org_id = pa.org_id
      WHERE pa.id = document_audit_logs.application_id
      AND uo.user_id = auth.uid()
    )
  );

-- Authenticated users can insert audit logs for their actions
CREATE POLICY "Authenticated users can insert audit logs"
  ON public.document_audit_logs 
  FOR INSERT
  WITH CHECK (auth.uid() = performed_by);

-- Service role can manage all logs (for background processes)
CREATE POLICY "Service role can manage all audit logs"
  ON public.document_audit_logs 
  FOR ALL
  USING (true)
  WITH CHECK (true);