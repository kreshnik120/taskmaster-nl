
-- =============================================
-- FASE 1: SHERPA CONSOLIDATIE
-- =============================================

-- Stap 1.1: Vind de hoofd-Sherpa organisatie ID
DO $$
DECLARE
  main_sherpa_id uuid;
  main_sherpa_location_id uuid;
BEGIN
  -- Zoek de hoofd-Sherpa (degene met de meeste sublocaties of zonder suffix)
  SELECT co.id INTO main_sherpa_id
  FROM client_organizations co
  WHERE co.name = 'Sherpa'
  LIMIT 1;
  
  -- Als geen exacte "Sherpa" bestaat, gebruik de eerste Sherpa-* als parent
  IF main_sherpa_id IS NULL THEN
    SELECT co.id INTO main_sherpa_id
    FROM client_organizations co
    WHERE co.name ILIKE 'Sherpa%'
    ORDER BY co.created_at ASC
    LIMIT 1;
  END IF;
  
  -- Krijg de location_id van de hoofd-Sherpa
  SELECT cl.id INTO main_sherpa_location_id
  FROM client_locations cl
  WHERE cl.client_org_id = main_sherpa_id
  LIMIT 1;
  
  -- Als er geen location is, maak er een aan
  IF main_sherpa_location_id IS NULL THEN
    INSERT INTO client_locations (client_org_id, naam, is_active)
    VALUES (main_sherpa_id, 'Sherpa Hoofdlocatie', true)
    RETURNING id INTO main_sherpa_location_id;
  END IF;
  
  -- Stap 1.2: Verplaats alle sublocaties van Sherpa-* organisaties naar de hoofd-Sherpa
  UPDATE client_sublocations cs
  SET location_id = main_sherpa_location_id
  FROM client_locations cl
  JOIN client_organizations co ON cl.client_org_id = co.id
  WHERE cs.location_id = cl.id
  AND co.name ILIKE 'Sherpa-%'
  AND co.id != main_sherpa_id;
  
  -- Stap 1.3: Verwijder lege locations van Sherpa-* organisaties
  DELETE FROM client_locations cl
  USING client_organizations co
  WHERE cl.client_org_id = co.id
  AND co.name ILIKE 'Sherpa-%'
  AND co.id != main_sherpa_id
  AND NOT EXISTS (SELECT 1 FROM client_sublocations cs WHERE cs.location_id = cl.id);
  
  -- Stap 1.4: Verwijder lege Sherpa-* organisaties
  DELETE FROM client_organizations co
  WHERE co.name ILIKE 'Sherpa-%'
  AND co.id != main_sherpa_id
  AND NOT EXISTS (SELECT 1 FROM client_locations cl WHERE cl.client_org_id = co.id);
  
  RAISE NOTICE 'Sherpa consolidatie voltooid. Hoofd-Sherpa ID: %', main_sherpa_id;
END $$;

-- =============================================
-- FASE 2: SIZA DUPLICAAT MERGE
-- =============================================

DO $$
DECLARE
  citoz_siza_id uuid;
  citoz_siza_location_id uuid;
  abc_siza_id uuid;
  moved_count integer := 0;
BEGIN
  -- Vind CitoZorg Siza (de correcte)
  SELECT co.id INTO citoz_siza_id
  FROM client_organizations co
  WHERE co.name ILIKE '%Siza%'
  AND co.org_id = '650e8400-e29b-41d4-a716-446655440001'::uuid
  LIMIT 1;
  
  -- Vind ABCzorg Siza (het duplicaat)
  SELECT co.id INTO abc_siza_id
  FROM client_organizations co
  WHERE co.name ILIKE '%Siza%'
  AND co.org_id = '550e8400-e29b-41d4-a716-446655440000'::uuid
  LIMIT 1;
  
  IF citoz_siza_id IS NOT NULL AND abc_siza_id IS NOT NULL THEN
    -- Krijg of maak location voor CitoZorg Siza
    SELECT cl.id INTO citoz_siza_location_id
    FROM client_locations cl
    WHERE cl.client_org_id = citoz_siza_id
    LIMIT 1;
    
    IF citoz_siza_location_id IS NULL THEN
      INSERT INTO client_locations (client_org_id, naam, is_active)
      VALUES (citoz_siza_id, 'Siza Hoofdlocatie', true)
      RETURNING id INTO citoz_siza_location_id;
    END IF;
    
    -- Verplaats alle sublocaties van ABCzorg Siza naar CitoZorg Siza
    UPDATE client_sublocations cs
    SET location_id = citoz_siza_location_id
    FROM client_locations cl
    WHERE cs.location_id = cl.id
    AND cl.client_org_id = abc_siza_id;
    
    GET DIAGNOSTICS moved_count = ROW_COUNT;
    
    -- Update het KVK nummer van CitoZorg Siza als het NULL is
    UPDATE client_organizations
    SET kvk_nummer = COALESCE(kvk_nummer, (SELECT kvk_nummer FROM client_organizations WHERE id = abc_siza_id))
    WHERE id = citoz_siza_id;
    
    -- Verwijder lege locations van ABCzorg Siza
    DELETE FROM client_locations WHERE client_org_id = abc_siza_id;
    
    -- Verwijder ABCzorg Siza duplicaat
    DELETE FROM client_organizations WHERE id = abc_siza_id;
    
    RAISE NOTICE 'Siza merge voltooid. % sublocaties verplaatst naar CitoZorg Siza.', moved_count;
  ELSE
    RAISE NOTICE 'Kon Siza organisaties niet vinden voor merge.';
  END IF;
END $$;

-- =============================================
-- FASE 3: STRAATNAAM CLEANUP
-- =============================================

-- Verwijder organisaties die eigenlijk straatnamen zijn (geen echte bedrijven)
DELETE FROM client_sublocations cs
USING client_locations cl, client_organizations co
WHERE cs.location_id = cl.id
AND cl.client_org_id = co.id
AND co.name IN (
  'Conservatoriumlaan 70',
  'Gouwberg 2', 
  'Gouwberg 11',
  'Hofke 1',
  'Slot Loevesteinstraat 34'
);

DELETE FROM client_locations cl
USING client_organizations co
WHERE cl.client_org_id = co.id
AND co.name IN (
  'Conservatoriumlaan 70',
  'Gouwberg 2', 
  'Gouwberg 11',
  'Hofke 1',
  'Slot Loevesteinstraat 34'
);

DELETE FROM client_organizations
WHERE name IN (
  'Conservatoriumlaan 70',
  'Gouwberg 2', 
  'Gouwberg 11',
  'Hofke 1',
  'Slot Loevesteinstraat 34'
);

-- =============================================
-- VERIFICATIE
-- =============================================

-- Tel het resultaat
DO $$
DECLARE
  org_count integer;
  subloc_count integer;
BEGIN
  SELECT COUNT(*) INTO org_count FROM client_organizations;
  SELECT COUNT(*) INTO subloc_count FROM client_sublocations;
  RAISE NOTICE 'Cleanup voltooid. Organisaties: %, Sublocaties: %', org_count, subloc_count;
END $$;
