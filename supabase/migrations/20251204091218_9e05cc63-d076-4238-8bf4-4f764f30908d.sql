
-- Trigger functie die nieuwe gebruikers automatisch aan beide organisaties koppelt
CREATE OR REPLACE FUNCTION public.handle_new_user_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Koppel aan ABCzorg (standaard organisatie)
  INSERT INTO public.user_organizations (user_id, org_id, role)
  VALUES (NEW.id, '550e8400-e29b-41d4-a716-446655440000', 'MEMBER')
  ON CONFLICT (user_id, org_id) DO NOTHING;
  
  -- Koppel ook aan CitoZorg voor recruitment personeel
  INSERT INTO public.user_organizations (user_id, org_id, role)
  VALUES (NEW.id, '650e8400-e29b-41d4-a716-446655440001', 'MEMBER')
  ON CONFLICT (user_id, org_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Trigger bij nieuwe gebruiker registratie via profiles table
DROP TRIGGER IF EXISTS on_new_user_add_to_organizations ON public.profiles;
CREATE TRIGGER on_new_user_add_to_organizations
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_organization();
