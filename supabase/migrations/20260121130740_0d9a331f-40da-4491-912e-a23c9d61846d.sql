-- Create user_invitations table for invite-only registration
CREATE TABLE IF NOT EXISTS public.user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  role app_role DEFAULT 'user',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Create index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_user_invitations_token ON public.user_invitations(token);
CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON public.user_invitations(email);

-- Enable RLS
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

-- RLS: Admins can manage all invitations
CREATE POLICY "Admins can manage invitations"
  ON public.user_invitations
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS: Allow public to validate tokens (for registration flow)
CREATE POLICY "Anyone can validate invitation tokens"
  ON public.user_invitations
  FOR SELECT
  TO anon, authenticated
  USING (
    token IS NOT NULL 
    AND expires_at > now() 
    AND accepted_at IS NULL
  );

-- Function to validate and consume an invitation token
CREATE OR REPLACE FUNCTION public.validate_invitation_token(p_token TEXT)
RETURNS TABLE (
  invitation_id UUID,
  email TEXT,
  role app_role,
  is_valid BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.id,
    i.email,
    i.role,
    (i.expires_at > now() AND i.accepted_at IS NULL) AS is_valid
  FROM public.user_invitations i
  WHERE i.token = p_token
  LIMIT 1;
END;
$$;

-- Function to mark invitation as accepted and assign role
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation RECORD;
BEGIN
  -- Get and validate the invitation
  SELECT * INTO v_invitation
  FROM public.user_invitations
  WHERE token = p_token
    AND expires_at > now()
    AND accepted_at IS NULL
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Mark invitation as accepted
  UPDATE public.user_invitations
  SET accepted_at = now()
  WHERE id = v_invitation.id;
  
  -- Assign the role to the user
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, v_invitation.role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN TRUE;
END;
$$;