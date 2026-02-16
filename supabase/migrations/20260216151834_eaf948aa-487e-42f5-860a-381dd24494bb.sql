
-- BENDY-FIX-5: Forceer data fixes (idempotent)
-- Probleem: DO $$ blokken uit FIX-3 en FIX-4 zijn niet uitgevoerd

-- ══════════════════════════════════════════
-- DEEL A: Stichting Prisma / Dr. Kuyperstraat samenvoegen
-- ══════════════════════════════════════════
DO $$
DECLARE
  v_citozorg_id UUID := '650e8400-e29b-41d4-a716-446655440001';
  v_prisma_org_id UUID;
  v_drkuyper_org_id UUID;
  v_prisma_location_id UUID;
  v_moved_count INTEGER;
BEGIN
  SELECT id INTO v_drkuyper_org_id
  FROM public.client_organizations
  WHERE org_id = v_citozorg_id
    AND kvk_nummer = '41100695'
    AND LOWER(name) LIKE '%kuyper%'
  LIMIT 1;

  SELECT id INTO v_prisma_org_id
  FROM public.client_organizations
  WHERE org_id = v_citozorg_id
    AND LOWER(name) LIKE '%prisma%'
    AND id != COALESCE(v_drkuyper_org_id, '00000000-0000-0000-0000-000000000000')
  LIMIT 1;

  IF v_drkuyper_org_id IS NOT NULL AND v_prisma_org_id IS NOT NULL THEN
    RAISE NOTICE 'FIX-5: Dr. Kuyperstraat gevonden (%), Prisma gevonden (%) — samenvoegen', v_drkuyper_org_id, v_prisma_org_id;

    UPDATE public.client_organizations
    SET kvk_nummer = '41100695'
    WHERE id = v_prisma_org_id;

    SELECT id INTO v_prisma_location_id
    FROM public.client_locations
    WHERE client_org_id = v_prisma_org_id
    LIMIT 1;

    IF v_prisma_location_id IS NULL THEN
      INSERT INTO public.client_locations (client_org_id, naam)
      VALUES (v_prisma_org_id, 'Hoofdlocatie')
      RETURNING id INTO v_prisma_location_id;
    END IF;

    SELECT count(*) INTO v_moved_count
    FROM public.client_sublocations
    WHERE location_id IN (
      SELECT id FROM public.client_locations WHERE client_org_id = v_drkuyper_org_id
    );

    UPDATE public.client_sublocations
    SET location_id = v_prisma_location_id
    WHERE location_id IN (
      SELECT id FROM public.client_locations WHERE client_org_id = v_drkuyper_org_id
    );

    UPDATE public.bendy_id_mapping
    SET local_id = v_prisma_org_id
    WHERE tenant = 'citozorg'
      AND entity_type = 'organization'
      AND bendy_id = 'kvk-41100695';

    DELETE FROM public.client_locations WHERE client_org_id = v_drkuyper_org_id;
    DELETE FROM public.client_organizations WHERE id = v_drkuyper_org_id;

    RAISE NOTICE 'FIX-5 DEEL A KLAAR: % sublocaties verplaatst, Dr. Kuyperstraat verwijderd', v_moved_count;
  ELSE
    RAISE NOTICE 'FIX-5 DEEL A: Geen actie — Dr.Kuyperstraat: %, Prisma: %', v_drkuyper_org_id, v_prisma_org_id;
  END IF;
END $$;

-- ══════════════════════════════════════════
-- DEEL B: KvK-nummer voor Stichting Siza
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
    RAISE NOTICE 'FIX-5 DEEL B: Siza KvK 09103844 ingevuld';
  ELSE
    RAISE NOTICE 'FIX-5 DEEL B: Siza niet gevonden of heeft al KvK';
  END IF;
END $$;

-- ══════════════════════════════════════════
-- DEEL C: Kolommen toevoegen (idempotent, voor het geval)
-- ══════════════════════════════════════════
ALTER TABLE public.client_sublocations
ADD COLUMN IF NOT EXISTS email TEXT DEFAULT NULL;

ALTER TABLE public.client_sublocations
ADD COLUMN IF NOT EXISTS contactpersoon_naam TEXT DEFAULT NULL;
