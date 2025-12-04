-- Amarant Duplicaat Merge
-- Behoud "Amarant" (legacy met logo), verplaats sublocaties, verwijder duplicaat

DO $$
DECLARE
  v_master_org_id uuid;
  v_duplicate_org_id uuid;
  v_master_location_id uuid;
  v_duplicate_location_id uuid;
  v_moved_count int;
BEGIN
  -- Vind de master organisatie (legacy Amarant met logo)
  SELECT id INTO v_master_org_id
  FROM client_organizations
  WHERE name = 'Amarant' AND logo_url IS NOT NULL;
  
  -- Vind de duplicate organisatie (import)
  SELECT id INTO v_duplicate_org_id
  FROM client_organizations
  WHERE name ILIKE '%Amarant Pastoor Pottersplein%';
  
  IF v_master_org_id IS NULL OR v_duplicate_org_id IS NULL THEN
    RAISE NOTICE 'Organisaties niet gevonden - master: %, duplicate: %', v_master_org_id, v_duplicate_org_id;
    RETURN;
  END IF;
  
  RAISE NOTICE 'Master Amarant: %, Duplicate: %', v_master_org_id, v_duplicate_org_id;
  
  -- Update KVK nummer van master naar meest complete data
  UPDATE client_organizations
  SET kvk_nummer = '41096992'
  WHERE id = v_master_org_id;
  
  -- Vind master location
  SELECT id INTO v_master_location_id
  FROM client_locations
  WHERE client_org_id = v_master_org_id
  LIMIT 1;
  
  -- Vind duplicate location
  SELECT id INTO v_duplicate_location_id
  FROM client_locations
  WHERE client_org_id = v_duplicate_org_id
  LIMIT 1;
  
  IF v_master_location_id IS NULL THEN
    RAISE NOTICE 'Master location niet gevonden, maak nieuwe aan';
    INSERT INTO client_locations (client_org_id, naam)
    VALUES (v_master_org_id, 'Amarant Hoofdlocatie')
    RETURNING id INTO v_master_location_id;
  END IF;
  
  -- Verplaats alle sublocaties van duplicate naar master (skip exacte naam duplicaten)
  UPDATE client_sublocations
  SET location_id = v_master_location_id
  WHERE location_id = v_duplicate_location_id
    AND naam NOT IN (
      SELECT naam FROM client_sublocations WHERE location_id = v_master_location_id
    );
  
  GET DIAGNOSTICS v_moved_count = ROW_COUNT;
  RAISE NOTICE 'Verplaatste sublocaties: %', v_moved_count;
  
  -- Verwijder overgebleven duplicate sublocaties (die al bestonden bij master)
  DELETE FROM client_sublocations
  WHERE location_id = v_duplicate_location_id;
  
  -- Verwijder duplicate location
  DELETE FROM client_locations
  WHERE client_org_id = v_duplicate_org_id;
  
  -- Verwijder duplicate organisatie
  DELETE FROM client_organizations
  WHERE id = v_duplicate_org_id;
  
  RAISE NOTICE 'Amarant merge voltooid';
END $$;