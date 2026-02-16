
-- BENDY-FIX-4: KvK verificatie + contactgegevens kolommen

-- ══════════════════════════════════════════
-- DEEL A: KvK-nummer invullen voor Stichting Siza
-- ══════════════════════════════════════════
DO $$
DECLARE
  v_citozorg_id UUID := '650e8400-e29b-41d4-a716-446655440001';
  v_siza_id UUID;
BEGIN
  SELECT id INTO v_siza_id
  FROM public.client_organizations
  WHERE org_id = v_citozorg_id
    AND LOWER(name) LIKE '%siza%'
    AND (kvk_nummer IS NULL OR kvk_nummer = '')
  LIMIT 1;

  IF v_siza_id IS NOT NULL THEN
    UPDATE public.client_organizations
    SET kvk_nummer = '09103844'
    WHERE id = v_siza_id;
    RAISE NOTICE 'BENDY-FIX-4: Siza KvK 09103844 ingevuld';
  ELSE
    RAISE NOTICE 'BENDY-FIX-4: Siza niet gevonden of heeft al KvK';
  END IF;
END $$;

-- ══════════════════════════════════════════
-- DEEL B: Nieuwe kolommen op client_sublocations
-- ══════════════════════════════════════════
ALTER TABLE public.client_sublocations
ADD COLUMN IF NOT EXISTS email TEXT DEFAULT NULL;

ALTER TABLE public.client_sublocations
ADD COLUMN IF NOT EXISTS contactpersoon_naam TEXT DEFAULT NULL;

COMMENT ON COLUMN public.client_sublocations.email
IS 'Email van de werklocatie, gesynchroniseerd vanuit Bendy';

COMMENT ON COLUMN public.client_sublocations.contactpersoon_naam
IS 'Contactpersoon bij de werklocatie, gesynchroniseerd vanuit Bendy (voornaam + tussenvoegsel + achternaam)';
