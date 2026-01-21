-- Security Audit Log tabel voor geblokkeerde OAuth pogingen
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  email TEXT,
  provider TEXT,
  blocked_reason TEXT,
  user_id UUID,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes voor snelle queries
CREATE INDEX IF NOT EXISTS idx_security_audit_event_type ON public.security_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_security_audit_email ON public.security_audit_log(email);
CREATE INDEX IF NOT EXISTS idx_security_audit_created_at ON public.security_audit_log(created_at DESC);

-- RLS: alleen admins kunnen logs zien
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view security logs"
  ON public.security_audit_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Update handle_new_user: blokkeer OAuth users zonder uitnodiging
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  provider_type TEXT;
  has_valid_invitation BOOLEAN;
BEGIN
  -- Haal provider op
  provider_type := NEW.raw_app_meta_data->>'provider';
  
  -- Voor OAuth providers: check of er een uitnodiging is
  IF provider_type IS NOT NULL AND provider_type IN ('google', 'github', 'azure', 'linkedin') THEN
    SELECT EXISTS(
      SELECT 1 FROM public.user_invitations
      WHERE email = NEW.email 
        AND accepted_at IS NULL 
        AND expires_at > NOW()
    ) INTO has_valid_invitation;
    
    -- Geen uitnodiging? Blokkeer door GEEN profiel aan te maken
    IF NOT has_valid_invitation THEN
      -- Log de poging voor security audit
      INSERT INTO public.security_audit_log (
        event_type, 
        email, 
        provider, 
        blocked_reason,
        user_id,
        created_at
      ) VALUES (
        'oauth_signup_blocked',
        NEW.email,
        provider_type,
        'No valid invitation found',
        NEW.id,
        NOW()
      );
      
      -- Return NULL voorkomt verdere trigger uitvoering
      -- User bestaat in auth.users maar heeft geen profiel/rol
      RETURN NULL;
    END IF;
  END IF;

  -- Normale flow: maak profiel aan
  INSERT INTO public.profiles (id, name, email, image)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    image = EXCLUDED.image;
  
  RETURN NEW;
END;
$$;

-- Update assign_default_user_role: gebruik uitnodiging rol voor OAuth
CREATE OR REPLACE FUNCTION public.assign_default_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  provider_type TEXT;
  invitation_role public.app_role;
BEGIN
  provider_type := NEW.raw_app_meta_data->>'provider';
  
  -- Voor OAuth: check of er een uitnodiging is en gebruik die rol
  IF provider_type IS NOT NULL AND provider_type IN ('google', 'github', 'azure', 'linkedin') THEN
    SELECT role INTO invitation_role
    FROM public.user_invitations
    WHERE email = NEW.email 
      AND accepted_at IS NULL 
      AND expires_at > NOW()
    LIMIT 1;
    
    -- Geen uitnodiging gevonden? Wijs GEEN rol toe
    IF invitation_role IS NULL THEN
      RETURN NEW;
    END IF;
    
    -- Markeer uitnodiging als geaccepteerd
    UPDATE public.user_invitations
    SET accepted_at = NOW()
    WHERE email = NEW.email 
      AND accepted_at IS NULL;
    
    -- Wijs de uitgenodigde rol toe
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, invitation_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    
    RETURN NEW;
  END IF;
  
  -- Standaard email flow: alleen 'user' rol als fallback
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$$;