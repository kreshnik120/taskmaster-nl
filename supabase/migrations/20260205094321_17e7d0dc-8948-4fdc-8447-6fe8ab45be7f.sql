-- Audit log for admin impersonation actions
CREATE TABLE public.admin_impersonation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  target_user_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('start', 'stop')),
  admin_email TEXT,
  target_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS (only admins can read)
ALTER TABLE public.admin_impersonation_log ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view logs
CREATE POLICY "Admins can view impersonation logs"
  ON public.admin_impersonation_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));