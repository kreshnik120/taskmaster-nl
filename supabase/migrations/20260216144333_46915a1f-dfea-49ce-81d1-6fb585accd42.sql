
-- BENDY-FIX-3: Stichting Prisma / Dr. Kuyperstraat duplicaat fix
DO $$
DECLARE
  v_prisma_org_id UUID;
  v_drkuyper_org_id UUID;
  v_prisma_location_id UUID;
  v_drkuyper_location_id UUID;
  v_moved_count INTEGER;
  v_citozorg_id UUID := '650e8400-e29b-41d4-a716-446655440001';
BEGIN
  SELECT id INTO v_prisma_org_id
  FROM public.client_organizations
  WHERE org_id = v_citozorg_id
    AND LOWER(name) LIKE '%prisma%'
    AND (kvk_nummer IS NULL OR kvk_nummer = '')
  LIMIT 1;

  SELECT id INTO v_drkuyper_org_id
  FROM public.client_organizations
  WHERE org_id = v_citozorg_id
    AND kvk_nummer = '41100695'
  LIMIT 1;

  IF v_prisma_org_id IS NOT NULL
     AND v_drkuyper_org_id IS NOT NULL
     AND v_prisma_org_id != v_drkuyper_org_id
  THEN
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
      SELECT id FROM public.client_locations
      WHERE client_org_id = v_drkuyper_org_id
    );

    UPDATE public.client_sublocations
    SET location_id = v_prisma_location_id
    WHERE location_id IN (
      SELECT id FROM public.client_locations
      WHERE client_org_id = v_drkuyper_org_id
    );

    UPDATE public.bendy_id_mapping
    SET local_id = v_prisma_org_id
    WHERE tenant = 'citozorg'
      AND entity_type = 'organization'
      AND bendy_id = 'kvk-41100695';

    DELETE FROM public.client_locations
    WHERE client_org_id = v_drkuyper_org_id;

    DELETE FROM public.client_organizations
    WHERE id = v_drkuyper_org_id;

    RAISE NOTICE 'BENDY-FIX-3: % sublocaties verplaatst van Dr. Kuyperstraat naar Stichting Prisma', v_moved_count;
  ELSE
    RAISE NOTICE 'BENDY-FIX-3: Geen actie nodig — Prisma: %, Dr.Kuyperstraat: %', v_prisma_org_id, v_drkuyper_org_id;
  END IF;
END $$;
