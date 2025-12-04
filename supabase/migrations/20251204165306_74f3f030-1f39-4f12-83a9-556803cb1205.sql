
-- ============================================
-- FASE 1: PLURYN MERGE
-- ============================================

-- Stap 1.1: Vind de IDs
DO $$
DECLARE
  v_pluryn_legacy_id UUID;
  v_pluryn_import_id UUID;
  v_pluryn_legacy_loc_id UUID;
  v_pluryn_import_loc_id UUID;
BEGIN
  -- Legacy Pluryn (met logo)
  SELECT id INTO v_pluryn_legacy_id FROM client_organizations WHERE name = 'Pluryn';
  -- Geïmporteerde Pluryn
  SELECT id INTO v_pluryn_import_id FROM client_organizations WHERE name = 'Stg Pluryn de Fuut';
  
  IF v_pluryn_legacy_id IS NOT NULL AND v_pluryn_import_id IS NOT NULL THEN
    -- Get location IDs
    SELECT id INTO v_pluryn_legacy_loc_id FROM client_locations WHERE client_org_id = v_pluryn_legacy_id LIMIT 1;
    SELECT id INTO v_pluryn_import_loc_id FROM client_locations WHERE client_org_id = v_pluryn_import_id LIMIT 1;
    
    -- Maak hoofdlocatie aan als die niet bestaat
    IF v_pluryn_legacy_loc_id IS NULL THEN
      INSERT INTO client_locations (client_org_id, naam, is_active)
      VALUES (v_pluryn_legacy_id, 'Pluryn Hoofdlocatie', true)
      RETURNING id INTO v_pluryn_legacy_loc_id;
    END IF;
    
    -- Verplaats sublocaties
    IF v_pluryn_import_loc_id IS NOT NULL AND v_pluryn_legacy_loc_id IS NOT NULL THEN
      UPDATE client_sublocations 
      SET location_id = v_pluryn_legacy_loc_id
      WHERE location_id = v_pluryn_import_loc_id;
    END IF;
    
    -- Kopieer KVK nummer
    UPDATE client_organizations 
    SET kvk_nummer = '51655950'
    WHERE id = v_pluryn_legacy_id AND (kvk_nummer IS NULL OR kvk_nummer = '');
    
    -- Verwijder geïmporteerde locations en organisatie
    DELETE FROM client_locations WHERE client_org_id = v_pluryn_import_id;
    DELETE FROM client_organizations WHERE id = v_pluryn_import_id;
    
    RAISE NOTICE 'Pluryn merge voltooid';
  END IF;
END $$;

-- ============================================
-- FASE 2: PRO PERSONA MERGE
-- ============================================

DO $$
DECLARE
  v_propersona_legacy_id UUID;
  v_propersona_import_id UUID;
  v_propersona_legacy_loc_id UUID;
  v_propersona_import_loc_id UUID;
BEGIN
  -- Legacy Pro Persona (met logo)
  SELECT id INTO v_propersona_legacy_id FROM client_organizations WHERE name = 'Pro Persona';
  -- Geïmporteerde Pro Persona
  SELECT id INTO v_propersona_import_id FROM client_organizations WHERE name = 'Pro Persona GGZ';
  
  IF v_propersona_legacy_id IS NOT NULL AND v_propersona_import_id IS NOT NULL THEN
    -- Get location IDs
    SELECT id INTO v_propersona_legacy_loc_id FROM client_locations WHERE client_org_id = v_propersona_legacy_id LIMIT 1;
    SELECT id INTO v_propersona_import_loc_id FROM client_locations WHERE client_org_id = v_propersona_import_id LIMIT 1;
    
    -- Maak hoofdlocatie aan als die niet bestaat
    IF v_propersona_legacy_loc_id IS NULL THEN
      INSERT INTO client_locations (client_org_id, naam, is_active)
      VALUES (v_propersona_legacy_id, 'Pro Persona Hoofdlocatie', true)
      RETURNING id INTO v_propersona_legacy_loc_id;
    END IF;
    
    -- Verplaats sublocaties
    IF v_propersona_import_loc_id IS NOT NULL AND v_propersona_legacy_loc_id IS NOT NULL THEN
      UPDATE client_sublocations 
      SET location_id = v_propersona_legacy_loc_id
      WHERE location_id = v_propersona_import_loc_id;
    END IF;
    
    -- Kopieer KVK nummer
    UPDATE client_organizations 
    SET kvk_nummer = '41053219'
    WHERE id = v_propersona_legacy_id AND (kvk_nummer IS NULL OR kvk_nummer = '');
    
    -- Verwijder geïmporteerde locations en organisatie
    DELETE FROM client_locations WHERE client_org_id = v_propersona_import_id;
    DELETE FROM client_organizations WHERE id = v_propersona_import_id;
    
    RAISE NOTICE 'Pro Persona merge voltooid';
  END IF;
END $$;

-- ============================================
-- FASE 3: LEGE ORGANISATIES VERWIJDEREN
-- ============================================

-- Bloezem Hoofdkantoor (0 sublocaties)
DELETE FROM client_locations WHERE client_org_id IN (
  SELECT id FROM client_organizations WHERE name = 'Bloezem Hoofdkantoor'
);
DELETE FROM client_organizations WHERE name = 'Bloezem Hoofdkantoor';

-- Dimence Hoofdkantoor (0 sublocaties)
DELETE FROM client_locations WHERE client_org_id IN (
  SELECT id FROM client_organizations WHERE name = 'Dimence Hoofdkantoor'
);
DELETE FROM client_organizations WHERE name = 'Dimence Hoofdkantoor';

-- Mesazorg Hoofdkantoor (0 sublocaties)
DELETE FROM client_locations WHERE client_org_id IN (
  SELECT id FROM client_organizations WHERE name ILIKE '%Mesazorg%Hoofdkantoor%'
);
DELETE FROM client_organizations WHERE name ILIKE '%Mesazorg%Hoofdkantoor%';

-- ============================================
-- FASE 4: LEGER DES HEILS CONSOLIDATIE
-- ============================================

DO $$
DECLARE
  v_ldh_main_id UUID;
  v_ldh_midden_id UUID;
  v_ldh_main_loc_id UUID;
  v_ldh_midden_loc_id UUID;
BEGIN
  -- Hoofd Leger des Heils
  SELECT id INTO v_ldh_main_id FROM client_organizations WHERE name = 'Leger des Heils';
  -- Leger des Heils Midden Nederland
  SELECT id INTO v_ldh_midden_id FROM client_organizations WHERE name = 'Leger des Heils Midden Nederland';
  
  IF v_ldh_main_id IS NOT NULL AND v_ldh_midden_id IS NOT NULL THEN
    -- Get location IDs
    SELECT id INTO v_ldh_main_loc_id FROM client_locations WHERE client_org_id = v_ldh_main_id LIMIT 1;
    SELECT id INTO v_ldh_midden_loc_id FROM client_locations WHERE client_org_id = v_ldh_midden_id LIMIT 1;
    
    -- Verplaats sublocaties
    IF v_ldh_midden_loc_id IS NOT NULL AND v_ldh_main_loc_id IS NOT NULL THEN
      UPDATE client_sublocations 
      SET location_id = v_ldh_main_loc_id
      WHERE location_id = v_ldh_midden_loc_id;
    END IF;
    
    -- Verwijder Midden Nederland locations en organisatie
    DELETE FROM client_locations WHERE client_org_id = v_ldh_midden_id;
    DELETE FROM client_organizations WHERE id = v_ldh_midden_id;
    
    RAISE NOTICE 'Leger des Heils consolidatie voltooid';
  END IF;
END $$;
